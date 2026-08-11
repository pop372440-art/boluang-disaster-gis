'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';

// ==========================================
// 🗺️ โหลด Leaflet แบบ Dynamic
// ==========================================
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });

// ==========================================
// 🌟 ข้อมูลจำลองสำหรับกราฟและการ์ด (ตามหน้า Weather)
// ==========================================
const INITIAL_LAT = 18.1633;
const INITIAL_LNG = 98.3744;

const staticFlood = {
  water_level: 2.1,
  soil_moisture: 78,
  rain_24h: 85.2,
  flow_rate: 15.5,
  status: 'เฝ้าระวัง',
};

const floodForecast = [
  { day: '00:00', waterLevel: 1.2, rain: 5 },
  { day: '04:00', waterLevel: 1.3, rain: 10 },
  { day: '08:00', waterLevel: 1.5, rain: 25 },
  { day: '12:00', waterLevel: 1.8, rain: 45 },
  { day: '16:00', waterLevel: 2.1, rain: 15 },
  { day: '20:00', waterLevel: 2.3, rain: 5 },
  { day: '24:00', waterLevel: 2.1, rain: 0 }
];

const WINDY_LAYERS = [
  { id: 'rain', icon: '🌧️', label: 'ฝน' },
  { id: 'radar', icon: '📡', label: 'เรดาร์ฝน' },
  { id: 'wind', icon: '💨', label: 'ลม' },
  { id: 'clouds', icon: '☁️', label: 'เมฆ' },
  { id: 'thunder', icon: '⚡', label: 'ฟ้าผ่า' }
];

