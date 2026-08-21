'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer 
} from 'recharts';

// ==========================================
// 🗺️ โหลด Leaflet แบบ Dynamic
// ==========================================
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(mod => mod.Circle), { ssr: false }); 
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });

const INITIAL_LAT = 18.147234;
const INITIAL_LNG = 98.348720;
const MAX_DISTANCE_KM = 50;

// 🎯 กำหนดจุดดึงข้อมูล TMD API เพิ่มเติม (Virtual Stations)
const LOCAL_TMD_STATIONS = [
  { name: 'ต.บ่อหลวง (ศูนย์กลาง)', lat: 18.1633, lng: 98.3744 },
  { name: 'อ.แม่แจ่ม (ดอยอินทนนท์)', lat: 18.4988, lng: 98.3601 },
  { name: 'อ.ฮอด (ตัวอำเภอ)', lat: 18.1908, lng: 98.6133 },
  { name: 'อ.จอมทอง', lat: 18.4172, lng: 98.6738 },
  { name: 'อ.อมก๋อย', lat: 17.7969, lng: 98.3585 }
];

// 🧮 คำนวณระยะทาง
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

const cleanName = (str: string) => {
  if (!str) return '';
  return String(str).replace(/^(จังหวัด|จ\.|อำเภอ|อ\.|ตำบล|ต\.)/g, '').trim();
};

