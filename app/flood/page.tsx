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
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });

// ==========================================
// 🌟 ข้อมูลจำลอง (ปรับให้เข้ากับบริบทน้ำ/ดินถล่มบ่อหลวง)
// ==========================================
const INITIAL_LAT = 18.1633;
const INITIAL_LNG = 98.3744;

const staticFlood = {
  water_level: 2.1,
  soil_moisture: 78,
  rain_24h: 85.2,
  flow_rate: 15.5,
  status: 'เฝ้าระวัง',
  risk_color: '#facc15'
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

// เมนู Windy เฉพาะที่จำเป็นสำหรับน้ำป่า/ดินถล่ม
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
  const [locationName, setLocationName] = useState('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');
  const [currentTime, setCurrentTime] = useState<Date | null>(null); 

  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const L = typeof window !== 'undefined' ? require('leaflet') : null;

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
      iconSize: [32, 32], iconAnchor: [16, 32] 
    });
  }, [L]);

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
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        setPosition({ lat: newLat, lng: newLng });
        const parts = data[0].display_name.split(',').slice(0, 3).reverse().map((s: string) => s.trim()).join(' • ');
        setLocationName(parts || data[0].display_name);
        if (mapRef.current) mapRef.current.flyTo([newLat, newLng], 14, { duration: 1.5 });
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
      Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'เบราว์เซอร์ไม่รองรับ GPS', background: '#0f172a', color: '#fff' }); return;
    }
    Swal.fire({ title: 'กำลังดึงพิกัด...', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        setPosition({ lat: newLat, lng: newLng });
        fetchLocationName(newLat, newLng);
        if (mapRef.current) mapRef.current.flyTo([newLat, newLng], 14, { duration: 1.5 });
        Swal.close();
      },
      () => Swal.fire({ icon: 'error', title: 'ไม่สามารถระบุตำแหน่งได้', background: '#0f172a', color: '#fff' }),
      { enableHighAccuracy: true }
    );
  };

  const handleResetToCenter = () => {
    setPosition({ lat: INITIAL_LAT, lng: INITIAL_LNG });
    setLocationName('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');
    if (mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 14, { duration: 1.5 });
  };

  return (
    <div className="min-h-screen bg-[#0b132b] text-white font-sans selection:bg-[#0ea5e9] selection:text-white pb-10">
      
      {/* 🚀 Header (ตามรูป image_acc5b2.png) */}
      <header className="bg-[#0f172a]/90 backdrop-blur-xl border-b border-[#1e293b] px-4 md:px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center space-x-3 md:space-x-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-[#3b82f6] to-[#2563eb] rounded-xl flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div className="flex space-x-4 md:space-x-6 text-[13px] md:text-[15px] font-bold">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors">แดชบอร์ดหลัก</Link>
            <span className="text-[#3b82f6] border-b-2 border-[#3b82f6] pb-1">สถานการณ์น้ำป่า/ดินถล่ม</span>
            <Link href="/weather" className="text-gray-400 hover:text-white transition-colors">สภาพอากาศ</Link>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-[1400px] mx-auto mt-2 space-y-6">

        {/* 🚨 ป้ายแจ้งเตือน */}
        <div className="bg-[#9f1239] rounded-2xl p-4 md:p-5 shadow-lg border border-red-500/30 flex items-start space-x-4 animate-pulse-slow">
          <div className="mt-1 w-6 h-6 rounded-full border-2 border-white flex-shrink-0 animate-ping"></div>
          <div>
            <h3 className="text-white font-extrabold text-lg tracking-wide">แจ้งเตือนสถานการณ์น้ำป่าและดินถล่ม</h3>
            <p className="text-white/90 text-sm md:text-base font-medium mt-1">ขณะนี้มีฝนตกหนักสะสมในพื้นที่ เสี่ยงเกิดน้ำป่าไหลหลาก โปรดระมัดระวัง</p>
          </div>
        </div>

        {/* 🔍 แถบค้นหาพื้นที่ & ปุ่มควบคุม */}
        <div className="bg-[#e2e8f0] rounded-2xl p-3 md:p-4 shadow-inner flex flex-col md:flex-row md:items-end space-y-3 md:space-y-0 md:space-x-4 text-gray-800">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">ค้นหาพื้นที่ (ชื่อจังหวัด / อำเภอ / ตำบล / หมู่บ้าน)</label>
            <form onSubmit={handleSearchSubmit} className="relative">
              <input 
                type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="เช่น แม่แจ่ม, ฮอด, เชียงใหม่" 
                className="w-full bg-white border border-gray-300 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
              />
            </form>
          </div>
          <div className="flex space-x-2 md:space-x-3 w-full md:w-auto">
            <button onClick={handleResetToCenter} className="flex-1 md:flex-none bg-[#f1f5f9] hover:bg-[#e2e8f0] px-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 shadow-sm">
              <span>🏠</span> <span className="whitespace-nowrap">กลับบ่อหลวง</span>
            </button>
            <button onClick={handleCurrentLocation} className="flex-1 md:flex-none bg-[#bae6fd] hover:bg-[#7dd3fc] text-[#0369a1] px-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 shadow-sm">
              <span>📍</span> <span className="whitespace-nowrap">พิกัดปัจจุบัน</span>
            </button>
          </div>
        </div>

        {/* 🗺️ แผนที่ดาวเทียมเลือกพิกัด */}
        <div className="bg-[#0f172a] rounded-3xl border border-[#334155] shadow-lg overflow-hidden flex flex-col">
          <div className="bg-[#1e293b] px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between border-b border-[#334155]">
            <div className="flex items-center space-x-2 text-white font-bold text-sm">
              <span>🛰️</span> <span>แผนที่ดาวเทียม (คลิก / ลากหมุด เพื่อเลือกพิกัด)</span>
            </div>
            <div className="flex items-center mt-2 md:mt-0 text-xs font-mono">
              <a href={`https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`} target="_blank" rel="noopener noreferrer" className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-3 py-1.5 rounded-lg font-bold shadow-sm">
                เปิดใน Google Maps ↗
              </a>
            </div>
          </div>
          <div className="h-[300px] md:h-[400px] w-full relative z-0">
            <MapContainer center={[position.lat, position.lng]} zoom={14} maxZoom={20} zoomControl={true} attributionControl={false} className="w-full h-full bg-[#0b132b]" ref={mapRef}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
              <Marker draggable={true} position={[position.lat, position.lng]} icon={createPinIcon()} ref={markerRef} eventHandlers={{ dragend: handleMarkerDragEnd }} />
            </MapContainer>
          </div>
          <div className="bg-[#e2e8f0] px-4 py-2 text-[11px] md:text-xs text-gray-600 font-bold flex items-center">
            <span>💡 คลิกที่แผนที่หรือลากหมุด 📍 เพื่อปักตำแหน่งใหม่ ระบบจะดึงข้อมูลสถานการณ์ของจุดนั้นให้อัตโนมัติ</span>
          </div>
        </div>
        
        {/* 📍 แถบสถานะพื้นที่แบบ Real-time */}
        <div className="bg-[#1e293b] rounded-2xl p-4 shadow-lg border border-[#334155] flex flex-col md:flex-row items-center justify-between text-sm transition-all mt-4 mb-2">
          <div className="flex items-center space-x-2 text-gray-300 text-center md:text-left">
            <span className="text-red-400 text-lg animate-pulse">📍</span>
            <span className="font-bold whitespace-nowrap hidden sm:inline">พื้นที่ตรวจสอบสถานการณ์:</span>
            <span className="text-white font-medium">{locationName}</span>
          </div>
          <div className="flex items-center space-x-3 mt-3 md:mt-0 text-gray-400 font-mono text-[12px] md:text-sm">
            <span>พิกัด: <span className="text-[#38bdf8]">{position.lat.toFixed(4)}, {position.lng.toFixed(4)}</span></span>
            <span className="hidden md:inline">|</span>
            <span>อัปเดตล่าสุด: <span className="text-emerald-400 font-bold">{currentTime ? currentTime.toLocaleTimeString('th-TH') : '--:--:--'}</span></span>
          </div>
        </div>

        {/* 🍱 Bento Box Grid Layout (4 กล่องบน ตามรูปแบบ Weather เป๊ะๆ) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 pt-2">

          {/* กล่อง 1: ระดับน้ำ (ทรง Hero Card) */}
          <div className="col-span-1 md:col-span-1 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 rounded-3xl border border-[#334155] shadow-lg relative overflow-hidden flex flex-col justify-center items-center text-center group hover:border-[#38bdf8]/50 transition-colors">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#38bdf8] rounded-full blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
            <span className="text-6xl drop-shadow-lg mb-2 transform group-hover:scale-110 transition-transform">🌊</span>
            <div className="text-5xl font-extrabold text-white mb-1">{staticFlood.water_level.toFixed(1)}<span className="text-2xl text-gray-400">ม.</span></div>
            <p className="text-[#38bdf8] font-bold text-lg">ระดับน้ำลำห้วย</p>
          </div>

          {/* กล่อง 2: ความชื้นในดิน (ทรง AQI Card) */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-between hover:border-[#38bdf8]/30 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-2 text-gray-400 font-bold text-sm tracking-widest">
                <span>⛰️</span> <span>SOIL MOISTURE (ดินอุ้มน้ำ)</span>
              </div>
              <div className="px-2 py-1 rounded-md text-[10px] font-bold bg-orange-500/20 text-[#f97316]">เสี่ยงดินถล่ม</div>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-4xl font-extrabold text-[#f97316]">{staticFlood.soil_moisture}</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">% ความชื้นสะสม</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-white">&gt; 80 <span className="text-xs text-gray-400">%</span></div>
                <div className="text-[10px] text-gray-500 mt-1">เกณฑ์อันตราย</div>
              </div>
            </div>
          </div>

          {/* กล่อง 3: ฝนสะสม 24 ชม. และ อัตราไหล (ทรง ลม/ความชื้น) */}
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

          {/* กล่อง 4: สถานะ และ ระดับความเสี่ยง (ทรง ฝน/UV) */}
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

          {/* 📈 กราฟ 1: แนวโน้มระดับน้ำ (ทรง พยากรณ์อุณหภูมิ 7 วัน) */}
          <div className="col-span-1 md:col-span-2 bg-[#0f172a] p-5 md:p-6 rounded-3xl border border-[#334155] shadow-lg h-[350px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-lg mr-2">📈</span>
              <h3 className="text-white text-sm md:text-base font-bold">พยากรณ์และแนวโน้มระดับน้ำ (ม.)</h3>
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

          {/* 📊 กราฟ 2: ปริมาณฝน (ทรง พยากรณ์ปริมาณฝน 7 วัน) */}
          <div className="col-span-1 md:col-span-2 bg-[#0f172a] p-5 md:p-6 rounded-3xl border border-[#334155] shadow-lg h-[350px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-lg mr-2">🌧️</span>
              <h3 className="text-white text-sm md:text-base font-bold">ปริมาณน้ำฝนสะสมรายชั่วโมง (มม.)</h3>
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

          {/* 🗺️ แผนที่อากาศ Windy (Light Theme ตามรูปแบบหน้า Weather เป๊ะๆ) */}
          <div className="col-span-1 md:col-span-4 bg-[#f8fafc] p-2 md:p-3 rounded-3xl border border-gray-300 shadow-xl flex flex-col mt-2 h-[600px] md:h-[700px]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-4 py-2 bg-transparent">
              <div className="flex items-center space-x-3">
                <span className="text-2xl drop-shadow-md">🛰️</span>
                <div className="flex flex-col">
                  <span className="text-gray-900 font-extrabold text-[15px] md:text-[18px] leading-tight tracking-wide">แผนที่อากาศเคลื่อนไหว (Windy)</span>
                  <span className="text-gray-500 font-medium text-[10px] md:text-[12px] truncate w-[250px] md:w-auto">เรดาร์ฝน ลม เมฆ แบบเรียลไทม์ • {locationName}</span>
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

            <div className="flex flex-col md:flex-row items-center justify-between px-4 py-2.5 bg-transparent space-y-2 md:space-y-0">
               <div className="text-[10px] md:text-xs text-gray-500 font-bold flex items-center text-center md:text-left">
                 <span className="mr-1.5 text-orange-500 text-sm">💡</span> เลื่อนแถบเวลาด้านล่างแผนที่เพื่อดูพยากรณ์ล่วงหน้า
               </div>
               <a href={`https://www.windy.com/?${position.lat},${position.lng},${windyZoom}`} target="_blank" rel="noopener noreferrer" className="text-[10px] md:text-xs text-[#0ea5e9] hover:text-[#0284c7] font-bold flex items-center bg-[#e0f2fe]/60 px-3 py-1.5 rounded-lg transition-colors border border-[#bae6fd]">
                 เปิดหน้าจอเต็มใน Windy.com ↗
               </a>
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
