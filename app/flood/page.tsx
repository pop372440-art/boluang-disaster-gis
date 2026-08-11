'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  ComposedChart, Bar, Line
} from 'recharts';

// ==========================================
// 🗺️ โหลด Leaflet แบบ Dynamic
// ==========================================
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// ==========================================
// 🌟 ข้อมูลจำลองบริบท: พื้นที่ภูเขา ต.บ่อหลวง
// ==========================================
const INITIAL_LAT = 18.1633;
const INITIAL_LNG = 98.3744;

const floodStatus = {
  level: 'warning', // normal, warning, danger
  title: 'เฝ้าระวังน้ำป่าไหลหลาก (ระดับสีเหลือง)',
  desc: 'ดินชุ่มน้ำสะสมสูง โปรดเฝ้าระวังพื้นที่ลาดเชิงเขาและที่นาติดลำน้ำ',
  water_level: 2.1, // เมตร (วิกฤตที่ 3.0)
  rain_acc_3days: 125.4, // มม.
  soil_moisture: 78 // % (ดินอุ้มน้ำเกิน 80% เสี่ยงดินถล่ม)
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
  { day: 'ย้อนหลัง 5 วัน', rain: 15, moisture: 45 },
  { day: 'ย้อนหลัง 4 วัน', rain: 42, moisture: 55 },
  { day: 'ย้อนหลัง 3 วัน', rain: 65, moisture: 65 },
  { day: 'ย้อนหลัง 2 วัน', rain: 30, moisture: 72 },
  { day: 'เมื่อวาน', rain: 85, moisture: 78 },
  { day: 'วันนี้', rain: 15, moisture: 78 },
];

const riskPoints = [
  { id: 1, name: 'สถานีวัดน้ำ ลำห้วยบ่อหลวง', lat: 18.1650, lng: 98.3750, type: 'water', val: '2.1 ม.' },
  { id: 2, name: 'พื้นที่เสี่ยงดินถล่ม บ้านพุย', lat: 18.1800, lng: 98.3600, type: 'landslide', val: 'ความชื้น 82%' },
  { id: 3, name: 'จุดเฝ้าระวังน้ำล้นตลิ่ง พื้นที่เกษตร', lat: 18.1550, lng: 98.3800, type: 'water', val: '1.8 ม.' }
];