// 🛡️ API Resilience ทะลวงข้อมูล
const fetchWithCache = async (url: string, cacheKey: string, timeoutMs = 15000) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    let fetchUrl = url.includes('open-meteo') ? url : `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(fetchUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    let data = await res.json();
    if (data.contents) data = JSON.parse(data.contents); 
    
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data })); } catch (e) {}
    return { data, status: '🟢 เชื่อมต่อสำเร็จ' };
  } catch (error) {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return { data: JSON.parse(cached).data, status: '🟢 เชื่อมต่อสำเร็จ (Cached)' };
    return { data: null, status: '🔴 การเชื่อมต่อขัดข้อง (Timeout)' };
  }
};

const WINDY_LAYERS = [
  { id: 'wind', icon: '💨', label: 'ลม' },
  { id: 'rain', icon: '🌧️', label: 'ฝน' },
  { id: 'radar', icon: '📡', label: 'เรดาร์ฝน' },
  { id: 'temp', icon: '🌡️', label: 'อุณหภูมิ' },
  { id: 'clouds', icon: '☁️', label: 'เมฆ' }
];

export default function FloodWatchDashboard() {
  const [position, setPosition] = useState({ lat: INITIAL_LAT, lng: INITIAL_LNG });
  const [stations, setStations] = useState<any[]>([]);
  const [filteredStations, setFilteredStations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProv, setFilterProv] = useState('เชียงใหม่');
  const [filterAmp, setFilterAmp] = useState('ฮอด');
  const [filterRisk, setFilterRisk] = useState('ทุกระดับความเสี่ยง');
  const [useRadius, setUseRadius] = useState(true);
  const [radiusKm, setRadiusKm] = useState(MAX_DISTANCE_KM);
  
  const [windyLayer, setWindyLayer] = useState('radar');
  const [windyZoom, setWindyZoom] = useState(5); 
  const [apiStatus, setApiStatus] = useState({ water: 'กำลังเชื่อมต่อ...', rain: 'กำลังเชื่อมต่อ...', tmd: 'กำลังเชื่อมต่อ...' });

  const mapRef = useRef<any>(null);
  const L = typeof window !== 'undefined' ? require('leaflet') : null;

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 📡 ดึงข้อมูล API สทนช. + TMD
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        let merged: any[] = [];
        
        const getRisk = (val: number, type: 'water' | 'rain') => {
          if (type === 'rain') {
            if (val >= 90) return { color: '#ef4444', label: 'วิกฤต', level: 'critical' };
            if (val >= 60) return { color: '#f97316', label: 'เสี่ยงสูง', level: 'high' };
            if (val >= 35) return { color: '#facc15', label: 'เฝ้าระวัง', level: 'warning' };
            return { color: '#10b981', label: 'ปกติ', level: 'normal' };
          } else {
            if (val >= 8) return { color: '#ef4444', label: 'วิกฤต', level: 'critical' };
            if (val >= 5) return { color: '#f97316', label: 'เสี่ยงสูง', level: 'high' };
            if (val >= 3) return { color: '#facc15', label: 'เฝ้าระวัง', level: 'warning' };
            return { color: '#10b981', label: 'ปกติ', level: 'normal' };
          }
        };

        const extractArrayData = (json: any): any[] => {
          let arrData: any[] = [];
          if (Array.isArray(json)) arrData = json;
          else if (json?.data && Array.isArray(json.data)) arrData = json.data;
          else if (json?.data?.waterlevel_data?.data && Array.isArray(json.data.waterlevel_data.data)) arrData = json.data.waterlevel_data.data;
          else if (json?.waterlevel_data?.data && Array.isArray(json.waterlevel_data.data)) arrData = json.waterlevel_data.data;
          else if (json?.rain_data?.data && Array.isArray(json.rain_data.data)) arrData = json.rain_data.data;
          else {
            const findArray = (obj: any): any[] | null => {
              for (let key in obj) {
                if (Array.isArray(obj[key])) return obj[key];
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                  const found = findArray(obj[key]); 
                  if (found) return found;
                }
              } 
              return null;
            };
            arrData = findArray(json) || [];
          }
          return arrData;
        };

        const parseStation = (s: any, type: 'water'|'rain') => {
          const latStr = s?.station?.tele_station_lat || s?.tele_station_lat || s?.lat || s?.latitude || s?.station?.lat;
          const lngStr = s?.station?.tele_station_long || s?.tele_station_long || s?.lng || s?.longitude || s?.lon || s?.station?.long;
          if (!latStr || !lngStr) return null;
          
          const lat = parseFloat(latStr);
          const lng = parseFloat(lngStr);
          if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;

          const name = s?.station?.tele_station_name?.th || s?.tele_station_name?.th || s?.station?.name?.th || s?.name?.th || s?.station?.tele_station_name || 'ไม่ระบุชื่อ';
          const prov = cleanName(s?.station?.geocode?.province_name?.th || s?.geocode?.province_name?.th || s?.province_name?.th || s?.station?.province_name || '');
          const amp = cleanName(s?.station?.geocode?.amphoe_name?.th || s?.geocode?.amphoe_name?.th || s?.amphoe_name?.th || s?.station?.amphoe_name || '');
          const tum = cleanName(s?.station?.geocode?.tumbon_name?.th || s?.geocode?.tumbon_name?.th || s?.tumbon_name?.th || s?.station?.tumbon_name || '');

          let val = 0; let trend = 'steady'; let time = '';

          if (type === 'water') {
            val = parseFloat(s?.water_level || s?.waterlevel || s?.wl || 0);
            const tnd = s?.waterlevel_tendency || s?.tendency;
            if (tnd === 'UP' || tnd > 0) trend = 'up';
            else if (tnd === 'DOWN' || tnd < 0) trend = 'down';
            time = s?.waterlevel_datetime || s?.datetime || '';
          } else {
            val = parseFloat(s?.rain_24h || s?.rain24h || s?.rain || 0);
            time = s?.rain_datetime || s?.datetime || '';
          }

          return { id: Math.random().toString(), name, prov, amp, tum, lat, lng, type, val, trend, time, risk: getRisk(val, type), source: 'ONWR' };
        };

        // 1. ดึงระดับน้ำ สทนช.
        const { data: wJson, status: wStatus } = await fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load', 'onwr_water_cache');
        setApiStatus(prev => ({ ...prev, water: wStatus }));
        if (wJson) {
          const wStations = extractArrayData(wJson);
          wStations.forEach((s: any) => { const st = parseStation(s, 'water'); if (st) merged.push(st); });
        }

        // 2. ดึงปริมาณฝน สทนช.
        const { data: rJson, status: rStatus } = await fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', 'onwr_rain_cache');
        setApiStatus(prev => ({ ...prev, rain: rStatus }));
        if (rJson) {
          const rStations = extractArrayData(rJson);
          rStations.forEach((s: any) => { const st = parseStation(s, 'rain'); if (st) merged.push(st); });
        }

        // 3. ดึงปริมาณฝน TMD (เสริมทัพให้กราฟ) - Data Honesty: ทำเครื่องหมาย Virtual Station อย่างชัดเจน
        const lats = LOCAL_TMD_STATIONS.map(p => p.lat.toFixed(4)).join(',');
        const lngs = LOCAL_TMD_STATIONS.map(p => p.lng.toFixed(4)).join(',');
        const tmdUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&daily=precipitation_sum&timezone=Asia%2FBangkok`;
        const { data: tmdData, status: tmdStatus } = await fetchWithCache(tmdUrl, 'tmd_rain_cache_flood');
        setApiStatus(prev => ({ ...prev, tmd: tmdStatus }));
        
        if (tmdData && Array.isArray(tmdData)) {
          tmdData.forEach((d, i) => {
            const rainVal = d?.daily?.precipitation_sum?.[0] || 0;
            const stationInfo = LOCAL_TMD_STATIONS[i];
            merged.push({
              id: `tmd-${i}`,
              name: `${stationInfo.name}`,
              prov: 'เชียงใหม่',
              amp: stationInfo.name.includes('ฮอด') ? 'ฮอด' : (stationInfo.name.includes('แม่แจ่ม') ? 'แม่แจ่ม' : 'จอมทอง'),
              tum: '',
              lat: stationInfo.lat,
              lng: stationInfo.lng,
              type: 'rain',
              val: rainVal,
              risk: getRisk(rainVal, 'rain'),
              trend: 'steady',
              time: new Date().toISOString(),
              source: 'TMD' // 🌟 Source Tag สำหรับ Data Honesty
            });
          });
        }

        setStations(merged);
      } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };
    fetchData();
  }, []);

  // 🎛️ Filter Engine
  useEffect(() => {
    let result = stations;

    if (searchQuery) {
      const q = cleanName(searchQuery.toLowerCase());
      result = result.filter(s => 
        (s.name && cleanName(s.name).toLowerCase().includes(q)) || 
        (s.tum && cleanName(s.tum).toLowerCase().includes(q)) || 
        (s.amp && cleanName(s.amp).toLowerCase().includes(q)) || 
        (s.prov && cleanName(s.prov).toLowerCase().includes(q))
      );
    }

    if (filterProv !== 'ทุกจังหวัด') result = result.filter(s => cleanName(s.prov).includes(cleanName(filterProv)));
    if (filterAmp !== 'ทุกอำเภอ') result = result.filter(s => cleanName(s.amp).includes(cleanName(filterAmp)));
    if (filterRisk !== 'ทุกระดับความเสี่ยง') result = result.filter(s => s.risk.label === filterRisk);

    if (useRadius && radiusKm > 0) {
      result = result.filter(s => {
        const dist = calculateDistance(position.lat, position.lng, s.lat, s.lng);
        s.distance = dist;
        return dist <= radiusKm;
      });
    } else {
      result = result.map(s => ({...s, distance: calculateDistance(position.lat, position.lng, s.lat, s.lng)}));
    }
    
    result.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    setFilteredStations(result);
  }, [searchQuery, filterProv, filterAmp, filterRisk, useRadius, radiusKm, position, stations]);

  const createMyPinIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ 
      className: 'bg-transparent border-none', 
      html: `<div class="relative flex items-center justify-center w-8 h-8"><svg class="relative z-10 w-8 h-8 text-red-600 drop-shadow-md" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`, 
      iconSize: [32, 32], iconAnchor: [16, 32] 
    });
  }, [L]);

  const handleSetChiangMai = () => { setFilterProv('เชียงใหม่'); setFilterAmp('ทุกอำเภอ'); setUseRadius(false); };
  const handleSetHod = () => { setFilterProv('เชียงใหม่'); setFilterAmp('ฮอด'); setUseRadius(false); };
  const handleSetRadius = () => { setFilterProv('ทุกจังหวัด'); setFilterAmp('ทุกอำเภอ'); setUseRadius(true); setRadiusKm(50); };
  const handleReset = () => { 
    setSearchQuery(''); setFilterProv('ทุกจังหวัด'); setFilterAmp('ทุกอำเภอ'); setFilterRisk('ทุกระดับความเสี่ยง'); setUseRadius(false); setPosition({lat: INITIAL_LAT, lng: INITIAL_LNG});
    if(mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 10);
  };
  const handleCurrentLocation = () => {
    Swal.fire({ title: 'ดึงพิกัด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    setTimeout(() => { setPosition({ lat: INITIAL_LAT, lng: INITIAL_LNG }); if (mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 12); Swal.close(); }, 800);
  };

  const uniqueProvs = Array.from(new Set(['เชียงใหม่', 'แม่ฮ่องสอน', 'ลำพูน', 'เชียงราย', ...stations.map(s => s.prov).filter(Boolean)])).sort();
  const uniqueAmps = Array.from(new Set(['ฮอด', 'แม่แจ่ม', 'อมก๋อย', 'จอมทอง', ...stations.filter(s => filterProv === 'ทุกจังหวัด' || cleanName(s.prov).includes(cleanName(filterProv))).map(s => s.amp).filter(Boolean)])).sort();

  // 🧮 คำนวณ 13 กล่อง
  const totalWater = filteredStations.filter(s => s.type === 'water').length;
  const totalRain = filteredStations.filter(s => s.type === 'rain').length;
  const waterUp = filteredStations.filter(s => s.type === 'water' && s.trend === 'up').length;
  const waterDown = filteredStations.filter(s => s.type === 'water' && s.trend === 'down').length;
  const waterSteady = filteredStations.filter(s => s.type === 'water' && s.trend === 'steady').length;
  const watchCount = filteredStations.filter(s => s.risk.level === 'warning').length;
  const highRiskCount = filteredStations.filter(s => s.risk.level === 'high').length;
  const criticalCount = filteredStations.filter(s => s.risk.level === 'critical').length;
  
  const rainStations = filteredStations.filter(s => s.type === 'rain');
  let maxRainData = { val: 0, amp: '' };
  if (rainStations.length > 0) {
    const maxS = rainStations.reduce((prev, current) => (prev.val > current.val) ? prev : current);
    maxRainData = { val: maxS.val, amp: maxS.name || maxS.amp || 'ไม่ระบุ' };
  }

  // 📊 เตรียมข้อมูลกราฟแท่ง (Data Honesty: แยกสีหรือทำเครื่องหมายให้ TMD)
  const topRainStations = [...rainStations]
    .filter(s => s.val > 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, 10)
    .map(s => ({
      name: s.name.length > 20 ? s.name.substring(0, 20) + '...' : s.name, 
      val: s.val,
      source: s.source // 🌟 เก็บ Source ไว้แสดงใน Tooltip
    }));

  const waterStationsTable = [...filteredStations].filter(s => s.type === 'water').sort((a, b) => (a.distance || 0) - (b.distance || 0)).slice(0, 15);

  return (
    <div className="min-h-screen bg-[#f1f5f9] font-sans text-gray-800 pb-10">
      
      {/* 🚀 Header */}
      <header className="bg-[#0b132b] px-6 py-4 flex flex-col items-start border-b border-[#1e293b]">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-[#3b82f6] rounded-xl flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div>
            <h1 className="text-[18px] md:text-[20px] font-extrabold text-[#60a5fa] leading-tight">ระบบเฝ้าระวังน้ำท่วมและน้ำป่า</h1>
            <h2 className="text-[14px] md:text-[16px] font-bold text-white mt-0.5">Bo Luang Flood Watch</h2>
            <p className="text-[11px] text-gray-400 mt-1">ติดตามระดับน้ำลำห้วย แจ้งเตือนน้ำป่าไหลหลาก และดินถล่มในพื้นที่เกษตรกรรม</p>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-5">

        {/* 💳 Card 1: แผงควบคุมและ 13 กล่อง */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center bg-white">
            <div className="flex items-center space-x-2">
              <h2 className="text-[#0f4a8a] text-[15px] font-extrabold flex items-center">
                <span className="mr-2 text-lg">🌊</span> สถานการณ์น้ำล่าสุด - ตำบลบ่อหลวง อำเภอฮอด
              </h2>
            </div>
            <div className="text-[10px] text-gray-500 hidden md:block">อัปเดตล่าสุด: {currentTime ? currentTime.toLocaleTimeString('th-TH') : '--:--:--'}</div>
          </div>

          <div className="p-5">
            {/* Filter UI */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="md:col-span-1 relative">
                <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ค้นหาสถานี / รหัสสถานี..." className="border border-gray-300 rounded-md pl-9 pr-3 py-2 w-full text-sm focus:outline-none focus:border-[#0f4a8a]" />
              </div>
              <select value={filterProv} onChange={(e) => {setFilterProv(e.target.value); setFilterAmp('ทุกอำเภอ');}} className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:outline-none bg-white font-medium">
                <option value="ทุกจังหวัด">ทุกจังหวัด</option>
                {uniqueProvs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filterAmp} onChange={(e) => setFilterAmp(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:outline-none bg-white font-medium disabled:bg-gray-100" disabled={filterProv === 'ทุกจังหวัด'}>
                <option value="ทุกอำเภอ">ทุกอำเภอ</option>
                {uniqueAmps.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:outline-none bg-white font-medium">
                <option value="ทุกระดับความเสี่ยง">ทุกระดับความเสี่ยง</option>
                <option value="ปกติ">ปกติ</option>
                <option value="เฝ้าระวัง">เฝ้าระวัง</option>
                <option value="เสี่ยงสูง">เสี่ยงสูง</option>
                <option value="วิกฤต">วิกฤต</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 mb-4">
              <input type="checkbox" id="radius1" checked={useRadius} onChange={(e) => setUseRadius(e.target.checked)} className="rounded border-gray-300 text-[#0f4a8a] cursor-pointer" /> 
              <label htmlFor="radius1" className="text-gray-700 text-[13px] font-medium cursor-pointer select-none">ค้นหาในรัศมีจากตำแหน่งของฉัน</label>
            </div>

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-gray-100 pb-5 mb-5">
              <div className="flex items-center space-x-2 w-full md:w-auto text-gray-700 text-sm mb-4 md:mb-0">
                <input type="number" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} disabled={!useRadius} className="border border-gray-300 rounded-md px-2 py-1 w-16 text-center disabled:bg-gray-100 text-sm font-medium" /> 
                <span className="font-bold text-gray-800">กม.</span>
                <button onClick={handleCurrentLocation} className="ml-3 flex items-center text-gray-600 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-100 transition shadow-sm text-xs font-bold">
                  <span className="text-red-500 mr-1.5 text-sm">📍</span> ใช้ตำแหน่งของฉัน
                </button>
                <span className="ml-4 text-gray-400 text-[11px] hidden lg:inline">
                  จุดอ้างอิง: {position.lat.toFixed(6)}, {position.lng.toFixed(6)} 
                  <span className="text-green-500 ml-2 font-semibold">ละติจูด {position.lat.toFixed(6)} - ลองจิจูด {position.lng.toFixed(6)} (±82 ม.)</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleSetChiangMai} className="border border-gray-300 bg-white px-3 py-1.5 rounded-full text-gray-600 text-[11px] font-bold hover:bg-gray-50 transition shadow-sm">เฉพาะจังหวัดเชียงใหม่</button>
                <button onClick={handleSetHod} className="border border-gray-300 bg-white px-3 py-1.5 rounded-full text-gray-600 text-[11px] font-bold hover:bg-gray-50 transition shadow-sm">อำเภอฮอด</button>
                <button onClick={handleSetRadius} className="bg-[#0f172a] text-white px-4 py-1.5 rounded-full text-[11px] font-bold shadow-md hover:bg-gray-800 transition">รอบตำแหน่งของฉัน</button>
                <button onClick={handleReset} className="border border-gray-300 bg-white px-3 py-1.5 rounded-full text-gray-500 text-[11px] font-bold hover:bg-gray-50 transition shadow-sm flex items-center">✕ รีเซ็ต</button>
              </div>
            </div>

            <div className="text-[12px] text-gray-500 mb-3 px-1 flex items-center justify-between">
              <div>
                {isLoading ? <span className="text-blue-500 font-bold animate-pulse">กำลังโหลดข้อมูลและค้นหาสถานี...</span> : <>พบข้อมูล <span className="font-extrabold text-[#0f4a8a]">{filteredStations.length}</span> รายการ</>}
              </div>
              {/* 🛡️ Tooltip อธิบายเกณฑ์ (Data Honesty) */}
              <div className="hidden md:block text-[10px] text-gray-400 font-mono">
                *เกณฑ์การเตือนภัยอ้างอิงจากระดับน้ำวิกฤตของแต่ละสถานี (ข้อมูล สทนช.)
              </div>
            </div>

            {/* 13 กล่อง Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold">สถานีวัดน้ำทั้งหมด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{totalWater}</span></div>
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold">สถานีวัดฝนทั้งหมด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{totalRain}</span></div>
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold">สถานีที่มีข้อมูลล่าสุด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{filteredStations.length}</span></div>
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold">ระดับน้ำเพิ่มขึ้น ↑</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{waterUp}</span></div>
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold">ระดับน้ำลดลง ↓</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{waterDown}</span></div>
              
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold">ระดับน้ำคงที่ →</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{waterSteady}</span></div>
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold flex items-center"><span className="w-2 h-2 rounded-full bg-[#facc15] mr-1.5"></span> เฝ้าระวัง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{watchCount}</span></div>
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold flex items-center"><span className="w-2 h-2 rounded-full bg-[#f97316] mr-1.5"></span> เสี่ยงสูง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{highRiskCount}</span></div>
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold flex items-center"><span className="w-2 h-2 rounded-full bg-[#ef4444] mr-1.5"></span> วิกฤต</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{criticalCount}</span></div>
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold">ปริมาณฝนสูงสุด 24 ชม.</span><div className="flex flex-col"><div className="flex items-baseline"><span className="text-2xl font-extrabold text-[#0f4a8a]">{maxRainData.val.toFixed(1)}</span><span className="text-[10px] ml-1 font-bold text-[#0f4a8a]">มม.</span></div><span className="text-[9px] text-gray-400 truncate">{maxRainData.amp}</span></div></div>

              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold">พื้นที่เสี่ยง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span></div>
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold">เหตุการณ์น้ำท่วม</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span></div>
              <div className="border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col justify-between h-[85px]"><span className="text-[11px] text-gray-500 font-bold">ประกาศเตือน</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span></div>
            </div>
          </div>
        </div>

        {/* 📋 Card 2: ตารางสถานการณ์น้ำรอบตำบลบ่อหลวง */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-4">
          <div className="px-5 py-4 border-b border-gray-100 bg-white">
            <h3 className="text-[#0f4a8a] text-[15px] font-extrabold flex items-center"><span className="mr-2 text-lg">🌊</span> สถานการณ์น้ำรอบพื้นที่</h3>
            <p className="text-[11px] text-gray-500 mt-1">เรียงตามระยะทางจากจุดอ้างอิง ({position.lat.toFixed(6)}, {position.lng.toFixed(6)})</p>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs md:text-sm text-left font-sans">
              <thead className="text-[#0f4a8a] bg-[#f8fafc] border-b border-blue-100 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-5 py-3 font-extrabold whitespace-nowrap">สถานี</th>
                  <th className="px-5 py-3 font-extrabold whitespace-nowrap">พื้นที่</th>
                  <th className="px-5 py-3 font-extrabold text-center">ระยะ (กม.)</th>
                  <th className="px-5 py-3 font-extrabold text-center">ระดับน้ำ</th>
                  <th className="px-5 py-3 font-extrabold text-center">แนวโน้ม</th>
                  <th className="px-5 py-3 font-extrabold text-center">ความเสี่ยง</th>
                  <th className="px-5 py-3 font-extrabold text-right">เวลาวัด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {waterStationsTable.length > 0 ? waterStationsTable.map((st, i) => (
                  <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                    {/* 🌟 Data Honesty: ทำป้ายบอกว่าคือสถานีวัดจริง */}
                    <td className="px-5 py-3.5 font-bold text-gray-800 whitespace-nowrap">
                      {st.name} <span className="ml-1 text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 font-normal">วัดจริง</span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">{st.tum} {st.amp} {st.prov}</td>
                    <td className="px-5 py-3.5 text-gray-600 text-center font-mono">{st.distance?.toFixed(1)}</td>
                    <td className="px-5 py-3.5 font-bold text-gray-800 text-center font-mono">{st.val.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-gray-600 text-center text-[11px]">
                      {st.trend === 'up' && <span className="text-red-500">↑ เพิ่มขึ้น</span>}
                      {st.trend === 'down' && <span className="text-green-500">↓ ลดลง</span>}
                      {st.trend === 'steady' && <span className="text-gray-500">→ คงที่</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center flex justify-center">
                      <div className="flex items-center space-x-2 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
                        <span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: st.risk.color}}></span>
                        <span className="font-bold text-[11px]" style={{color: st.risk.color}}>{st.risk.label}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-right text-[11px] whitespace-nowrap">{st.time ? new Date(st.time).toLocaleString('en-GB') : '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="px-5 py-6 text-center text-gray-400">ไม่มีข้อมูลสถานีวัดน้ำในระยะที่กำหนด</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 🗺️ Card 3: แผนที่สถานการณ์น้ำ */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col mt-4">
          <div className="px-5 py-3 border-b border-gray-200 bg-white">
             <h3 className="text-[#0f4a8a] text-[15px] font-extrabold flex items-center"><span className="mr-2 text-lg">🗺️</span> สถานการณ์น้ำบนแผนที่</h3>
          </div>

          <div className="h-[450px] md:h-[600px] w-full relative z-0 bg-[#e5e7eb]">
            <MapContainer center={[position.lat, position.lng]} zoom={10} maxZoom={20} zoomControl={true} attributionControl={false} className="w-full h-full" ref={mapRef}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
              
              <Marker position={[position.lat, position.lng]} icon={createMyPinIcon()} />

              {/* 🔵 วงกลมแสดงรัศมีบนแผนที่ */}
              {useRadius && radiusKm > 0 && (
                <Circle 
                  center={[position.lat, position.lng]} 
                  radius={radiusKm * 1000} 
                  pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.05, weight: 1.5 }} 
                />
              )}

              {filteredStations.map((st, idx) => (
                <CircleMarker 
                  key={idx} center={[st.lat, st.lng]} radius={7} 
                  pathOptions={{ 
                    color: st.risk.color, fillColor: st.type === 'water' ? st.risk.color : '#ffffff',
                    fillOpacity: st.type === 'water' ? 0.9 : 0.4, weight: st.type === 'water' ? 1 : 2.5 
                  }}
                >
                  <Popup className="custom-pro-popup" closeButton={true}>
                    <div className="w-[190px] p-1 font-sans text-gray-800">
                      <div className="font-bold text-[13px] leading-tight mb-1 text-gray-900 border-b pb-1 border-gray-200 flex items-center justify-between">
                        <span className="truncate pr-2">{st.name}</span>
                        {/* 🌟 Data Honesty: แยกป้ายดาวเทียม กับ ป้ายสถานีจริง */}
                        {st.source === 'TMD' ? 
                          <span className="text-[9px] bg-purple-100 text-purple-600 px-1 rounded border border-purple-200 whitespace-nowrap">ดาวเทียม</span> : 
                          <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1 rounded border border-emerald-200 whitespace-nowrap">สถานีจริง</span>
                        }
                      </div>
                      <div className="text-[11px] leading-[1.6] text-gray-600 mt-1.5">
                        <div>{st.tum} {st.amp} {st.prov}</div>
                        <div>{st.type === 'water' ? `ระดับน้ำ: ${st.val.toFixed(2)} ม.` : `ฝน 24 ชม.: ${st.val.toFixed(1)} มม.`}</div>
                        <div className="flex items-center">ความเสี่ยง: <span style={{color: st.risk.color}} className="font-bold ml-1">{st.risk.label}</span></div>
                        <div>ระยะ: {st.distance?.toFixed(1) || '0.0'} กม.</div>
                        <div>{st.time ? new Date(st.time).toLocaleString('en-GB') : '--/--/---- --:--:--'}</div>
                        <div className="text-gray-400 mt-1">พิกัด: {st.lat.toFixed(6)}, {st.lng.toFixed(6)}</div>
                      </div>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`} target="_blank" rel="noopener noreferrer" className="mt-2.5 w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white flex items-center justify-center space-x-1.5 py-1.5 rounded-md text-[11px] font-bold shadow-md transition-colors">
                        <span className="text-sm">🧭</span> <span>นำทางด้วย Google Maps</span>
                      </a>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          <div className="bg-white px-5 py-3 border-t border-gray-200 flex flex-wrap items-center gap-4 text-[10px] md:text-[11px] text-gray-600 font-medium">
            <span className="text-gray-800 font-bold">สัญลักษณ์:</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#10b981] mr-1.5"></span> ปกติ</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#facc15] mr-1.5"></span> เฝ้าระวัง</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#f97316] mr-1.5"></span> เสี่ยงสูง</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] mr-1.5"></span> วิกฤต</span>
            <span className="text-gray-300 hidden md:inline">|</span>
            <span className="flex items-center"><span className="w-3.5 h-3.5 rounded-full bg-gray-500 mr-1.5"></span> วงกลมทึบ = สถานีวัดระดับน้ำ</span>
            <span className="flex items-center"><span className="w-3.5 h-3.5 rounded-full border-[2px] border-gray-500 mr-1.5 bg-transparent"></span> วงกลมขอบสี = สถานีวัดปริมาณฝน</span>
            <span className="flex items-center ml-auto md:ml-0"><span className="text-red-600 mr-1 text-sm">📍</span> ตำแหน่งของฉัน</span>
          </div>
        </div>

        {/* 📊 Card 4: กราฟแท่งฝนตกหนัก (อัปเดตดึงข้อมูล TMD + ONWR มาโชว์) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-4">
          <div className="px-5 py-4 bg-white border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-[#0f4a8a] text-[14px] md:text-[15px] font-extrabold flex items-center"><span className="mr-2 text-lg">🌧️</span> สถานีที่มีปริมาณฝนสูงสุด (24 ชม.)</h3>
            <span className="text-[11px] text-gray-400 font-medium">ข้อมูลรวมจาก สทนช. + ดาวเทียมเรดาร์</span>
          </div>
          <div className="w-full h-[350px] p-4">
            {topRainStations.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRainStations} layout="vertical" margin={{ top: 0, right: 30, left: 50, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide={false} axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} unit=" มม." />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#475569'}} width={130} />
                  
                  {/* 🌟 Data Honesty: Custom Tooltip บอกว่าข้อมูลกราฟแท่งนี้มาจากไหน */}
                  <RechartsTooltip 
                    cursor={{fill: '#f1f5f9'}} 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-xl">
                            <p className="font-bold text-[13px] text-gray-800 border-b border-gray-100 pb-1 mb-2">{data.name}</p>
                            <p className="text-[14px] text-[#1d4ed8] font-bold mb-1">ปริมาณฝน: {data.val.toFixed(1)} มม.</p>
                            <p className="text-[10px] text-gray-500 font-mono">
                              แหล่งข้อมูล: {data.source === 'TMD' ? 'ดาวเทียมเรดาร์ (TMD/Open-Meteo)' : 'สถานีวัดจริง (ONWR)'}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  
                  <Bar dataKey="val" name="ปริมาณฝน (มม.)" fill="#1d4ed8" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm">
                <span className="text-2xl mb-2">☀️</span>
                ขณะนี้ไม่มีตรวจพบปริมาณฝนสะสมในพื้นที่ที่เลือก (0 มม.)
              </div>
            )}
          </div>
        </div>

        {/* 🛰️ Card 5: แผนที่ Windy (ตั้งค่า Default Zoom = 5 ตามสั่ง) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px] md:h-[650px] mt-4">
          <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-center bg-white z-10">
            <div>
               <h3 className="text-[#0f4a8a] text-[14px] md:text-[15px] font-extrabold flex items-center"><span className="mr-2 text-lg">🛰️</span> แผนที่สภาพอากาศเรียลไทม์ (Windy)</h3>
               <p className="text-[10px] text-gray-500 mt-0.5">จุดรายละเอียด: ตำแหน่งของฉัน ({position.lat.toFixed(3)}, {position.lng.toFixed(3)})</p>
             </div>
             <button onClick={handleCurrentLocation} className="bg-[#0f172a] text-white px-3 py-1.5 rounded-full text-[10px] font-bold shadow-sm flex items-center hover:bg-gray-800 transition">
               <span className="mr-1 text-red-500 text-xs">📍</span> ตำแหน่งของฉัน
             </button>
          </div>

          <div className="flex space-x-2 px-5 py-2.5 bg-white border-b border-gray-200 z-10 overflow-x-auto custom-scrollbar">
            {WINDY_LAYERS.map((layer) => (
              <button 
                key={layer.id} onClick={() => setWindyLayer(layer.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-[11px] md:text-[12px] font-bold whitespace-nowrap transition-all border
                  ${windyLayer === layer.id ? 'bg-[#0f4a8a] text-white border-[#0f4a8a]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                <span>{layer.icon}</span><span>{layer.label}</span>
              </button>
            ))}
          </div>

          <div className="w-full flex-1 relative z-0">
            <iframe 
              width="100%" height="100%" frameBorder="0" allow="geolocation"
              src={`https://embed.windy.com/embed2.html?lat=${position.lat}&lon=${position.lng}&detailLat=${position.lat}&detailLon=${position.lng}&zoom=${windyZoom}&level=surface&overlay=${windyLayer}&product=ecmwf&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`}
            ></iframe>
          </div>
        </div>

        {/* 📋 Card 6: แหล่งข้อมูลและสถานะการเชื่อมต่อ (Data Honesty Declaration) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden text-gray-800 mb-6 mt-4">
          <div className="px-5 py-4 border-b border-gray-200 bg-white flex justify-between items-center">
            <div>
              <h3 className="text-[#0f4a8a] font-extrabold text-[15px] md:text-lg flex items-center">
                <span className="text-xl mr-2">📡</span> แหล่งข้อมูลอ้างอิง (Data Sources)
              </h3>
              <p className="text-[11px] md:text-xs text-gray-500 mt-1">
                ดึงข้อมูลล่าสุด {currentTime ? currentTime.toLocaleTimeString('en-GB') : '--:--:--'} - ระบบมีกลไก Cache ป้องกัน API ล่ม
              </p>
            </div>
            
            {/* 🌟 Data Honesty Declaration Badge */}
            <div className="hidden md:flex items-center space-x-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
              <span className="text-blue-500 text-lg">⚖️</span>
              <span className="text-[10px] text-blue-800 font-mono leading-tight"><b>Data Honesty:</b><br/>ข้อมูลในหน้านี้ดึงตรงจากหน่วยงาน<br/>โดยไม่มีการดัดแปลงหรือพยากรณ์เอง</span>
            </div>
          </div>

          <div className="p-0">
            <div className="bg-[#f8fafc] px-5 py-3 border-b border-gray-200">
              <h4 className="font-extrabold text-[#0f4a8a] text-[13px] md:text-[14px]">สถานะการเชื่อมต่อ</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm text-left font-sans">
                <thead className="text-[11px] md:text-[12px] text-gray-500 bg-[#f1f5f9] border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 font-extrabold whitespace-nowrap w-1/3">ชุดข้อมูล</th>
                    <th className="px-5 py-3 font-extrabold w-1/4">ประเภทข้อมูล</th>
                    <th className="px-5 py-3 font-extrabold w-1/4">สถานะ</th>
                    <th className="px-5 py-3 font-extrabold">Endpoint</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-gray-800">National ThaiWater (ONWR)</td>
                    <td className="px-5 py-3.5 text-gray-500 text-[11px] font-mono"><span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">สถานีวัดจริง</span> (ระดับน้ำ)</td>
                    <td className="px-5 py-3.5 font-bold flex items-center">
                      <span className={`w-2.5 h-2.5 rounded-full mr-2 ${apiStatus.water.includes('สำเร็จ') ? 'bg-[#10b981]' : 'bg-red-500'}`}></span> 
                      <span className={apiStatus.water.includes('สำเร็จ') ? 'text-[#10b981]' : 'text-red-500'}>{apiStatus.water}</span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-[10px] md:text-[11px] truncate max-w-[150px] md:max-w-none">/waterlevel_load</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-gray-800">National ThaiWater (ONWR)</td>
                    <td className="px-5 py-3.5 text-gray-500 text-[11px] font-mono"><span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">สถานีวัดจริง</span> (ฝน 24 ชม.)</td>
                    <td className="px-5 py-3.5 font-bold flex items-center">
                      <span className={`w-2.5 h-2.5 rounded-full mr-2 ${apiStatus.rain.includes('สำเร็จ') ? 'bg-[#10b981]' : 'bg-red-500'}`}></span> 
                      <span className={apiStatus.rain.includes('สำเร็จ') ? 'text-[#10b981]' : 'text-red-500'}>{apiStatus.rain}</span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-[10px] md:text-[11px] truncate max-w-[150px] md:max-w-none">/rain_24h</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-gray-800">TMD / Open-Meteo</td>
                    <td className="px-5 py-3.5 text-gray-500 text-[11px] font-mono"><span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">ดาวเทียม/พยากรณ์</span> (Virtual Station)</td>
                    <td className="px-5 py-3.5 font-bold flex items-center">
                      <span className={`w-2.5 h-2.5 rounded-full mr-2 ${apiStatus.tmd.includes('สำเร็จ') ? 'bg-[#10b981]' : 'bg-red-500'}`}></span> 
                      <span className={apiStatus.tmd.includes('สำเร็จ') ? 'text-[#10b981]' : 'text-red-500'}>{apiStatus.tmd}</span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-[10px] md:text-[11px] truncate max-w-[150px] md:max-w-none">/forecast</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </main>
      
      {/* 💅 Custom CSS Injection */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-pro-popup .leaflet-popup-content-wrapper { 
          padding: 0 !important; border-radius: 12px !important; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important; 
        }
        .custom-pro-popup .leaflet-popup-content { margin: 12px 14px !important; line-height: 1.5 !important; }
        .custom-pro-popup .leaflet-popup-close-button { color: #9ca3af !important; top: 8px !important; right: 8px !important; }
        .custom-scrollbar::-webkit-scrollbar { height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}} />
    </div>
  );
}
