'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  ComposedChart, Bar, Line
} from 'recharts';

// ==========================================
// 🗺️ โหลด Leaflet แบบ Dynamic
// ==========================================
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// ==========================================
// 🌟 ข้อมูลจำลองบริบท: พื้นที่ภูเขา ต.บ่อหลวง
// ==========================================
const INITIAL_LAT = 18.1633;
const INITIAL_LNG = 98.3744;

const floodStatus = {
  level: 'warning', 
  title: 'เฝ้าระวังน้ำป่าไหลหลาก (ระดับสีเหลือง)',
  desc: 'ดินชุ่มน้ำสะสมสูง โปรดเฝ้าระวังพื้นที่ลาดเชิงเขาและที่นาติดลำน้ำ',
  water_level: 2.1, 
  rain_acc_3days: 125.4, 
  soil_moisture: 78 
};

const waterLevelData = [
  { time: '00:00', level: 1.2, danger: 3.0 },
  { time: '04:00', level: 1.3, danger: 3.0 },
  { time: '08:00', level: 1.5, danger: 3.0 },
  { time: '12:00', level: 1.8, danger: 3.0 },
  { time: '16:00', level: 2.1, danger: 3.0 },
  { time: '20:00', level: 2.3, danger: 3.0 },
  { time: '24:00', level: 2.1, danger: 3.0 },
];

const soilRainData = [
  { day: '5 วันก่อน', rain: 15, moisture: 45 },
  { day: '4 วันก่อน', rain: 42, moisture: 55 },
  { day: '3 วันก่อน', rain: 65, moisture: 65 },
  { day: '2 วันก่อน', rain: 30, moisture: 72 },
  { day: 'เมื่อวาน', rain: 85, moisture: 78 },
  { day: 'วันนี้', rain: 15, moisture: 78 },
];

const riskPoints = [
  { id: 1, name: 'สถานีวัดน้ำ ลำห้วยบ่อหลวง', lat: 18.1650, lng: 98.3750, type: 'water', val: '2.1 ม.' },
  { id: 2, name: 'พื้นที่เสี่ยงดินถล่ม บ้านพุย', lat: 18.1800, lng: 98.3600, type: 'landslide', val: 'ความชื้น 82%' },
  { id: 3, name: 'จุดเฝ้าระวังน้ำล้นตลิ่ง พื้นที่เกษตร', lat: 18.1550, lng: 98.3800, type: 'water', val: '1.8 ม.' }
];

