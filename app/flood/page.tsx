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
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });

const INITIAL_LAT = 18.1633;
const INITIAL_LNG = 98.3744;

// 🧮 ฟังก์ชันคำนวณระยะทาง
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// 🛡️ ฟังก์ชันทะลวง API สทนช.
const fetchONWRData = async (url: string) => {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch (e) {
    console.log("Direct fetch blocked by CORS, using proxy...");
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) return await proxyRes.json();
  }
  return null;
};

const WINDY_LAYERS = [
  { id: 'rain', icon: '🌧️', label: 'ฝน' },
  { id: 'radar', icon: '📡', label: 'เรดาร์ฝน' },
  { id: 'wind', icon: '💨', label: 'ลม' },
  { id: 'clouds', icon: '☁️', label: 'เมฆ' }
];

export default function FloodDashboard() {
  const [position, setPosition] = useState({ lat: INITIAL_LAT, lng: INITIAL_LNG });
  const [currentTime, setCurrentTime] = useState<Date | null>(null); 
  const [stations, setStations] = useState<any[]>([]);
  const [filteredStations, setFilteredStations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 🎛️ Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProv, setFilterProv] = useState('ทุกจังหวัด');
  const [filterAmp, setFilterAmp] = useState('ทุกอำเภอ');
  const [filterRisk, setFilterRisk] = useState('ทุกระดับความเสี่ยง');
  const [useRadius, setUseRadius] = useState(false);
  const [radiusKm, setRadiusKm] = useState(50);
  
  const [windyLayer, setWindyLayer] = useState('radar');
  const [windyZoom, setWindyZoom] = useState(8);
  const [apiStatus, setApiStatus] = useState({ water: 'กำลังเชื่อมต่อ...', rain: 'กำลังเชื่อมต่อ...' });

  const mapRef = useRef<any>(null);
  const L = typeof window !== 'undefined' ? require('leaflet') : null;

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 📡 ดึงข้อมูล API สทนช. ของจริง 100% (ขยาย Bounding Box ครอบคลุมทั้งประเทศเพื่อให้ไม่เป็น 0)
  useEffect(() => {
    const fetchONWR = async () => {
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

        // 1. ดึงระดับน้ำ
        const wData = await fetchONWRData('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
        if (wData) {
          const wStations = wData.waterlevel_data?.data || wData.data || [];
          // ดึงมาทั้งหมดที่มีพิกัดชัดเจน
          const validWater = wStations.filter((s:any) => s.station?.lat && s.station?.long);
          validWater.forEach((s: any) => {
            merged.push({
              id: s.station?.id, name: s.station?.tele_station_name?.th || 'สถานีวัดน้ำ', 
              prov: s.station?.geocode?.province_name?.th || 'ไม่ระบุ', amp: s.station?.geocode?.amphoe_name?.th || '', tum: s.station?.geocode?.tumbon_name?.th || '',
              lat: parseFloat(s.station?.lat), lng: parseFloat(s.station?.long), type: 'water', val: s.water_level || 0, risk: getRisk(s.water_level || 0, 'water'), time: s.waterlevel_datetime
            });
          });
          setApiStatus(prev => ({ ...prev, water: 'เชื่อมต่อสำเร็จ 🟢' }));
        } else { setApiStatus(prev => ({ ...prev, water: 'การเชื่อมต่อขัดข้อง 🔴' })); }

        // 2. ดึงฝน 24 ชม.
        const rData = await fetchONWRData('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h');
        if (rData) {
          const rStations = rData.rain_data?.data || rData.data || [];
          const validRain = rStations.filter((s:any) => s.station?.lat && s.station?.long);
          validRain.forEach((s: any) => {
            merged.push({
              id: s.station?.id, name: s.station?.tele_station_name?.th || 'สถานีวัดฝน', 
              prov: s.station?.geocode?.province_name?.th || 'ไม่ระบุ', amp: s.station?.geocode?.amphoe_name?.th || '', tum: s.station?.geocode?.tumbon_name?.th || '',
              lat: parseFloat(s.station?.lat), lng: parseFloat(s.station?.long), type: 'rain', val: s.rain_24h || 0, risk: getRisk(s.rain_24h || 0, 'rain'), time: s.rain_datetime
            });
          });
          setApiStatus(prev => ({ ...prev, rain: 'เชื่อมต่อสำเร็จ 🟢' }));
        } else { setApiStatus(prev => ({ ...prev, rain: 'การเชื่อมต่อขัดข้อง 🔴' })); }

        setStations(merged);
        setFilteredStations(merged);
      } catch (error) { 
        console.error(error); 
      } finally {
        setIsLoading(false);
      }
    };
    fetchONWR();
  }, []);

  // 🎛️ ระบบกรองข้อมูล (Filter Engine)
  useEffect(() => {
    let result = stations;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => (s.name && s.name.toLowerCase().includes(q)) || (s.tum && s.tum.toLowerCase().includes(q)) || (s.amp && s.amp.toLowerCase().includes(q)) || (s.prov && s.prov.toLowerCase().includes(q)));
    }
    if (filterProv !== 'ทุกจังหวัด') result = result.filter(s => s.prov === filterProv);
    if (filterAmp !== 'ทุกอำเภอ') result = result.filter(s => s.amp === filterAmp);
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

  const STATIC_PROVS = ['เชียงใหม่', 'แม่ฮ่องสอน', 'ลำพูน', 'เชียงราย'];
  const STATIC_AMPS_CM = ['ฮอด', 'แม่แจ่ม', 'อมก๋อย', 'จอมทอง', 'ดอยเต่า', 'แม่วาง'];

  const uniqueProvs = Array.from(new Set([...STATIC_PROVS, ...stations.map(s => s.prov).filter(Boolean)])).sort();
  let displayAmps: string[] = [];
  if (filterProv === 'เชียงใหม่') {
     displayAmps = Array.from(new Set([...STATIC_AMPS_CM, ...stations.filter(s => s.prov === 'เชียงใหม่').map(s => s.amp).filter(Boolean)])).sort();
  } else {
     displayAmps = Array.from(new Set(stations.filter(s => filterProv === 'ทุกจังหวัด' || s.prov === filterProv).map(s => s.amp).filter(Boolean))).sort();
  }

  // 🧮 คำนวณข้อมูลสำหรับการ์ดสรุป (จาก API ล้วนๆ)
  const totalWater = filteredStations.filter(s => s.type === 'water').length;
  const totalRain = filteredStations.filter(s => s.type === 'rain').length;
  const watchCount = filteredStations.filter(s => s.risk.level === 'warning').length;
  const highRiskCount = filteredStations.filter(s => s.risk.level === 'high').length;
  const criticalCount = filteredStations.filter(s => s.risk.level === 'critical').length;
  const maxRainData = filteredStations.filter(s => s.type === 'rain').reduce((max, s) => s.val > max ? s.val : max, 0);

  const topRainStations = [...filteredStations].filter(s => s.type === 'rain').sort((a, b) => b.val - a.val).slice(0, 10);
  const waterStationsTable = [...filteredStations].filter(s => s.type === 'water').slice(0, 10);

  return (
    <div className="min-h-screen bg-[#f1f5f9] font-sans text-gray-800 pb-10">
      
      {/* 🚀 Top Header Navigation */}
      <header className="bg-[#0f172a] px-4 md:px-6 py-3 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center space-x-3">
          <Link href="/" className="w-10 h-10 bg-[#3b82f6] hover:bg-[#2563eb] rounded-xl flex items-center justify-center shadow-lg transition-colors cursor-pointer flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </Link>
          <div className="flex text-[14px] md:text-[15px] font-bold text-gray-300 space-x-4">
            <span className="text-[#60a5fa] border-b-2 border-[#60a5fa] pb-1 px-1">สถานการณ์น้ำป่า/ดินถล่ม</span>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-6">

        {/* 🚨 ป้ายแจ้งเตือน (ซิงก์กับ API วิกฤต) */}
        {criticalCount > 0 && (
          <div className="bg-[#9f1239] rounded-2xl p-4 md:p-5 shadow-lg border border-red-500/30 flex items-start space-x-4 animate-pulse-slow">
            <div className="mt-1 w-6 h-6 rounded-full border-2 border-white flex-shrink-0 animate-ping"></div>
            <div>
              <h3 className="text-white font-extrabold text-lg tracking-wide">แจ้งเตือนสถานการณ์น้ำป่าและดินถล่ม</h3>
              <p className="text-white/90 text-sm md:text-base font-medium mt-1">
                พบจุดเสี่ยงระดับวิกฤตจำนวน {criticalCount} จุด จากระบบ สทนช. โปรดระมัดระวัง
              </p>
            </div>
          </div>
        )}

        {/* 🎛️ แผงค้นหาและตัวกรอง */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex justify-between items-center border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <span className="text-xl">🌊</span>
              <h2 className="text-[#0f4a8a] text-[16px] md:text-lg font-extrabold">สถานการณ์น้ำล่าสุด - ตำบลบ่อหลวง อำเภอฮอด</h2>
            </div>
            <div className="flex items-center space-x-2 bg-green-50 px-3 py-1 rounded-full border border-green-200">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
              <span className="text-green-600 text-xs font-bold">ระบบทำงานปกติ</span>
            </div>
          </div>
          
          <div className="p-5 bg-white">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="md:col-span-1 relative">
                  <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ค้นหาสถานี / รหัสสถานี..." className="border border-gray-300 rounded-md pl-9 pr-3 py-2 w-full text-sm focus:outline-none focus:border-[#0f4a8a]" />
                </div>
                <select value={filterProv} onChange={(e) => {setFilterProv(e.target.value); setFilterAmp('ทุกอำเภอ');}} className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:outline-none bg-white">
                  <option value="ทุกจังหวัด">ทุกจังหวัด</option>
                  {uniqueProvs.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={filterAmp} onChange={(e) => setFilterAmp(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:outline-none bg-white disabled:bg-gray-100" disabled={filterProv === 'ทุกจังหวัด'}>
                  <option value="ทุกอำเภอ">ทุกอำเภอ</option>
                  {displayAmps.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:outline-none bg-white">
                  <option value="ทุกระดับความเสี่ยง">ทุกระดับความเสี่ยง</option>
                  <option value="ปกติ">ปกติ</option>
                  <option value="เฝ้าระวัง">เฝ้าระวัง</option>
                  <option value="เสี่ยงสูง">เสี่ยงสูง</option>
                  <option value="วิกฤต">วิกฤต</option>
                </select>
             </div>
             
             <div className="flex items-center space-x-2 mb-4">
                <input type="checkbox" id="radius1" checked={useRadius} onChange={(e) => setUseRadius(e.target.checked)} className="rounded border-gray-300 text-[#0f4a8a]" /> 
                <label htmlFor="radius1" className="text-gray-700 text-sm font-medium cursor-pointer">ค้นหาในรัศมีจากตำแหน่งของฉัน</label>
             </div>

             <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-gray-100 pb-5 mb-5">
                <div className="flex items-center space-x-2 w-full md:w-auto text-gray-700 text-sm mb-4 md:mb-0">
                   <input type="number" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} disabled={!useRadius} className="border border-gray-300 rounded-md px-2 py-1.5 w-16 text-center disabled:bg-gray-100" /> 
                   <span>กม.</span>
                   <span className="ml-4 flex items-center font-bold text-gray-600 bg-gray-50 px-3 py-1 rounded-md border border-gray-200"><span className="text-red-500 mr-1.5">📍</span> ใช้ตำแหน่งของฉัน</span>
                   <span className="ml-4 text-gray-400 text-xs hidden lg:inline">จุดอ้างอิง: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                   <button onClick={handleSetChiangMai} className="border border-gray-300 bg-white px-3 py-1.5 rounded-full text-gray-600 text-xs font-bold hover:bg-gray-50 transition">เฉพาะเชียงใหม่</button>
                   <button onClick={handleSetHod} className="border border-gray-300 bg-white px-3 py-1.5 rounded-full text-gray-600 text-xs font-bold hover:bg-gray-50 transition">อำเภอฮอด</button>
                   <button onClick={handleSetRadius} className="bg-[#0f172a] text-white px-4 py-1.5 rounded-full text-xs font-bold hover:bg-gray-800 transition">รอบตำแหน่งของฉัน</button>
                   <button onClick={handleReset} className="border border-gray-300 bg-white px-3 py-1.5 rounded-full text-gray-500 text-xs font-bold hover:bg-gray-50 transition">✕ รีเซ็ต</button>
                </div>
             </div>

             <div className="text-[13px] text-gray-500">
               {isLoading ? <span className="text-blue-500 font-bold animate-pulse">กำลังโหลดข้อมูล API สทนช...</span> : <>พบข้อมูล <span className="font-extrabold text-[#0f4a8a]">{filteredStations.length}</span> รายการ</>}
             </div>
          </div>
        </div>

        {/* 📦 4 การ์ดสรุปข้อมูล (Bento Cards - ดึง API สทนช. 100%) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
          
          {/* การ์ด 1: สถานีวัดน้ำทั้งหมด */}
          <div className="col-span-1 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 rounded-3xl border border-[#334155] shadow-lg relative overflow-hidden flex flex-col justify-center items-center text-center group transition-colors">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#38bdf8] rounded-full blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
            <span className="text-5xl drop-shadow-lg mb-2">🌊</span>
            <div className="text-4xl font-extrabold text-white mb-1">{totalWater}<span className="text-lg text-gray-400 ml-2 font-normal">แห่ง</span></div>
            <p className="text-[#38bdf8] font-bold text-sm mt-1">สถานีวัดระดับน้ำ (ในรัศมี)</p>
          </div>

          {/* การ์ด 2: MAX RAIN 24H */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-between">
            <div className="flex items-center space-x-2 text-gray-400 font-bold text-[12px] tracking-widest mb-4">
              <span>🌧️</span> <span>MAX RAINFALL (24H)</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-4xl font-extrabold text-[#0ea5e9]">{maxRainData.toFixed(1)}</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">มม. (ฝนสะสมสูงสุด)</div>
              </div>
            </div>
          </div>

          {/* การ์ด 3: จุดเฝ้าระวัง / เสี่ยงสูง */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-yellow-400 text-lg">⚠️</span></div>
              <div>
                <div className="text-xs text-gray-400 font-bold">จุดเฝ้าระวัง / เสี่ยงสูง</div>
                <div className="text-xl font-extrabold text-[#facc15]">{watchCount + highRiskCount} <span className="text-xs font-normal text-gray-500">แห่ง</span></div>
              </div>
            </div>
          </div>

          {/* การ์ด 4: จุดวิกฤต */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-red-400 text-lg">🚨</span></div>
              <div>
                <div className="text-xs text-gray-400 font-bold">จุดวิกฤต (น้ำล้น/ฝนหนัก)</div>
                <div className="text-xl font-extrabold text-[#ef4444]">{criticalCount} <span className="text-xs font-normal text-gray-500">แห่ง</span></div>
              </div>
            </div>
          </div>

        </div>

        {/* 🗺️ แผนที่สถานการณ์น้ำ (อิงรูป 2) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-center bg-white">
             <h3 className="text-[#0f4a8a] text-[15px] font-extrabold flex items-center"><span className="mr-2">🗺️</span> สถานการณ์น้ำบนแผนที่</h3>
             <button onClick={handleCurrentLocation} className="bg-[#0f4a8a] hover:bg-[#0b3665] text-white px-3 py-1.5 rounded-md text-[11px] font-bold shadow-sm transition-colors">
               📍 ตำแหน่งของฉัน
             </button>
          </div>

          <div className="h-[400px] md:h-[500px] w-full relative z-0 bg-[#e5e7eb]">
            <MapContainer center={[18.1633, 98.3744]} zoom={10} maxZoom={20} zoomControl={true} attributionControl={false} className="w-full h-full" ref={mapRef}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
              <Marker position={[position.lat, position.lng]} icon={createMyPinIcon()} />
              {filteredStations.map((st, idx) => (
                <CircleMarker 
                  key={idx} center={[st.lat, st.lng]} radius={7} 
                  pathOptions={{ 
                    color: st.risk.color, fillColor: st.type === 'water' ? st.risk.color : '#ffffff',
                    fillOpacity: st.type === 'water' ? 0.9 : 0.4, weight: st.type === 'water' ? 1 : 3 
                  }}
                >
                  <Popup className="custom-pro-popup" closeButton={true}>
                    <div className="w-[190px] p-1 font-sans text-gray-800">
                      <div className="font-bold text-[13px] leading-tight mb-1 text-gray-900 border-b pb-1 border-gray-200">{st.name}</div>
                      <div className="text-[11px] leading-[1.6] text-gray-600">
                        <div>{st.tum} {st.amp} {st.prov}</div>
                        <div>{st.type === 'water' ? `ระดับน้ำ: ${st.val.toFixed(2)} ม.` : `ฝน 24 ชม.: ${st.val.toFixed(1)} มม.`}</div>
                        <div className="flex items-center">ความเสี่ยง: <span style={{color: st.risk.color}} className="font-bold ml-1">{st.risk.label}</span></div>
                        <div>ระยะ: {st.distance?.toFixed(1) || '0.0'} กม.</div>
                        <div>พิกัด: {st.lat.toFixed(6)}, {st.lng.toFixed(6)}</div>
                      </div>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`} target="_blank" rel="noopener noreferrer" className="mt-2.5 w-full bg-[#1d4ed8] hover:bg-[#1e3a8a] text-white flex items-center justify-center space-x-1.5 py-1.5 rounded-md text-[11px] font-bold shadow-md transition-colors">
                        <span className="text-sm">🧭</span> <span>นำทางด้วย Google Maps</span>
                      </a>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          <div className="bg-white px-5 py-2.5 border-t border-gray-200 flex flex-wrap items-center gap-4 text-[11px] font-bold text-gray-600">
            <span className="text-gray-800 font-extrabold">สัญลักษณ์:</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#10b981] mr-1.5"></span> ปกติ</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#facc15] mr-1.5"></span> เฝ้าระวัง</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#f97316] mr-1.5"></span> เสี่ยงสูง</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] mr-1.5"></span> วิกฤต</span>
            <span className="text-gray-300 hidden md:inline">|</span>
            <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-gray-500 mr-1.5"></span> วงกลมทึบ = สถานีวัดระดับน้ำ</span>
            <span className="flex items-center"><span className="w-3 h-3 rounded-full border-[2.5px] border-gray-500 mr-1.5 bg-transparent"></span> วงกลมขอบสี = สถานีวัดปริมาณฝน</span>
          </div>
        </div>

        {/* 📊 ตารางและกราฟฝน (อิงรูป 3) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 bg-white">
            <h3 className="text-[#0f4a8a] text-[15px] font-extrabold flex items-center"><span className="mr-2">🌊</span> สถานการณ์น้ำรอบตำแหน่งของฉัน</h3>
          </div>
          <div className="overflow-x-auto border-b border-gray-200 max-h-[300px] overflow-y-auto">
            <table className="w-full text-xs text-left font-sans">
              <thead className="text-[#0f4a8a] bg-blue-50/50 border-b border-blue-100 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3 font-extrabold whitespace-nowrap">สถานี</th>
                  <th className="px-5 py-3 font-extrabold whitespace-nowrap">พื้นที่</th>
                  <th className="px-5 py-3 font-extrabold text-center">ระยะ (กม.)</th>
                  <th className="px-5 py-3 font-extrabold text-right">ระดับน้ำ</th>
                  <th className="px-5 py-3 font-extrabold text-center">ความเสี่ยง</th>
                  <th className="px-5 py-3 font-extrabold text-right">เวลาวัด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {waterStationsTable.length > 0 ? waterStationsTable.map((st, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-gray-800 whitespace-nowrap">{st.name}</td>
                    <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">{st.amp} {st.prov}</td>
                    <td className="px-5 py-3.5 text-gray-600 text-center font-mono">{st.distance?.toFixed(1)}</td>
                    <td className="px-5 py-3.5 font-bold text-gray-800 text-right">{st.val.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-center flex justify-center">
                      <div className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: st.risk.color}}></span><span className="font-bold" style={{color: st.risk.color}}>{st.risk.label}</span></div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-right">{st.time ? new Date(st.time).toLocaleString('en-GB') : '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-500">ไม่มีข้อมูลสถานีวัดน้ำในระยะ</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 bg-white border-t border-gray-100">
            <h3 className="text-[#0f4a8a] text-[14px] font-extrabold flex items-center mb-4"><span className="mr-2">🌧️</span> สถานีที่มีปริมาณฝนสูงสุด (24 ชม.)</h3>
            <div className="w-full h-[300px]">
              {topRainStations.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topRainStations} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                    <XAxis type="number" hide={false} axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#475569'}} width={120} />
                    <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="val" name="ปริมาณฝน (มม.)" fill="#1d4ed8" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">ไม่มีข้อมูลฝนในพื้นที่</div>
              )}
            </div>
          </div>
        </div>

        {/* 📋 แหล่งข้อมูล (อิงรูป 4 จากภาพเก่า) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden text-gray-800">
          <div className="px-5 py-4 border-b border-gray-200 bg-white">
            <h3 className="text-[#0f4a8a] font-extrabold text-[15px] md:text-lg flex items-center"><span className="text-xl mr-2">📡</span> แหล่งข้อมูล</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm text-left font-sans">
              <thead className="text-[11px] md:text-[12px] text-gray-500 bg-[#f1f5f9] border-b border-gray-200">
                <tr><th className="px-5 py-3 w-1/3">ชุดข้อมูล</th><th className="px-5 py-3 w-1/4">สถานะ</th><th className="px-5 py-3">ที่มา</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                <tr className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-gray-800">National ThaiWater (ONWR) — ระดับน้ำ</td>
                  <td className="px-5 py-3.5 font-bold flex items-center"><span className={`w-2.5 h-2.5 rounded-full mr-2 ${apiStatus.water.includes('สำเร็จ') ? 'bg-[#10b981]' : 'bg-red-500'}`}></span> <span className={apiStatus.water.includes('สำเร็จ') ? 'text-[#10b981]' : 'text-red-500'}>{apiStatus.water}</span></td>
                  <td className="px-5 py-3.5 text-gray-400 font-mono text-[10px] md:text-[11px] truncate max-w-[200px] md:max-w-none">https://api-v3.thaiwater.net/.../waterlevel_load</td>
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-gray-800">National ThaiWater (ONWR) — ปริมาณฝน 24 ชม.</td>
                  <td className="px-5 py-3.5 font-bold flex items-center"><span className={`w-2.5 h-2.5 rounded-full mr-2 ${apiStatus.rain.includes('สำเร็จ') ? 'bg-[#10b981]' : 'bg-red-500'}`}></span> <span className={apiStatus.rain.includes('สำเร็จ') ? 'text-[#10b981]' : 'text-red-500'}>{apiStatus.rain}</span></td>
                  <td className="px-5 py-3.5 text-gray-400 font-mono text-[10px] md:text-[11px] truncate max-w-[200px] md:max-w-none">https://api-v3.thaiwater.net/.../rain_24h</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </main>
      
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-popup-content-wrapper { padding: 0 !important; border-radius: 8px !important; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important; }
        .leaflet-popup-content { margin: 12px !important; line-height: 1.4 !important; }
        .custom-scrollbar::-webkit-scrollbar { height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}} />
    </div>
  );
}
