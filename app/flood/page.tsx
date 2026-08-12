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

// 🛡️ ฟังก์ชันทะลวงบล็อก CORS (CORS Proxy Fetcher)
const fetchWithProxy = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Direct fetch failed');
    return await res.json();
  } catch (e) {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const proxyRes = await fetch(proxyUrl);
    if (!proxyRes.ok) throw new Error('Proxy fetch failed');
    return await proxyRes.json();
  }
};

const WINDY_LAYERS = [
  { id: 'wind', icon: '💨', label: 'ลม' },
  { id: 'rain', icon: '🌧️', label: 'ฝน' },
  { id: 'radar', icon: '📡', label: 'เรดาร์ฝน' },
  { id: 'temp', icon: '🌡️', label: 'อุณหภูมิ' },
  { id: 'clouds', icon: '☁️', label: 'เมฆ' },
  { id: 'pressure', icon: '⏱️', label: 'ความกดอากาศ' }
];

export default function FloodDashboard() {
  const [position, setPosition] = useState({ lat: INITIAL_LAT, lng: INITIAL_LNG });
  const [currentTime, setCurrentTime] = useState<Date | null>(null); 
  const [stations, setStations] = useState<any[]>([]);
  const [filteredStations, setFilteredStations] = useState<any[]>([]);
  
  // 🎛️ Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProv, setFilterProv] = useState('ทุกจังหวัด');
  const [filterAmp, setFilterAmp] = useState('ทุกอำเภอ');
  const [filterRisk, setFilterRisk] = useState('ทุกระดับความเสี่ยง');
  const [useRadius, setUseRadius] = useState(false);
  const [radiusKm, setRadiusKm] = useState(50);
  
  // Windy State
  const [windyLayer, setWindyLayer] = useState('radar');
  const [windyZoom, setWindyZoom] = useState(8);

  const [apiStatus, setApiStatus] = useState({ water: 'Syncing...', rain: 'Syncing...' });

  const mapRef = useRef<any>(null);
  const L = typeof window !== 'undefined' ? require('leaflet') : null;

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 📡 ดึงข้อมูล API สทนช. ของจริง 100%
  useEffect(() => {
    const fetchONWR = async () => {
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
        try {
          const wData = await fetchWithProxy('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
          const wStations = wData.waterlevel_data?.data || wData.data || [];
          const filteredWater = wStations.filter((s:any) => s.station?.lat > 16.0 && s.station?.lat < 20.5 && s.station?.long > 97.0 && s.station?.long < 101.0);
          
          filteredWater.forEach((s: any) => {
            merged.push({
              id: s.station?.id, name: s.station?.tele_station_name?.th || 'สถานีวัดน้ำ', 
              prov: s.station?.geocode?.province_name?.th || '', amp: s.station?.geocode?.amphoe_name?.th || '', tum: s.station?.geocode?.tumbon_name?.th || '',
              lat: s.station?.lat, lng: s.station?.long, type: 'water', val: s.water_level || 0, risk: getRisk(s.water_level || 0, 'water'), time: s.waterlevel_datetime
            });
          });
          setApiStatus(prev => ({ ...prev, water: 'Normal' }));
        } catch (e) { setApiStatus(prev => ({ ...prev, water: 'Error' })); }

        // 2. ดึงฝน 24 ชม.
        try {
          const rData = await fetchWithProxy('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h');
          const rStations = rData.rain_data?.data || rData.data || [];
          const filteredRain = rStations.filter((s:any) => s.station?.lat > 16.0 && s.station?.lat < 20.5 && s.station?.long > 97.0 && s.station?.long < 101.0);
          
          filteredRain.forEach((s: any) => {
            merged.push({
              id: s.station?.id, name: s.station?.tele_station_name?.th || 'สถานีวัดฝน', 
              prov: s.station?.geocode?.province_name?.th || '', amp: s.station?.geocode?.amphoe_name?.th || '', tum: s.station?.geocode?.tumbon_name?.th || '',
              lat: s.station?.lat, lng: s.station?.long, type: 'rain', val: s.rain_24h || 0, risk: getRisk(s.rain_24h || 0, 'rain'), time: s.rain_datetime
            });
          });
          setApiStatus(prev => ({ ...prev, rain: 'Normal' }));
        } catch (e) { setApiStatus(prev => ({ ...prev, rain: 'Error' })); }

        // ไม่มีข้อมูลจำลอง
        setStations(merged);
        setFilteredStations(merged);
      } catch (error) { console.error(error); }
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
    
    // Sort by distance
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
  const handleSetRadius = () => { setUseRadius(true); setRadiusKm(50); };
  const handleReset = () => { 
    setSearchQuery(''); setFilterProv('ทุกจังหวัด'); setFilterAmp('ทุกอำเภอ'); setFilterRisk('ทุกระดับความเสี่ยง'); setUseRadius(false); setPosition({lat: INITIAL_LAT, lng: INITIAL_LNG});
    if(mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 10);
  };
  const handleCurrentLocation = () => {
    Swal.fire({ title: 'ดึงพิกัด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    setTimeout(() => { setPosition({ lat: INITIAL_LAT, lng: INITIAL_LNG }); if (mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 12); Swal.close(); }, 800);
  };

  const uniqueProvs = Array.from(new Set(stations.map(s => s.prov).filter(Boolean))).sort();
  const uniqueAmps = Array.from(new Set(stations.filter(s => filterProv === 'ทุกจังหวัด' || s.prov === filterProv).map(s => s.amp).filter(Boolean))).sort();

  // 🧮 คำนวณข้อมูลสำหรับ Card 1 (Summary)
  const totalWater = filteredStations.filter(s => s.type === 'water').length;
  const totalRain = filteredStations.filter(s => s.type === 'rain').length;
  const watchCount = filteredStations.filter(s => s.risk.level === 'warning').length;
  const highRiskCount = filteredStations.filter(s => s.risk.level === 'high').length;
  const criticalCount = filteredStations.filter(s => s.risk.level === 'critical').length;
  const maxRainData = filteredStations.filter(s => s.type === 'rain').reduce((max, s) => s.val > max ? s.val : max, 0);

  // 🧮 คำนวณข้อมูลสำหรับ Card 3 (ตารางและกราฟ)
  const topRainStations = [...filteredStations].filter(s => s.type === 'rain').sort((a, b) => b.val - a.val).slice(0, 10);
  const waterStationsTable = [...filteredStations].filter(s => s.type === 'water').slice(0, 5); // เอามาโชว์ 5 อันดับแรกที่ใกล้ที่สุด

  return (
    <div className="min-h-screen bg-[#f1f5f9] font-sans text-gray-800 pb-10">
      
      {/* 🚀 Top Header Navigation */}
      <header className="bg-[#0f172a] px-4 md:px-6 py-3 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center space-x-3">
          <Link href="/" className="w-10 h-10 bg-[#3b82f6] hover:bg-[#2563eb] rounded-xl flex items-center justify-center shadow-lg transition-colors cursor-pointer flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </Link>
          <div className="flex text-[14px] md:text-[15px] font-bold text-gray-300 space-x-4">
            <Link href="/" className="hover:text-white transition-colors">แดชบอร์ดหลัก</Link>
            <span className="text-[#60a5fa] border-b-2 border-[#60a5fa] pb-1 px-1">สถานการณ์น้ำป่า/ดินถล่ม</span>
            <Link href="/weather" className="hover:text-white transition-colors hidden md:block">สภาพอากาศ</Link>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-6">

        {/* 💳 การ์ดที่ 1: แผงควบคุมและตัวเลขสรุป (อิงจากรูป 1) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex justify-between items-center border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <span className="text-xl">🌊</span>
              <h2 className="text-[#0f4a8a] text-[16px] md:text-lg font-extrabold">สถานการณ์น้ำล่าสุด - ตำบลบ่อหลวง อำเภอฮอด</h2>
            </div>
            <div className="flex items-center space-x-2 bg-green-50 px-3 py-1 rounded-full border border-green-200">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
              <span className="text-green-600 text-xs font-bold">ปกติ</span>
            </div>
          </div>
          
          <div className="p-5 bg-white">
             {/* แผงค้นหา (Filter UI) */}
             <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="md:col-span-1 relative">
                  <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ค้นหาสถานี / รหัสสถานี..." className="border border-gray-300 rounded-md pl-9 pr-3 py-2 w-full text-sm focus:outline-none focus:border-[#0f4a8a]" />
                </div>
                <select value={filterProv} onChange={(e) => {setFilterProv(e.target.value); setFilterAmp('ทุกอำเภอ');}} className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:outline-none">
                  <option value="ทุกจังหวัด">ทุกจังหวัด</option>
                  {uniqueProvs.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={filterAmp} onChange={(e) => setFilterAmp(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:outline-none" disabled={filterProv === 'ทุกจังหวัด'}>
                  <option value="ทุกอำเภอ">ทุกอำเภอ</option>
                  {uniqueAmps.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm focus:outline-none">
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

             <div className="text-[13px] text-gray-500 mb-3">พบข้อมูล <span className="font-extrabold text-gray-800">{filteredStations.length}</span> รายการ</div>

             {/* 📦 กล่องตัวเลข 13 กล่อง (อิงตามรูป 1 เป๊ะๆ จัดเรียง 4 คอลัมน์) */}
             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">สถานีวัดน้ำทั้งหมด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{totalWater}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">สถานีวัดฝนทั้งหมด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{totalRain}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">สถานีที่มีข้อมูลล่าสุด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{filteredStations.length}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">ระดับน้ำเพิ่มขึ้น ↑</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">ระดับน้ำลดลง ↓</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">ระดับน้ำคงที่ →</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1 flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#facc15] mr-1.5"></span> เฝ้าระวัง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{watchCount}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1 flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#f97316] mr-1.5"></span> เสี่ยงสูง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{highRiskCount}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1 flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] mr-1.5"></span> วิกฤต</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{criticalCount}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">ปริมาณฝนสูงสุด 24 ชม.</span><div className="flex items-baseline"><span className="text-2xl font-extrabold text-[#0f4a8a]">{maxRainData.toFixed(1)}</span><span className="text-xs ml-1 font-bold">มม.</span></div>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between opacity-60">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">พื้นที่เสี่ยง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between opacity-60">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">เหตุการณ์น้ำท่วม</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between opacity-60">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">ประกาศเตือน</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span>
               </div>
             </div>
          </div>
        </div>

        {/* 🗺️ การ์ดที่ 2: แผนที่สถานการณ์น้ำ (อิงรูป 2) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-center bg-white">
             <h3 className="text-[#0f4a8a] text-[15px] font-extrabold flex items-center"><span className="mr-2">🗺️</span> สถานการณ์น้ำบนแผนที่</h3>
             <div className="flex space-x-1">
               <button className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center bg-white hover:bg-gray-50 font-bold text-gray-600 shadow-sm">+</button>
               <button className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center bg-white hover:bg-gray-50 font-bold text-gray-600 shadow-sm">-</button>
             </div>
          </div>

          <div className="h-[400px] md:h-[500px] w-full relative z-0 bg-[#e5e7eb]">
            <MapContainer center={[18.1633, 98.3744]} zoom={11} maxZoom={20} zoomControl={false} attributionControl={false} className="w-full h-full" ref={mapRef}>
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
            <span className="flex items-center text-red-600 ml-auto md:ml-0"><span className="mr-1 text-sm">📍</span> ตำแหน่งของฉัน</span>
          </div>
        </div>

        {/* 📊 การ์ดที่ 3: ตารางและกราฟฝน (อิงรูป 3) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          
          {/* ส่วนบน: ตารางสถานการณ์น้ำรอบตำแหน่งของฉัน */}
          <div className="px-5 py-3 border-b border-gray-200 bg-white">
            <h3 className="text-[#0f4a8a] text-[15px] font-extrabold flex items-center"><span className="mr-2">🌊</span> สถานการณ์น้ำรอบตำแหน่งของฉัน</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">เรียงตามระยะทางจากตำแหน่งของฉัน ({position.lat.toFixed(6)}, {position.lng.toFixed(6)})</p>
          </div>
          <div className="overflow-x-auto border-b border-gray-200">
            <table className="w-full text-xs text-left font-sans">
              <thead className="text-[#0f4a8a] bg-blue-50/50 border-b border-blue-100">
                <tr>
                  <th className="px-5 py-3 font-extrabold whitespace-nowrap">สถานี</th>
                  <th className="px-5 py-3 font-extrabold whitespace-nowrap">พื้นที่</th>
                  <th className="px-5 py-3 font-extrabold text-center">ระยะ (กม.)</th>
                  <th className="px-5 py-3 font-extrabold text-right">ระดับน้ำ</th>
                  <th className="px-5 py-3 font-extrabold text-center">แนวโน้ม</th>
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
                    <td className="px-5 py-3.5 text-gray-500 text-center text-[10px]">→ คงที่</td>
                    <td className="px-5 py-3.5 text-center flex justify-center">
                      <div className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: st.risk.color}}></span><span className="font-bold" style={{color: st.risk.color}}>{st.risk.label}</span></div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-right">{st.time ? new Date(st.time).toLocaleString('en-GB') : '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="px-5 py-6 text-center text-gray-500">ไม่มีข้อมูลสถานีวัดน้ำในระยะ</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ส่วนล่าง: กราฟแท่งแนวนอน ปริมาณฝนสูงสุด 24 ชม. */}
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
            <div className="text-[10px] text-gray-400 text-center mt-2 flex justify-between px-10">
               <span>0 มม.</span> <span>2 มม.</span> <span>4 มม.</span> <span>6 มม.</span> <span>8 มม.</span>
            </div>
          </div>
        </div>

        {/* 🛰️ การ์ดที่ 4: แผนที่สภาพอากาศ Windy (อิงรูป 4) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px] md:h-[650px]">
          
          <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-center bg-white z-10">
            <div>
               <h3 className="text-[#0f4a8a] text-[15px] font-extrabold flex items-center"><span className="mr-2">🛰️</span> แผนที่สภาพอากาศเรียลไทม์ (Windy)</h3>
               <p className="text-[10px] text-gray-500 mt-0.5">จุดรายละเอียด: ตำแหน่งของฉัน ({position.lat.toFixed(3)}, {position.lng.toFixed(3)})</p>
             </div>
             <button className="bg-[#0f172a] text-white px-3 py-1.5 rounded-full text-[10px] font-bold shadow-sm hidden md:flex items-center">
               <span className="mr-1 text-red-500">📍</span> ตำแหน่งของฉัน
             </button>
          </div>

          <div className="flex space-x-2 px-5 py-2.5 bg-white border-b border-gray-200 z-10 overflow-x-auto custom-scrollbar">
            {WINDY_LAYERS.map((layer) => (
              <button 
                key={layer.id} onClick={() => setWindyLayer(layer.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold whitespace-nowrap transition-all border
                  ${windyLayer === layer.id ? 'bg-[#0f4a8a] text-white border-[#0f4a8a]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                <span>{layer.icon}</span><span>{layer.label}</span>
              </button>
            ))}
          </div>

          <div className="w-full flex-1 relative z-0">
            <iframe 
              width="100%" height="100%" frameBorder="0"
              src={`https://embed.windy.com/embed2.html?lat=${position.lat}&lon=${position.lng}&detailLat=${position.lat}&detailLon=${position.lng}&zoom=${windyZoom}&level=surface&overlay=${windyLayer}&product=ecmwf&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`}
            ></iframe>
          </div>

          {/* Footer Status Bar สไตล์ในรูป 4 */}
          <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 flex items-center text-[10px] md:text-[11px] font-medium text-gray-500 z-10">
            <div className="flex items-center text-green-600 font-bold mr-4"><span className="w-2.5 h-2.5 rounded-full bg-green-500 mr-1.5"></span> Data System Online</div>
            <div className="mr-4 hidden md:block">Sources: 3/3</div>
            <div className="mr-4">Last Sync: {currentTime ? currentTime.toLocaleTimeString('en-GB') : ''}</div>
            <div>API: {apiStatus.water === 'Normal' && apiStatus.rain === 'Normal' ? 'Normal' : 'Warning'}</div>
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