export default function FloodDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [position, setPosition] = useState({ lat: INITIAL_LAT, lng: INITIAL_LNG });
  const [locationName, setLocationName] = useState('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  const mainMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const riskMapRef = useRef<any>(null);

  const L = typeof window !== 'undefined' ? require('leaflet') : null;

  // ⏱️ นาฬิกา Real-time
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 📍 สร้างไอคอนหมุดสีแดง
  const createPinIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ 
      className: 'bg-transparent border-none', 
      html: `<div class="relative flex items-center justify-center w-8 h-8 group">
               <div class="absolute inset-0 bg-red-500 rounded-full blur-[6px] opacity-50 group-hover:opacity-80 transition-opacity"></div>
               <svg class="relative z-10 w-8 h-8 text-red-500 drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
               </svg>
             </div>`, 
      iconSize: [32, 32], 
      iconAnchor: [16, 32] 
    });
  }, [L]);

  // ฟังก์ชันหาชื่อสถานที่จากพิกัด
  const fetchLocationName = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=th`);
      const data = await res.json();
      if (data && data.display_name) {
        const parts = data.display_name.split(',').slice(0, 3).reverse().map((s: string) => s.trim()).join(' • ');
        setLocationName(parts || data.display_name);
      }
    } catch (error) {
      console.error('Reverse geocoding failed', error);
    }
  };

  const handleMarkerDragEnd = () => {
    const marker = markerRef.current;
    if (marker != null) {
      const latlng = marker.getLatLng();
      setPosition({ lat: latlng.lat, lng: latlng.lng });
      fetchLocationName(latlng.lat, latlng.lng);
    }
  };

  const handleSearchSubmit = async (e: any) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    Swal.fire({ title: 'กำลังค้นหา...', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&accept-language=th`);
      const data = await res.json();
      
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);
        setPosition({ lat: newLat, lng: newLng });
        
        const parts = display_name.split(',').slice(0, 3).reverse().map((s: string) => s.trim()).join(' • ');
        setLocationName(parts || display_name);

        if (mainMapRef.current) mainMapRef.current.flyTo([newLat, newLng], 14, { duration: 1.5 });
        Swal.close();
      } else {
        Swal.fire({ icon: 'warning', title: 'ไม่พบสถานที่', text: 'กรุณาลองเปลี่ยนคำค้นหา', background: '#0f172a', color: '#fff' });
      }
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', background: '#0f172a', color: '#fff' });
    }
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'เบราว์เซอร์ไม่รองรับ GPS', background: '#0f172a', color: '#fff' }); 
      return;
    }
    Swal.fire({ title: 'กำลังดึงพิกัด...', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        setPosition({ lat: newLat, lng: newLng });
        fetchLocationName(newLat, newLng);
        
        if (mainMapRef.current) mainMapRef.current.flyTo([newLat, newLng], 14, { duration: 1.5 });
        Swal.close();
      },
      () => Swal.fire({ icon: 'error', title: 'ไม่สามารถระบุตำแหน่งได้', background: '#0f172a', color: '#fff' }),
      { enableHighAccuracy: true }
    );
  };

  const handleResetToCenter = () => {
    setPosition({ lat: INITIAL_LAT, lng: INITIAL_LNG });
    setLocationName('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');
    if (mainMapRef.current) mainMapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 14, { duration: 1.5 });
  };

  return (
    <div className="min-h-screen bg-[#0b132b] text-white font-sans selection:bg-[#3b82f6] selection:text-white pb-10">
      
      {/* 🚀 Header */}
      <header className="bg-[#0f172a]/90 backdrop-blur-xl border-b border-[#1e293b] px-4 md:px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center space-x-3 md:space-x-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-[#60a5fa] to-[#2563eb] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div>
            <h1 className="text-[16px] md:text-[20px] font-extrabold text-white leading-tight tracking-wide">ระบบเฝ้าระวังน้ำท่วมและน้ำป่า</h1>
            <p className="text-[11px] md:text-[13px] text-[#60a5fa] font-bold mt-0.5">Bo Luang Flood Watch</p>
          </div>
        </div>
        <Link href="/" className="flex items-center space-x-2 bg-[#1e293b] hover:bg-[#334155] border border-gray-700 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm">
          <span>⬅️</span> <span className="hidden md:inline">กลับหน้าแผนที่หลัก</span>
        </Link>
      </header>

      <main className="p-4 md:p-6 max-w-[1400px] mx-auto mt-2 space-y-6">

        {/* 🚨 ป้ายแจ้งเตือนสถานการณ์น้ำ */}
        <div className="bg-[#f59e0b]/10 border border-[#f59e0b]/50 rounded-2xl p-4 md:p-5 shadow-lg flex items-start space-x-4">
          <div className="mt-1 w-6 h-6 rounded-full bg-[#f59e0b] border-2 border-white flex-shrink-0 animate-pulse flex items-center justify-center">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <div className="flex-1">
            <h3 className="text-[#fcd34d] font-extrabold text-lg tracking-wide">{floodStatus.title}</h3>
            <p className="text-white/80 text-sm md:text-base font-medium mt-1">{floodStatus.desc}</p>
          </div>
        </div>

        {/* 🔍 แถบค้นหาพื้นที่ & ปุ่มควบคุม */}
        <div className="bg-[#e2e8f0] rounded-2xl p-3 md:p-4 shadow-inner flex flex-col md:flex-row md:items-end space-y-3 md:space-y-0 md:space-x-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">ค้นหาพื้นที่ (ชื่อจังหวัด / อำเภอ / ตำบล / หมู่บ้าน)</label>
            <form onSubmit={handleSearchSubmit} className="relative">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="เช่น พื้นที่เกษตรกรรม, ลำห้วย, บ้านพุย" 
                className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent shadow-sm"
              />
            </form>
          </div>
          <div className="flex space-x-2 md:space-x-3 w-full md:w-auto">
            <button 
              onClick={handleResetToCenter}
              className="flex-1 md:flex-none bg-[#f1f5f9] hover:bg-[#e2e8f0] text-gray-800 px-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-colors shadow-sm"
            >
              <span>🏠</span> <span className="whitespace-nowrap">กลับบ่อหลวง</span>
            </button>
            <button 
              onClick={handleCurrentLocation}
              className="flex-1 md:flex-none bg-[#bfdbfe] hover:bg-[#93c5fd] text-[#1d4ed8] px-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-colors shadow-sm"
            >
              <span>📍</span> <span className="whitespace-nowrap">พิกัดปัจจุบัน</span>
            </button>
          </div>
        </div>

        {/* 🗺️ แผนที่ดาวเทียมเลือกพิกัด */}
        <div className="bg-[#0f172a] rounded-3xl border border-[#334155] shadow-lg overflow-hidden flex flex-col">
          <div className="bg-[#1e293b] px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between border-b border-[#334155]">
            <div className="flex items-center space-x-2 text-white font-bold text-sm">
              <span>🛰️</span> <span>แผนที่ดาวเทียม (คลิก / ลากหมุด เพื่อวิเคราะห์จุดเสี่ยง)</span>
            </div>
            <div className="flex items-center mt-2 md:mt-0 text-xs font-mono">
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`} 
                target="_blank" rel="noopener noreferrer"
                className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm flex items-center space-x-1"
              >
                <span>เปิดใน Google Maps ↗</span>
              </a>
            </div>
          </div>
          
          <div className="h-[300px] md:h-[350px] w-full relative z-0">
            <MapContainer center={[position.lat, position.lng]} zoom={14} maxZoom={20} zoomControl={true} attributionControl={false} className="w-full h-full bg-[#0b132b]" ref={mainMapRef}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
              <Marker draggable={true} position={[position.lat, position.lng]} icon={createPinIcon()} ref={markerRef} eventHandlers={{ dragend: handleMarkerDragEnd }} />
            </MapContainer>
          </div>
          <div className="bg-[#e2e8f0] px-4 py-2 text-[11px] md:text-xs text-gray-600 font-bold flex items-center">
            <span>💡 ลากหมุด 📍 ไปยังพื้นที่เกษตรหรือแนวเชิงเขา เพื่อดูข้อมูลความชุ่มน้ำเฉพาะจุด</span>
          </div>
        </div>
        
        {/* 📍 แถบสถานะพื้นที่แบบ Real-time */}
        <div className="bg-[#1e293b] rounded-2xl p-4 shadow-lg border border-[#334155] flex flex-col md:flex-row items-center justify-between text-sm transition-all mt-4 mb-2">
          <div className="flex items-center space-x-2 text-gray-300 text-center md:text-left">
            <span className="text-blue-400 text-lg animate-pulse">📍</span>
            <span className="font-bold whitespace-nowrap hidden sm:inline">พื้นที่ประเมินความเสี่ยง:</span>
            <span className="text-white font-medium">{locationName}</span>
          </div>
          <div className="flex items-center space-x-3 mt-3 md:mt-0 text-gray-400 font-mono text-[12px] md:text-sm">
            <span>พิกัด: <span className="text-[#60a5fa]">{position.lat.toFixed(4)}, {position.lng.toFixed(4)}</span></span>
            <span className="hidden md:inline">|</span>
            <span>อัปเดตล่าสุด: <span className="text-emerald-400 font-bold">{currentTime ? currentTime.toLocaleTimeString('th-TH') : '--:--:--'}</span></span>
          </div>
        </div>

        {/* 🍱 Bento Box Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 pt-2">

          {/* 📦 กล่อง 1: Status (Hero Card) */}
          <div className="col-span-1 md:col-span-1 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 rounded-3xl border border-[#334155] shadow-lg relative overflow-hidden flex flex-col justify-center items-center text-center group hover:border-[#f59e0b]/50 transition-colors">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#f59e0b] rounded-full blur-[60px] opacity-10 group-hover:opacity-30 transition-opacity"></div>
            <span className="text-5xl drop-shadow-lg mb-3 transform group-hover:scale-110 transition-transform">⚠️</span>
            <div className="text-2xl font-extrabold text-[#fcd34d] mb-1">เฝ้าระวังน้ำป่า</div>
            <p className="text-gray-400 font-bold text-sm mt-1">แจ้งเตือนระดับสีเหลือง</p>
          </div>

          {/* 📦 กล่อง 2: ระดับน้ำในลำห้วย */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center items-center text-center hover:border-[#60a5fa]/30 transition-colors">
            <h3 className="text-gray-400 font-bold text-sm tracking-widest mb-4">🌊 ระดับน้ำ (ลำห้วย)</h3>
            <div className="text-5xl font-extrabold text-[#60a5fa] mb-2">
              {floodStatus.water_level.toFixed(2)}<span className="text-xl text-gray-400 ml-1">ม.</span>
            </div>
            <p className="text-xs text-gray-500 font-mono border-t border-[#1e293b] pt-3 mt-2 w-full">
              วิกฤตล้นตลิ่ง: <span className="text-red-400 font-bold">3.00 ม.</span>
            </p>
          </div>

          {/* 📦 กล่อง 3: ฝนสะสม 3 วัน */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center items-center text-center hover:border-[#38bdf8]/30 transition-colors">
            <h3 className="text-gray-400 font-bold text-sm tracking-widest mb-4">🌧️ ฝนสะสม (3 วัน)</h3>
            <div className="text-5xl font-extrabold text-[#38bdf8] mb-2">
              {floodStatus.rain_acc_3days.toFixed(1)}<span className="text-xl text-gray-400 ml-1">มม.</span>
            </div>
            <p className="text-xs text-gray-500 font-mono border-t border-[#1e293b] pt-3 mt-2 w-full">
              สถานะ: <span className="text-orange-400 font-bold">ฝนตกหนัก</span>
            </p>
          </div>

          {/* 📦 กล่อง 4: ความชื้นในดิน */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center items-center text-center hover:border-[#f59e0b]/30 transition-colors">
            <h3 className="text-gray-400 font-bold text-sm tracking-widest mb-2">⛰️ ดินชุ่มน้ำ</h3>
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path className="text-[#1e293b]" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="text-[#f59e0b] animate-[spin_2s_ease-out]" strokeDasharray={`${floodStatus.soil_moisture}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div className="absolute text-2xl font-extrabold text-white">{floodStatus.soil_moisture}<span className="text-sm">%</span></div>
            </div>
            <p className="text-xs text-gray-500 font-mono border-t border-[#1e293b] pt-3 mt-2 w-full">
              วิกฤตดินถล่ม: <span className="text-red-400 font-bold">&gt; 80%</span>
            </p>
          </div>

          {/* 📦 กล่อง 5: กราฟระดับน้ำเทียบจุดวิกฤต (Area Chart) */}
          <div className="col-span-1 md:col-span-2 bg-[#0f172a] p-5 md:p-6 rounded-3xl border border-[#334155] shadow-lg h-[350px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-lg mr-2">📈</span>
              <h3 className="text-white text-sm md:text-base font-bold">แนวโน้มระดับน้ำในลำห้วย (24 ชม.)</h3>
            </div>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={waterLevelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={[0, 4]} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff' }} />
                  <Area type="monotone" name="ระดับน้ำ (ม.)" dataKey="level" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorWater)" />
                  <Line type="step" name="ระดับวิกฤต" dataKey="danger" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📦 กล่อง 6: กราฟฝนสะสม vs ความชื้นดิน (Composed Chart) */}
          <div className="col-span-1 md:col-span-2 bg-[#0f172a] p-5 md:p-6 rounded-3xl border border-[#334155] shadow-lg h-[350px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-lg mr-2">📊</span>
              <h3 className="text-white text-sm md:text-base font-bold">ความสัมพันธ์ฝนสะสมและดินอุ้มน้ำ</h3>
            </div>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={soilRainData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="#38bdf8" fontSize={10} tickLine={false} axisLine={false} orientation="left" />
                  <YAxis yAxisId="right" stroke="#f59e0b" fontSize={10} tickLine={false} axisLine={false} orientation="right" domain={[0, 100]} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff' }} />
                  <Bar yAxisId="left" name="ฝนตก (มม.)" dataKey="rain" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={20} />
                  <Line yAxisId="right" type="monotone" name="ความชื้นดิน (%)" dataKey="moisture" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📦 กล่อง 7: แผนที่จุดเฝ้าระวังพื้นที่เสี่ยง (Leaflet Map) */}
          <div className="col-span-1 md:col-span-4 bg-[#0f172a] rounded-3xl border border-[#334155] shadow-lg flex flex-col overflow-hidden h-[450px] mt-2">
            <div className="bg-[#1e293b] px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between border-b border-[#334155]">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <span>📍</span> <span>พิกัดจุดเฝ้าระวังน้ำล้นตลิ่ง และ พื้นที่เสี่ยงดินถล่ม (ตามพิกัดที่ค้นหา)</span>
              </div>
              <div className="flex items-center space-x-4 mt-2 md:mt-0 text-[11px] font-bold">
                <span className="flex items-center text-[#60a5fa]"><span className="w-3 h-3 rounded-full bg-[#60a5fa] mr-1.5 opacity-80"></span> วัดระดับน้ำ</span>
                <span className="flex items-center text-[#ef4444]"><span className="w-3 h-3 rounded-full bg-[#ef4444] mr-1.5 opacity-80"></span> เสี่ยงดินถล่ม</span>
              </div>
            </div>
            
            <div className="flex-1 w-full relative z-0">
              <MapContainer center={[position.lat, position.lng]} zoom={13} maxZoom={20} zoomControl={true} attributionControl={false} className="w-full h-full bg-[#0b132b]" ref={riskMapRef}>
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
                
                {/* หมุดจำลองจุดเสี่ยงรอบๆ พิกัดที่ค้นหา */}
                <CircleMarker center={[position.lat + 0.005, position.lng + 0.005]} radius={12} pathOptions={{ color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: 0.6, weight: 3 }}>
                  <Popup><div className="font-bold text-center">สถานีวัดน้ำย่อย<br/><span className="text-blue-600 text-lg">1.5 ม.</span></div></Popup>
                </CircleMarker>
                <CircleMarker center={[position.lat - 0.008, position.lng - 0.003]} radius={12} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.6, weight: 3 }}>
                  <Popup><div className="font-bold text-center">จุดเสี่ยงดินถล่ม<br/><span className="text-red-600 text-lg">ชื้น 85%</span></div></Popup>
                </CircleMarker>
                <CircleMarker center={[position.lat + 0.002, position.lng - 0.010]} radius={12} pathOptions={{ color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: 0.6, weight: 3 }}>
                  <Popup><div className="font-bold text-center">พื้นที่ลุ่มต่ำเกษตร<br/><span className="text-blue-600 text-lg">2.2 ม.</span></div></Popup>
                </CircleMarker>
              </MapContainer>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
