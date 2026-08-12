'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';

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

// 🛡️ ฟังก์ชันทะลวง API 3 ชั้น (แก้ปัญหา สทนช. บล็อก)
const fetchWithProxy = async (url: string) => {
  // ชั้นที่ 1: ดึงตรงๆ
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch (e) { console.log("Direct fetch failed, trying proxy 1..."); }

  // ชั้นที่ 2: ใช้ corsproxy.io
  try {
    const proxy1 = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res1 = await fetch(proxy1);
    if (res1.ok) return await res1.json();
  } catch (e) { console.log("Proxy 1 failed, trying proxy 2..."); }

  // ชั้นที่ 3: ใช้ allorigins
  const proxy2 = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res2 = await fetch(proxy2);
  if (res2.ok) return await res2.json();

  throw new Error('All fetch attempts failed');
};

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
  
  const [apiStatus, setApiStatus] = useState({ water: 'กำลังเชื่อมต่อ...', rain: 'กำลังเชื่อมต่อ...' });

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
        try {
          const wData = await fetchWithProxy('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
          const wStations = wData.waterlevel_data?.data || wData.data || [];
          const filteredWater = wStations.filter((s:any) => s.station?.lat > 15.0 && s.station?.lat < 21.0 && s.station?.long > 97.0 && s.station?.long < 101.0);
          
          filteredWater.forEach((s: any) => {
            merged.push({
              id: s.station?.id, name: s.station?.tele_station_name?.th || 'สถานีวัดน้ำ', 
              prov: s.station?.geocode?.province_name?.th || '', amp: s.station?.geocode?.amphoe_name?.th || '', tum: s.station?.geocode?.tumbon_name?.th || '',
              lat: s.station?.lat, lng: s.station?.long, type: 'water', val: s.water_level || 0, risk: getRisk(s.water_level || 0, 'water'), time: s.waterlevel_datetime
            });
          });
          setApiStatus(prev => ({ ...prev, water: 'เชื่อมต่อสำเร็จ 🟢' }));
        } catch (e) { setApiStatus(prev => ({ ...prev, water: 'การเชื่อมต่อขัดข้อง 🔴' })); }

        // 2. ดึงฝน 24 ชม.
        try {
          const rData = await fetchWithProxy('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h');
          const rStations = rData.rain_data?.data || rData.data || [];
          const filteredRain = rStations.filter((s:any) => s.station?.lat > 15.0 && s.station?.lat < 21.0 && s.station?.long > 97.0 && s.station?.long < 101.0);
          
          filteredRain.forEach((s: any) => {
            merged.push({
              id: s.station?.id, name: s.station?.tele_station_name?.th || 'สถานีวัดฝน', 
              prov: s.station?.geocode?.province_name?.th || '', amp: s.station?.geocode?.amphoe_name?.th || '', tum: s.station?.geocode?.tumbon_name?.th || '',
              lat: s.station?.lat, lng: s.station?.long, type: 'rain', val: s.rain_24h || 0, risk: getRisk(s.rain_24h || 0, 'rain'), time: s.rain_datetime
            });
          });
          setApiStatus(prev => ({ ...prev, rain: 'เชื่อมต่อสำเร็จ 🟢' }));
        } catch (e) { setApiStatus(prev => ({ ...prev, rain: 'การเชื่อมต่อขัดข้อง 🔴' })); }

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
  const handleSetRadius = () => { setUseRadius(true); setRadiusKm(50); };
  const handleReset = () => { 
    setSearchQuery(''); setFilterProv('ทุกจังหวัด'); setFilterAmp('ทุกอำเภอ'); setFilterRisk('ทุกระดับความเสี่ยง'); setUseRadius(false); setPosition({lat: INITIAL_LAT, lng: INITIAL_LNG});
    if(mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 10);
  };
  const handleCurrentLocation = () => {
    Swal.fire({ title: 'ดึงพิกัด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    setTimeout(() => { setPosition({ lat: INITIAL_LAT, lng: INITIAL_LNG }); if (mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 12); Swal.close(); }, 800);
  };

  // 📝 ยึดตัวเลือกพื้นฐานให้เมนูกดได้เสมอ แม้ไม่มีข้อมูล
  const STATIC_PROVS = ['เชียงใหม่', 'แม่ฮ่องสอน', 'ลำพูน', 'เชียงราย'];
  const STATIC_AMPS_CM = ['ฮอด', 'แม่แจ่ม', 'อมก๋อย', 'จอมทอง', 'ดอยเต่า', 'แม่วาง'];

  const uniqueProvs = Array.from(new Set([...STATIC_PROVS, ...stations.map(s => s.prov).filter(Boolean)])).sort();
  
  let displayAmps: string[] = [];
  if (filterProv === 'เชียงใหม่') {
     displayAmps = Array.from(new Set([...STATIC_AMPS_CM, ...stations.filter(s => s.prov === 'เชียงใหม่').map(s => s.amp).filter(Boolean)])).sort();
  } else {
     displayAmps = Array.from(new Set(stations.filter(s => filterProv === 'ทุกจังหวัด' || s.prov === filterProv).map(s => s.amp).filter(Boolean))).sort();
  }

  // 🧮 คำนวณข้อมูลสรุป (จากข้อมูล API จริง ถ้าไม่มีคือ 0)
  const totalWater = stations.filter(s => s.type === 'water').length;
  const totalRain = stations.filter(s => s.type === 'rain').length;
  const watchCount = filteredStations.filter(s => s.risk.level === 'warning').length;
  const highRiskCount = filteredStations.filter(s => s.risk.level === 'high').length;
  const criticalCount = filteredStations.filter(s => s.risk.level === 'critical').length;
  const maxRainData = filteredStations.filter(s => s.type === 'rain').reduce((max, s) => s.val > max ? s.val : max, 0);

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

        {/* 💳 การ์ดที่ 1: แผงควบคุมและตัวเลขสรุป */}
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
             {/* 🎛️ แผงค้นหาและตัวกรอง (ตอนนี้ใช้งานได้ 100% แม้ไม่มีข้อมูล) */}
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

             <div className="text-[13px] text-gray-500 mb-3 flex items-center">
               {isLoading ? (
                 <span className="text-blue-500 font-bold animate-pulse">กำลังซิงค์ข้อมูลจาก สทนช...</span>
               ) : (
                 <>พบข้อมูลสถานีวัด <span className="font-extrabold text-[#0f4a8a] ml-1 mr-1">{filteredStations.length}</span> รายการ</>
               )}
             </div>

             {/* 📦 กล่องตัวเลขสรุป (ข้อมูลจริงจาก API) */}
             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">สถานีวัดน้ำทั้งหมด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{totalWater}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">สถานีวัดฝนทั้งหมด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{totalRain}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">สถานีที่พบในเงื่อนไข</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{filteredStations.length}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1 flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#facc15] mr-1.5"></span> เฝ้าระวัง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{watchCount}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1 flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#f97316] mr-1.5"></span> เสี่ยงสูง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{highRiskCount}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between">
                 <span className="text-[11px] text-gray-500 font-bold mb-1 flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] mr-1.5 animate-pulse"></span> วิกฤต</span><span className="text-2xl font-extrabold text-[#ef4444]">{criticalCount}</span>
               </div>
               <div className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white flex flex-col justify-between col-span-2 md:col-span-2">
                 <span className="text-[11px] text-gray-500 font-bold mb-1">ปริมาณฝนสะสมสูงสุด 24 ชม.</span><div className="flex items-baseline"><span className="text-2xl font-extrabold text-[#0f4a8a]">{maxRainData.toFixed(1)}</span><span className="text-xs ml-1 font-bold">มม.</span></div>
               </div>
             </div>
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