// ==========================================
// 🚀 MAIN COMPONENT
// ==========================================
export default function FloodDashboard() {
  const [windyLayer, setWindyLayer] = useState('radar');
  const [windyZoom, setWindyZoom] = useState(7);
  const [searchQuery, setSearchQuery] = useState('');
  const [position, setPosition] = useState({ lat: INITIAL_LAT, lng: INITIAL_LNG });
  const [currentTime, setCurrentTime] = useState<Date | null>(null); 
  const [stations, setStations] = useState<any[]>([]);

  const mapRef = useRef<any>(null);
  const L = typeof window !== 'undefined' ? require('leaflet') : null;

  // ⏱️ นาฬิกา Real-time
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 📡 ดึงข้อมูล API สทนช. (ONWR) สำหรับปักหมุดบนแผนที่สถานการณ์น้ำ
  useEffect(() => {
    const fetchONWR = async () => {
      try {
        let merged: any[] = [];
        
        const getRisk = (val: number, type: 'water' | 'rain') => {
          if (type === 'rain') {
            if (val >= 90) return { color: '#ef4444', label: 'วิกฤต' };
            if (val >= 60) return { color: '#f97316', label: 'เสี่ยงสูง' };
            if (val >= 35) return { color: '#facc15', label: 'เฝ้าระวัง' };
            return { color: '#10b981', label: 'ปกติ' };
          } else {
            // สมมติฐานเกณฑ์ระดับน้ำเบื้องต้น
            if (val >= 8) return { color: '#ef4444', label: 'วิกฤต' };
            if (val >= 5) return { color: '#f97316', label: 'เสี่ยงสูง' };
            if (val >= 3) return { color: '#facc15', label: 'เฝ้าระวัง' };
            return { color: '#10b981', label: 'ปกติ' };
          }
        };

        // 1. ดึงระดับน้ำ
        try {
          const wRes = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
          if (wRes.ok) {
            const wData = await wRes.json();
            const wStations = wData.waterlevel_data?.data || wData.data || [];
            const filteredWater = wStations.filter((s:any) => s.station?.lat > 17 && s.station?.lat < 20 && s.station?.long > 97 && s.station?.long < 100);
            filteredWater.forEach((s: any) => {
              merged.push({
                id: s.station?.id, name: s.station?.tele_station_name?.th || 'สถานีวัดน้ำ', area: s.station?.geocode?.tumbon_name?.th || s.station?.geocode?.amphoe_name?.th || 'เชียงใหม่',
                lat: s.station?.lat, lng: s.station?.long, type: 'water', val: s.water_level || 0, risk: getRisk(s.water_level || 0, 'water'), time: s.waterlevel_datetime
              });
            });
          }
        } catch (e) {}

        // 2. ดึงฝน 24 ชม.
        try {
          const rRes = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h');
          if (rRes.ok) {
            const rData = await rRes.json();
            const rStations = rData.rain_data?.data || rData.data || [];
            const filteredRain = rStations.filter((s:any) => s.station?.lat > 17 && s.station?.lat < 20 && s.station?.long > 97 && s.station?.long < 100);
            filteredRain.forEach((s: any) => {
              merged.push({
                id: s.station?.id, name: s.station?.tele_station_name?.th || 'สถานีวัดฝน', area: s.station?.geocode?.tumbon_name?.th || s.station?.geocode?.amphoe_name?.th || 'เชียงใหม่',
                lat: s.station?.lat, lng: s.station?.long, type: 'rain', val: s.rain_24h || 0, risk: getRisk(s.rain_24h || 0, 'rain'), time: s.rain_datetime
              });
            });
          }
        } catch (e) {}

        if (merged.length === 0) {
          // ข้อมูลจำลองถ้า API ล่ม
          merged = [
            { id: '1', name: 'บ้านกิ่วลม', area: 'บ่อหลวง ฮอด เชียงใหม่', lat: 18.1500, lng: 98.3600, type: 'rain', val: 1.0, risk: { color: '#10b981', label: 'ปกติ' }, time: new Date().toISOString() },
            { id: '2', name: 'สถานีวัดน้ำ ห้วยบ่อหลวง', area: 'บ่อหลวง ฮอด', lat: 18.1650, lng: 98.3750, type: 'water', val: 5.2, risk: { color: '#f97316', label: 'เสี่ยงสูง' }, time: new Date().toISOString() }
          ];
        }
        setStations(merged);
      } catch (error) { console.error(error); }
    };
    fetchONWR();
  }, []);

  const createMyPinIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ 
      className: 'bg-transparent border-none', 
      html: `<div class="relative flex items-center justify-center w-6 h-6 group">
               <svg class="relative z-10 w-6 h-6 text-red-600 drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
             </div>`, 
      iconSize: [24, 24], iconAnchor: [12, 24] 
    });
  }, [L]);

  const handleSearchSubmit = (e: any) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ค้นหาสำเร็จ (จำลอง)', showConfirmButton: false, timer: 1500 });
  };

  const handleCurrentLocation = () => {
    Swal.fire({ title: 'กำลังดึงพิกัด...', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    setTimeout(() => {
      setPosition({ lat: INITIAL_LAT, lng: INITIAL_LNG });
      if (mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 12);
      Swal.close();
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#0b132b] text-white font-sans selection:bg-[#0ea5e9] selection:text-white pb-10">
      
      {/* 🚀 Header (ตามรูป image_ac5c96.png ลบเมนูที่ไม่ต้องการออก) */}
      <header className="bg-[#0f172a]/90 backdrop-blur-xl border-b border-[#1e293b] px-4 md:px-6 py-4 flex items-center sticky top-0 z-50 shadow-md">
        <Link href="/" className="w-10 h-10 md:w-12 md:h-12 bg-[#3b82f6] hover:bg-[#2563eb] rounded-xl flex items-center justify-center shadow-lg transition-colors mr-4 md:mr-6 cursor-pointer">
          {/* ไอคอน Refresh แบบในรูป */}
          <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </Link>
        <div className="flex text-[14px] md:text-[16px] font-bold">
          <span className="text-[#3b82f6] border-b-2 border-[#3b82f6] pb-1">สถานการณ์น้ำป่า/ดินถล่ม</span>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-[1400px] mx-auto mt-2 space-y-6">

        {/* 🚨 ป้ายแจ้งเตือน (โครงสร้างเดิม) */}
        <div className="bg-[#9f1239] rounded-2xl p-4 md:p-5 shadow-lg border border-red-500/30 flex items-start space-x-4 animate-pulse-slow">
          <div className="mt-1 w-6 h-6 rounded-full border-2 border-white flex-shrink-0 animate-ping"></div>
          <div>
            <h3 className="text-white font-extrabold text-lg tracking-wide">แจ้งเตือนสถานการณ์น้ำป่าและดินถล่ม</h3>
            <p className="text-white/90 text-sm md:text-base font-medium mt-1">ขณะนี้มีฝนตกหนักสะสมในพื้นที่ เสี่ยงเกิดน้ำป่าไหลหลาก โปรดระมัดระวังในการเดินทาง</p>
          </div>
        </div>

        {/* 🗺️ การ์ดใหม่: แผนที่สถานการณ์น้ำ (ตามรูป image_ac5cf5.jpg โทนสีสว่าง) */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden text-gray-800 font-sans">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-white">
             <div>
               <h3 className="text-[#0f4a8a] text-lg font-extrabold flex items-center"><span className="mr-2">🌊</span> แผนที่สถานการณ์น้ำ</h3>
               <p className="text-[10px] text-gray-500 mt-0.5">อัปเดตล่าสุด {currentTime ? currentTime.toLocaleTimeString('th-TH') : '--:--:--'}</p>
             </div>
             <button onClick={handleCurrentLocation} className="bg-[#0f4a8a] hover:bg-[#0b3665] text-white px-3 py-1.5 rounded-full text-[11px] font-bold transition flex items-center shadow-sm">
               <span className="mr-1 text-red-400">📍</span> ตำแหน่งของฉัน
             </button>
          </div>

          {/* แผงค้นหา (Filter UI) */}
          <div className="p-4 border-b border-gray-200 bg-gray-50/80 text-xs">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                <input type="text" placeholder="🔍 ค้นหาสถานี / รหัสสถานี / จังหวัด / อำเภอ / ตำบล / หน่วยงาน" className="md:col-span-2 border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none focus:border-[#0f4a8a]" />
                <select className="border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none"><option>ทุกจังหวัด</option></select>
                <select className="border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none"><option>ทุกระดับความเสี่ยง</option></select>
             </div>
             
             <div className="flex items-center space-x-2 mb-3">
                <input type="checkbox" id="radius" className="rounded border-gray-300 text-[#0f4a8a] focus:ring-[#0f4a8a]" /> 
                <label htmlFor="radius" className="text-gray-600 font-medium cursor-pointer">ค้นหาในรัศมีจากตำแหน่งของฉัน</label>
             </div>

             <div className="flex flex-col md:flex-row items-center justify-between">
                <div className="flex items-center space-x-2 w-full md:w-auto text-gray-600">
                   <input type="number" defaultValue={50} className="border border-gray-300 rounded-md px-2 py-1.5 w-16 focus:outline-none text-center" /> <span>กม.</span>
                   <span className="ml-2 flex items-center font-medium"><span className="text-red-500 mr-1 text-sm">📍</span> ใช้ตำแหน่งของฉัน</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 md:mt-0">
                   <button className="border border-gray-300 bg-white px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-100 transition">เฉพาะจังหวัดเชียงใหม่</button>
                   <button className="border border-gray-300 bg-white px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-100 transition">อำเภอฮอด</button>
                   <button className="bg-[#0f4a8a] hover:bg-[#0b3665] text-white px-4 py-1.5 rounded-md font-bold shadow transition">รอบตำแหน่งของฉัน</button>
                   <button className="border border-gray-300 bg-white px-3 py-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition flex items-center">✕ รีเซ็ต</button>
                </div>
             </div>
          </div>

          {/* แผนที่ (Map Area) */}
          <div className="h-[400px] md:h-[500px] w-full relative z-0">
            <MapContainer center={[18.1633, 98.3744]} zoom={9} maxZoom={20} zoomControl={true} attributionControl={false} className="w-full h-full" ref={mapRef}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
              
              <Marker position={[position.lat, position.lng]} icon={createMyPinIcon()} />

              {stations.map((st, idx) => (
                <CircleMarker 
                  key={idx} center={[st.lat, st.lng]} radius={7} 
                  pathOptions={{ 
                    color: st.risk.color, 
                    fillColor: st.type === 'water' ? st.risk.color : '#ffffff', // น้ำ = วงกลมทึบ, ฝน = วงกลมขอบสี
                    fillOpacity: st.type === 'water' ? 0.9 : 0.3, 
                    weight: st.type === 'water' ? 1 : 3 
                  }}
                >
                  {/* Popup แบบเดียวกับในรูปเป๊ะๆ */}
                  <Popup>
                    <div className="min-w-[180px] p-0.5 text-gray-800 font-sans">
                      <div className="font-extrabold text-[12px] mb-1 leading-tight">{st.name}</div>
                      <div className="text-[10px] leading-[1.4] mb-2 text-gray-600">
                        <div>{st.area}</div>
                        <div>{st.type === 'water' ? `ระดับน้ำ: ${st.val.toFixed(2)} ม.` : `ฝน 24 ชม.: ${st.val.toFixed(1)} มม.`}</div>
                        <div>ความเสี่ยง: <span style={{color: st.risk.color}} className="font-bold">{st.risk.label}</span></div>
                        <div>ระยะ: {(Math.random() * 30 + 1).toFixed(1)} กม.</div>
                        <div>{new Date(st.time).toLocaleString('th-TH')}</div>
                        <div className="text-gray-400 mt-1">พิกัด: {st.lat.toFixed(6)}, {st.lng.toFixed(6)}</div>
                      </div>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`} target="_blank" rel="noopener noreferrer" className="bg-[#0f4a8a] text-white flex items-center justify-center space-x-1 py-1.5 rounded text-[11px] font-bold shadow hover:bg-[#0b3665] transition">
                        <span>🧭 นำทางด้วย Google Maps</span>
                      </a>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          {/* สัญลักษณ์ (Legend ด้านล่าง) */}
          <div className="bg-white px-4 py-2 border-t border-gray-200 flex flex-wrap items-center gap-3 md:gap-4 text-[10px] md:text-[11px] font-bold text-gray-600">
            <span className="text-gray-800">สัญลักษณ์:</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#10b981] mr-1.5"></span> ปกติ</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#facc15] mr-1.5"></span> เฝ้าระวัง</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#f97316] mr-1.5"></span> เสี่ยงสูง</span>
            <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] mr-1.5"></span> วิกฤต</span>
            <span className="text-gray-300 hidden md:inline">|</span>
            <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-gray-500 mr-1.5"></span> วงกลมทึบ = สถานีวัดระดับน้ำ</span>
            <span className="flex items-center"><span className="w-3 h-3 rounded-full border-[2.5px] border-gray-500 mr-1.5 bg-transparent"></span> วงกลมขอบสี = สถานีวัดปริมาณฝน</span>
            <span className="flex items-center text-red-500 text-sm ml-auto md:ml-0">📍 <span className="text-gray-600 text-[10px] ml-1">ตำแหน่งของฉัน</span></span>
          </div>
        </div>

        {/* 🍱 Bento Box Grid Layout (4 กล่อง โครงสร้างเดิมของหน้า Weather) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 pt-2">
          {/* กล่อง 1: ระดับน้ำ */}
          <div className="col-span-1 md:col-span-1 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 rounded-3xl border border-[#334155] shadow-lg relative overflow-hidden flex flex-col justify-center items-center text-center group hover:border-[#38bdf8]/50 transition-colors">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#38bdf8] rounded-full blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
            <span className="text-6xl drop-shadow-lg mb-2 transform group-hover:scale-110 transition-transform">🌊</span>
            <div className="text-5xl font-extrabold text-white mb-1">{staticFlood.water_level.toFixed(1)}<span className="text-2xl text-gray-400">ม.</span></div>
            <p className="text-[#38bdf8] font-bold text-lg">ระดับน้ำลำห้วย</p>
          </div>

          {/* กล่อง 2: ความชื้นในดิน */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-between hover:border-[#38bdf8]/30 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-2 text-gray-400 font-bold text-sm tracking-widest">
                <span>⛰️</span> <span>SOIL MOISTURE</span>
              </div>
              <div className="px-2 py-1 rounded-md text-[10px] font-bold bg-orange-500/20 text-[#f97316]">เสี่ยงดินถล่ม</div>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-4xl font-extrabold text-[#f97316]">{staticFlood.soil_moisture}</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">% ความชื้นดิน</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-white">&gt; 80 <span className="text-xs text-gray-400">%</span></div>
                <div className="text-[10px] text-gray-500 mt-1">เกณฑ์อันตราย</div>
              </div>
            </div>
          </div>

          {/* กล่อง 3: ฝนสะสม 24 ชม. และ อัตราไหล */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center space-y-6 hover:border-[#38bdf8]/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center"><span className="text-blue-400 text-lg">🌧️</span></div>
                <div>
                  <div className="text-xs text-gray-400 font-bold">ฝนสะสม 24 ชม.</div>
                  <div className="text-xl font-extrabold text-white">{staticFlood.rain_24h.toFixed(1)} <span className="text-xs font-normal text-gray-500">มม.</span></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-cyan-500/10 rounded-full flex items-center justify-center"><span className="text-cyan-400 text-lg">🌊</span></div>
                <div>
                  <div className="text-xs text-gray-400 font-bold">อัตราการไหล</div>
                  <div className="text-xl font-extrabold text-white">{staticFlood.flow_rate.toFixed(1)} <span className="text-xs font-normal text-gray-500">ลบ.ม./วิ</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* กล่อง 4: สถานะ และ ระดับความเสี่ยง */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center space-y-6 hover:border-[#38bdf8]/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center"><span className="text-yellow-400 text-lg">⚠️</span></div>
                <div>
                  <div className="text-xs text-gray-400 font-bold">สถานะแจ้งเตือน</div>
                  <div className="text-xl font-extrabold text-[#facc15]">{staticFlood.status}</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-orange-500/10 rounded-full flex items-center justify-center"><span className="text-orange-400 text-lg">📊</span></div>
                <div>
                  <div className="text-xs text-gray-400 font-bold">ระดับความเสี่ยง</div>
                  <div className="text-xl font-extrabold text-white">สูง <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded ml-1">Level 3</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* 📈 กราฟ 1: แนวโน้มระดับน้ำ */}
          <div className="col-span-1 md:col-span-2 bg-[#0f172a] p-5 md:p-6 rounded-3xl border border-[#334155] shadow-lg h-[350px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-lg mr-2">📈</span>
              <h3 className="text-white text-sm md:text-base font-bold">แนวโน้มระดับน้ำ (ม.)</h3>
            </div>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={floodForecast} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff' }} />
                  <Area type="monotone" name="ระดับน้ำ" dataKey="waterLevel" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorWater)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📊 กราฟ 2: ปริมาณฝน */}
          <div className="col-span-1 md:col-span-2 bg-[#0f172a] p-5 md:p-6 rounded-3xl border border-[#334155] shadow-lg h-[350px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-lg mr-2">🌧️</span>
              <h3 className="text-white text-sm md:text-base font-bold">ปริมาณน้ำฝนสะสม (มม.)</h3>
            </div>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={floodForecast} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip cursor={{ fill: '#1e293b', opacity: 0.5 }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#0ea5e9', borderRadius: '12px', color: '#fff' }} />
                  <Bar name="ฝนสะสม" dataKey="rain" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 🗺️ แผนที่อากาศ Windy (Light Theme ตามรูปแบบหน้า Weather) */}
          <div className="col-span-1 md:col-span-4 bg-[#f8fafc] p-2 md:p-3 rounded-3xl border border-gray-300 shadow-xl flex flex-col mt-2 h-[600px] md:h-[700px]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-4 py-2 bg-transparent">
              <div className="flex items-center space-x-3">
                <span className="text-2xl drop-shadow-md">🛰️</span>
                <div className="flex flex-col">
                  <span className="text-gray-900 font-extrabold text-[15px] md:text-[18px] leading-tight tracking-wide">แผนที่อากาศเคลื่อนไหว (Windy)</span>
                  <span className="text-gray-500 font-medium text-[10px] md:text-[12px]">วิเคราะห์กลุ่มฝนและพายุ • ตำบลบ่อหลวง อำเภอฮอด จังหวัดเชียงใหม่</span>
                </div>
              </div>
              <div className="flex items-center space-x-2 mt-3 md:mt-0 bg-white rounded-full px-2 py-1 shadow-sm border border-gray-200">
                 <button onClick={() => setWindyZoom(Math.max(1, windyZoom - 1))} className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white text-[#0ea5e9] hover:bg-[#e0f2fe] flex items-center justify-center font-bold shadow-sm transition-colors">-</button>
                 <span className="text-[11px] md:text-xs font-mono text-gray-700 font-bold px-1 md:px-2">z{windyZoom}</span>
                 <button onClick={() => setWindyZoom(Math.min(20, windyZoom + 1))} className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white text-[#0ea5e9] hover:bg-[#e0f2fe] flex items-center justify-center font-bold shadow-sm transition-colors">+</button>
              </div>
            </div>

            <div className="flex space-x-2 overflow-x-auto custom-scrollbar px-4 py-3 w-full mb-1">
              {WINDY_LAYERS.map((layer) => (
                <button 
                  key={layer.id}
                  onClick={() => setWindyLayer(layer.id)}
                  className={`flex items-center space-x-1.5 px-4 py-2 rounded-full text-xs md:text-sm font-bold whitespace-nowrap transition-all duration-300 flex-shrink-0 border
                    ${windyLayer === layer.id 
                      ? 'bg-[#0f4a8a] text-white border-[#0f4a8a] shadow-md transform scale-105' 
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900 shadow-sm'
                    }`}
                >
                  <span className="text-sm md:text-base">{layer.icon}</span><span>{layer.label}</span>
                </button>
              ))}
            </div>

            <div className="w-full flex-1 rounded-2xl overflow-hidden relative border border-gray-200 shadow-inner">
              <iframe 
                width="100%" height="100%" frameBorder="0"
                src={`https://embed.windy.com/embed2.html?lat=${position.lat}&lon=${position.lng}&detailLat=${position.lat}&detailLon=${position.lng}&zoom=${windyZoom}&level=surface&overlay=${windyLayer}&product=ecmwf&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`}
              ></iframe>
            </div>
            <div className="px-4 py-2 flex justify-between items-center bg-transparent">
              <span className="text-[10px] md:text-xs text-gray-500 font-bold">💡 เลื่อนแถบเวลาด้านล่างแผนที่เพื่อดูพยากรณ์ล่วงหน้า</span>
              <a href={`https://www.windy.com/?${position.lat},${position.lng},${windyZoom}`} target="_blank" rel="noopener noreferrer" className="text-[10px] md:text-xs text-[#0ea5e9] font-bold bg-[#e0f2fe] px-3 py-1.5 rounded-lg">เปิดหน้าจอเต็มใน Windy.com ↗</a>
            </div>
          </div>

        </div>
      </main>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}} />
    </div>
  );
}