export default function FloodDashboard() {
  const mapRef = useRef<any>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
          <div className="flex-1 flex flex-col md:flex-row md:items-center justify-between">
            <div>
              <h3 className="text-[#fcd34d] font-extrabold text-lg tracking-wide">{floodStatus.title}</h3>
              <p className="text-white/80 text-sm md:text-base font-medium mt-1">{floodStatus.desc}</p>
            </div>
            <div className="mt-3 md:mt-0 text-gray-400 font-mono text-[12px] md:text-sm text-right">
              อัปเดตล่าสุด: <span className="text-white font-bold">{currentTime ? currentTime.toLocaleTimeString('th-TH') : '--:--:--'}</span>
            </div>
          </div>
        </div>

        {/* 🍱 Bento Box Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">

          {/* 📦 กล่อง 1: ระดับน้ำในลำห้วย */}
          <div className="col-span-1 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 rounded-3xl border border-[#334155] shadow-lg relative overflow-hidden flex flex-col justify-center items-center text-center group hover:border-[#60a5fa]/50 transition-colors">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#60a5fa] rounded-full blur-[60px] opacity-10 group-hover:opacity-30 transition-opacity"></div>
            <h3 className="text-gray-400 font-bold text-sm tracking-widest mb-4">🌊 ระดับน้ำ (ลำห้วยหลัก)</h3>
            <div className="text-6xl font-extrabold text-[#60a5fa] mb-2">
              {floodStatus.water_level.toFixed(2)}<span className="text-2xl text-gray-400 ml-1">ม.</span>
            </div>
            <p className="text-xs text-gray-500 font-mono border-t border-[#1e293b] pt-3 mt-2 w-full">
              ระดับวิกฤต (ล้นตลิ่ง): <span className="text-red-400 font-bold">3.00 ม.</span>
            </p>
          </div>

          {/* 📦 กล่อง 2: ฝนสะสม 3 วัน (ตัวแปรหลักของน้ำป่า) */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center items-center text-center hover:border-[#60a5fa]/30 transition-colors">
            <h3 className="text-gray-400 font-bold text-sm tracking-widest mb-4">🌧️ ปริมาณฝนสะสม (3 วัน)</h3>
            <div className="text-5xl font-extrabold text-[#38bdf8] mb-2">
              {floodStatus.rain_acc_3days.toFixed(1)}<span className="text-2xl text-gray-400 ml-1">มม.</span>
            </div>
            <p className="text-xs text-gray-500 font-mono border-t border-[#1e293b] pt-3 mt-2 w-full">
              สถานะ: <span className="text-orange-400 font-bold">ฝนตกหนักต่อเนื่อง</span>
            </p>
          </div>

          {/* 📦 กล่อง 3: ความชื้นในดิน (ตัวแปรหลักของดินถล่ม) */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center items-center text-center hover:border-[#60a5fa]/30 transition-colors relative">
            <h3 className="text-gray-400 font-bold text-sm tracking-widest mb-4">⛰️ ความชื้นในดิน (ดินอุ้มน้ำ)</h3>
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* วงกลม Progress */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path className="text-[#1e293b]" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="text-[#f59e0b] animate-[spin_2s_ease-out]" strokeDasharray={`${floodStatus.soil_moisture}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div className="absolute text-3xl font-extrabold text-white">{floodStatus.soil_moisture}<span className="text-sm">%</span></div>
            </div>
            <p className="text-xs text-gray-500 font-mono border-t border-[#1e293b] pt-3 mt-4 w-full">
              จุดวิกฤตดินถล่ม: <span className="text-red-400 font-bold">> 80%</span>
            </p>
          </div>

          {/* 📦 กล่อง 4: กราฟระดับน้ำเทียบจุดวิกฤต (Area Chart) - กินพื้นที่ 2 คอลัมน์ */}
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
                  <Line type="step" name="ระดับวิกฤต (ล้นตลิ่ง)" dataKey="danger" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📦 กล่อง 5: กราฟฝนสะสม vs ความชื้นดิน (Composed Chart) */}
          <div className="col-span-1 bg-[#0f172a] p-5 md:p-6 rounded-3xl border border-[#334155] shadow-lg h-[350px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-lg mr-2">📊</span>
              <h3 className="text-white text-sm md:text-base font-bold">ความสัมพันธ์ฝนและดินอุ้มน้ำ</h3>
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

          {/* 📦 กล่อง 6: แผนที่จุดเฝ้าระวังพื้นที่เสี่ยง (Leaflet Map) - เต็มความกว้าง */}
          <div className="col-span-1 md:col-span-3 bg-[#0f172a] rounded-3xl border border-[#334155] shadow-lg flex flex-col overflow-hidden h-[450px]">
            <div className="bg-[#1e293b] px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between border-b border-[#334155]">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <span>📍</span> <span>พิกัดจุดเฝ้าระวังน้ำล้นตลิ่ง และ ดินถล่ม</span>
              </div>
              <div className="flex items-center space-x-4 mt-2 md:mt-0 text-[11px] font-bold">
                <span className="flex items-center text-[#60a5fa]"><span className="w-3 h-3 rounded-full bg-[#60a5fa] mr-1.5 opacity-80"></span> วัดระดับน้ำ</span>
                <span className="flex items-center text-[#ef4444]"><span className="w-3 h-3 rounded-full bg-[#ef4444] mr-1.5 opacity-80"></span> เสี่ยงดินถล่ม</span>
              </div>
            </div>
            
            <div className="flex-1 w-full relative z-0">
              <MapContainer center={[18.1650, 98.3700]} zoom={14} maxZoom={20} zoomControl={true} attributionControl={false} className="w-full h-full bg-[#0b132b]" ref={mapRef}>
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
                
                {riskPoints.map((pt) => (
                  <CircleMarker 
                    key={pt.id} 
                    center={[pt.lat, pt.lng]} 
                    radius={12} 
                    pathOptions={{ 
                      color: pt.type === 'water' ? '#60a5fa' : '#ef4444', 
                      fillColor: pt.type === 'water' ? '#60a5fa' : '#ef4444', 
                      fillOpacity: 0.6, 
                      weight: 3 
                    }}
                  >
                    <Popup>
                      <div className="p-1 min-w-[150px] text-center">
                        <div className="font-bold text-gray-800 text-[13px] border-b pb-1 mb-1">{pt.name}</div>
                        <div className={`font-extrabold text-lg ${pt.type === 'water' ? 'text-blue-600' : 'text-red-600'}`}>
                          {pt.val}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
