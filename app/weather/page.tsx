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
// 🗺️ 1. โหลด Leaflet แบบ Dynamic
// ==========================================
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });

// ==========================================
// 🌟 2. ข้อมูลจำลอง & ฟังก์ชันเสริม
// ==========================================
const INITIAL_LAT = 18.1633;
const INITIAL_LNG = 98.3744;

const staticWeather = {
  temperature_2m: 26.5,
  wind_speed_10m: 12.5,
  relative_humidity_2m: 65,
  weather_code: 2, 
  rain_today: 0,
  uv_max: 7
};

const staticAqi = {
  us_aqi: 23,
  pm2_5: 12.5
};

const staticForecast = [
  { day: 'วันนี้', maxTemp: 28, minTemp: 18, rain: 0 },
  { day: 'พ.', maxTemp: 29, minTemp: 19, rain: 0 },
  { day: 'พฤ.', maxTemp: 30, minTemp: 19, rain: 5.2 },
  { day: 'ศ.', maxTemp: 27, minTemp: 18, rain: 12.5 },
  { day: 'ส.', maxTemp: 26, minTemp: 17, rain: 8.0 },
  { day: 'อา.', maxTemp: 28, minTemp: 18, rain: 2.0 },
  { day: 'จ.', maxTemp: 29, minTemp: 18, rain: 0 }
];

const WINDY_LAYERS = [
  { id: 'rain', icon: '🌧️', label: 'ฝน' },
  { id: 'radar', icon: '📡', label: 'เรดาร์ฝน' },
  { id: 'wind', icon: '💨', label: 'ลม' },
  { id: 'temp', icon: '🌡️', label: 'อุณหภูมิ' },
  { id: 'clouds', icon: '☁️', label: 'เมฆ' },
  { id: 'pressure', icon: '⏲️', label: 'ความกดอากาศ' },
  { id: 'thunder', icon: '⚡', label: 'ฟ้าผ่า' },
  { id: 'pm2p5', icon: '😷', label: 'PM2.5 / มลพิษ' }
];

const getWmoWeatherDesc = (code: number) => {
  const codes: Record<number, string> = { 0: 'แจ่มใส', 1: 'มีเมฆบางส่วน', 2: 'มีเมฆครึ้ม', 3: 'เมฆเป็นส่วนมาก', 45: 'มีหมอก', 48: 'หมอกหนา', 51: 'ฝนปรอยๆ', 61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง', 65: 'ฝนตกหนัก', 80: 'ฝนเป็นหย่อมๆ', 95: 'พายุฝนฟ้าคะนอง' };
  return codes[code] || 'ปกติ';
};

const getWeatherEmoji = (code: number) => {
  if (code === 0) return '☀️'; if (code === 1 || code === 2) return '🌤️'; if (code === 3) return '☁️'; if (code >= 45 && code <= 48) return '🌫️'; if (code >= 51 && code <= 67) return '🌧️'; if (code >= 80 && code <= 82) return '🌦️'; if (code >= 95) return '⛈️'; return '☀️';
};

const getAqiStatus = (aqi: number) => {
  if (aqi <= 50) return { text: 'ดีมาก', color: '#10b981', bg: 'bg-emerald-500/20' };
  if (aqi <= 100) return { text: 'ปานกลาง', color: '#facc15', bg: 'bg-yellow-500/20' };
  if (aqi <= 150) return { text: 'เริ่มมีผลกระทบ', color: '#f97316', bg: 'bg-orange-500/20' };
  return { text: 'มีผลกระทบ', color: '#ef4444', bg: 'bg-red-500/20' };
};

// ==========================================
// 🚀 3. MAIN COMPONENT
// ==========================================
export default function WeatherDashboard() {
  const [windyLayer, setWindyLayer] = useState('radar');
  const [windyZoom, setWindyZoom] = useState(5); 
  const [searchQuery, setSearchQuery] = useState('');
  const [position, setPosition] = useState({ lat: INITIAL_LAT, lng: INITIAL_LNG });
  const [locationName, setLocationName] = useState('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');
  const [currentTime, setCurrentTime] = useState<Date | null>(null); 

  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const aqiStatus = getAqiStatus(staticAqi.us_aqi);

  // ⏱️ Effect: นาฬิกาเดินแบบ Real-time ทุก 1 วินาที
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // สร้างไอคอนหมุดสีแดงสไตล์ Google Maps
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

  // ฟังก์ชันหาชื่อสถานที่จากพิกัด (บังคับภาษาไทย และจัดฟอร์แมตใช้ • คั่น)
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

  // 🖱️ Event: เมื่อลากหมุดเสร็จ
  const handleMarkerDragEnd = () => {
    const marker = markerRef.current;
    if (marker != null) {
      const latlng = marker.getLatLng();
      setPosition({ lat: latlng.lat, lng: latlng.lng });
      fetchLocationName(latlng.lat, latlng.lng);
    }
  };

  // 🔍 Event: ค้นหาจากช่อง Search
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

        if (mapRef.current) {
          mapRef.current.flyTo([newLat, newLng], 14, { duration: 1.5 });
        }
        Swal.close();
      } else {
        Swal.fire({ icon: 'warning', title: 'ไม่พบสถานที่', text: 'กรุณาลองเปลี่ยนคำค้นหา', background: '#0f172a', color: '#fff' });
      }
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', background: '#0f172a', color: '#fff' });
    }
  };

  // 📍 Event: หาตำแหน่งปัจจุบัน (GPS)
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'เบราว์เซอร์ไม่รองรับ GPS', background: '#0f172a', color: '#fff' }); 
      return;
    }
    Swal.fire({ 
      title: 'กำลังดึงพิกัด...', 
      text: 'หากใช้คอมพิวเตอร์ พิกัดอาจอิงตามอินเทอร์เน็ตของท่าน',
      allowOutsideClick: false, 
      background: '#0f172a', 
      color: '#fff', 
      didOpen: () => Swal.showLoading() 
    });
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        setPosition({ lat: newLat, lng: newLng });
        fetchLocationName(newLat, newLng);
        
        if (mapRef.current) {
          mapRef.current.flyTo([newLat, newLng], 14, { duration: 1.5 });
        }
        Swal.close();
      },
      () => Swal.fire({ icon: 'error', title: 'ไม่สามารถระบุตำแหน่งได้', background: '#0f172a', color: '#fff' }),
      { enableHighAccuracy: true }
    );
  };

  // 🏠 Event: กลับหน้าศูนย์บัญชาการ (บ่อหลวง)
  const handleResetToCenter = () => {
    setPosition({ lat: INITIAL_LAT, lng: INITIAL_LNG });
    setLocationName('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');
    if (mapRef.current) {
      mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 14, { duration: 1.5 });
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-gray-800 font-sans selection:bg-[#0ea5e9] selection:text-white pb-10 flex flex-col">
      
      {/* 🚀 Header */}
      <header className="bg-[#0b132b] px-6 py-4 flex justify-between items-center border-b border-[#1e293b]">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-[#38bdf8] to-[#0284c7] rounded-xl flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <div>
            <h1 className="text-[18px] md:text-[22px] font-extrabold text-[#60a5fa] leading-tight">ระบบตรวจสอบสภาพอากาศ</h1>
            <h2 className="text-[14px] md:text-[16px] font-bold text-white mt-1">Bo Luang Weather Center</h2>
            <p className="text-[12px] md:text-[13px] text-gray-400 mt-1">ตรวจสอบอุณหภูมิ ปริมาณฝน และการพยากรณ์อากาศในพื้นที่</p>
          </div>
        </div>
        <Link href="/" className="flex items-center space-x-2 bg-[#1e293b] hover:bg-[#334155] border border-gray-700 px-4 py-2.5 rounded-xl text-sm md:text-base font-bold text-white transition-all shadow-sm">
          <span>⬅️</span> <span className="hidden md:inline">กลับหน้าแผนที่หลัก</span>
        </Link>
      </header>

      {/* 🟢 ปลดล็อคความกว้างเต็มจอ (w-full) */}
      <main className="p-4 md:p-6 w-full space-y-6 flex-1">

        {/* 🚨 ป้ายแจ้งเตือนสภาพอากาศรุนแรง (Data Honesty) */}
        {staticWeather.rain_today > 0 ? (
          <div className="bg-red-900/10 border border-red-500/50 rounded-2xl p-5 md:p-6 shadow-md flex items-start space-x-4">
            <div className="mt-1 w-6 h-6 rounded-full border-2 border-red-500 flex-shrink-0 animate-ping bg-red-500"></div>
            <div>
              <h3 className="text-red-600 font-extrabold text-lg md:text-xl tracking-wide">แจ้งเตือนสภาพอากาศ (Live Alert)</h3>
              <p className="text-gray-700 text-sm md:text-base font-medium mt-1">
                <b>ข้อมูลดาวเทียม:</b> ตรวจพบกลุ่มฝนกำลังตกในพื้นที่ (ความแรง: {staticWeather.rain_today.toFixed(1)} มม.) โปรดระมัดระวังในการเดินทาง
              </p>
            </div>
          </div>
        ) : staticWeather.weather_code >= 61 ? (
          <div className="bg-yellow-900/10 border border-yellow-500/50 rounded-2xl p-5 md:p-6 shadow-md flex items-start space-x-4">
            <div className="mt-1 w-6 h-6 rounded-full border-2 border-yellow-500 flex-shrink-0 flex items-center justify-center text-yellow-600 font-bold text-xs">⚠️</div>
            <div>
              <h3 className="text-yellow-700 font-extrabold text-lg md:text-xl tracking-wide">เฝ้าระวังพยากรณ์อากาศ (Forecast Warning)</h3>
              <p className="text-gray-700 text-sm md:text-base font-medium mt-1">
                <b>แบบจำลอง:</b> คาดการณ์ว่าอาจมีฝนตกหรือสภาพอากาศแปรปรวนในวันนี้ โปรดเตรียมพร้อมรับมือ
              </p>
            </div>
          </div>
        ) : null}

        {/* 🔍 แถบค้นหาพื้นที่ & ปุ่มควบคุม */}
        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-end space-y-3 md:space-y-0 md:space-x-4">
          <div className="flex-1">
            <label className="block text-xs md:text-sm font-bold text-gray-600 mb-1.5 ml-1">ค้นหาพื้นที่ (ชื่อจังหวัด / อำเภอ / ตำบล / หมู่บ้าน)</label>
            <form onSubmit={handleSearchSubmit} className="relative">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="เช่น แม่แจ่ม, ฮอด, เชียงใหม่" 
                className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm md:text-base rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#0284c7] focus:border-transparent shadow-sm"
              />
            </form>
          </div>
          <div className="flex space-x-2 md:space-x-3 w-full md:w-auto">
            <button 
              onClick={handleResetToCenter}
              className="flex-1 md:flex-none bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-3 rounded-xl font-bold text-sm md:text-base flex items-center justify-center space-x-2 transition-colors shadow-sm"
            >
              <span>🏠</span> <span className="whitespace-nowrap">กลับบ่อหลวง</span>
            </button>
            <button 
              onClick={handleCurrentLocation}
              className="flex-1 md:flex-none bg-sky-100 hover:bg-sky-200 text-sky-800 px-5 py-3 rounded-xl font-bold text-sm md:text-base flex items-center justify-center space-x-2 transition-colors shadow-sm"
            >
              <span>📍</span> <span className="whitespace-nowrap">พิกัดปัจจุบัน</span>
            </button>
          </div>
        </div>

        {/* 🗺️ แผนที่ดาวเทียมเลือกพิกัด */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-gray-50 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between border-b border-gray-200">
            <div className="flex items-center space-x-2 text-gray-800 font-extrabold text-sm md:text-base">
              <span>🛰️</span> <span>แผนที่ดาวเทียม (คลิก / ลากหมุด เพื่อเลือกพิกัด)</span>
            </div>
            <div className="flex items-center mt-2 md:mt-0 text-xs font-mono">
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`} 
                target="_blank" rel="noopener noreferrer"
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-sm flex items-center space-x-1"
              >
                <span>เปิดใน Google Maps ↗</span>
              </a>
            </div>
          </div>
          
          <div className="h-[350px] md:h-[500px] w-full relative z-0">
            <MapContainer 
              center={[position.lat, position.lng]} 
              zoom={14} 
              maxZoom={20} 
              zoomControl={true} 
              attributionControl={false} 
              className="w-full h-full bg-gray-100" 
              ref={mapRef}
            >
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
              <Marker 
                draggable={true}
                position={[position.lat, position.lng]}
                icon={createPinIcon()}
                ref={markerRef}
                eventHandlers={{ dragend: handleMarkerDragEnd }}
              />
            </MapContainer>
          </div>
          <div className="bg-gray-50 px-5 py-3 text-[12px] md:text-[13px] text-gray-600 font-bold flex items-center border-t border-gray-200">
            <span>💡 คลิกที่แผนที่หรือลากหมุด 📍 เพื่อปักตำแหน่งใหม่ ระบบจะดึงข้อมูลสภาพอากาศของจุดนั้นให้อัตโนมัติ</span>
          </div>
        </div>
        
        {/* 📍 แถบสถานะพื้นที่แบบ Real-time */}
        <div className="bg-[#1e293b] rounded-2xl p-4 md:p-5 shadow-lg border border-[#334155] flex flex-col md:flex-row items-center justify-between text-sm md:text-base transition-all">
          <div className="flex items-center space-x-3 text-gray-200 text-center md:text-left">
            <span className="text-red-400 text-xl animate-pulse">📍</span>
            <span className="font-bold whitespace-nowrap hidden sm:inline">พื้นที่ตรวจสอบสภาพอากาศ:</span>
            <span className="text-white font-medium">{locationName}</span>
          </div>
          <div className="flex items-center space-x-3 mt-3 md:mt-0 text-gray-300 font-mono text-[13px] md:text-sm">
            <span>พิกัด: <span className="text-[#38bdf8]">{position.lat.toFixed(4)}, {position.lng.toFixed(4)}</span></span>
            <span className="hidden md:inline">|</span>
            <span>อัปเดตล่าสุด: <span className="text-emerald-400 font-bold">{currentTime ? currentTime.toLocaleTimeString('th-TH') : '--:--:--'}</span></span>
          </div>
        </div>

        {/* 🍱 Bento Box Grid Layout (ข้อมูลอากาศ) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">

          {/* 📦 กล่อง 1: สภาพอากาศปัจจุบัน */}
          <div className="col-span-1 md:col-span-1 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 md:p-8 rounded-3xl border border-[#334155] shadow-lg relative overflow-hidden flex flex-col justify-center items-center text-center group hover:border-[#38bdf8]/50 transition-colors">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#38bdf8] rounded-full blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
            <span className="text-7xl drop-shadow-lg mb-3 transform group-hover:scale-110 transition-transform">{getWeatherEmoji(staticWeather.weather_code)}</span>
            <div className="text-6xl font-extrabold text-white mb-2">{staticWeather.temperature_2m.toFixed(1)}°<span className="text-3xl text-gray-400">C</span></div>
            <p className="text-[#38bdf8] font-bold text-xl">{getWmoWeatherDesc(staticWeather.weather_code)}</p>
          </div>

          {/* 📦 กล่อง 2: คุณภาพอากาศ (AQI) */}
          <div className="col-span-1 bg-white p-6 md:p-7 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-2 text-gray-500 font-extrabold text-sm tracking-widest">
                <span>🌫️</span> <span>AIR QUALITY (AQI)</span>
              </div>
              <div className={`px-2.5 py-1 rounded-md text-xs font-bold ${aqiStatus.bg}`} style={{ color: aqiStatus.color }}>{aqiStatus.text}</div>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-5xl font-extrabold" style={{ color: aqiStatus.color }}>{staticAqi.us_aqi}</div>
                <div className="text-xs text-gray-400 mt-1 font-mono">US AQI Standard</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800">{staticAqi.pm2_5.toFixed(1)} <span className="text-sm text-gray-500">µg/m³</span></div>
                <div className="text-xs text-gray-400 mt-1">PM 2.5</div>
              </div>
            </div>
          </div>

          {/* 📦 กล่อง 3: ลมและความชื้น */}
          <div className="col-span-1 bg-white p-6 md:p-7 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-center space-y-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center"><span className="text-blue-500 text-xl">💨</span></div>
                <div>
                  <div className="text-xs md:text-sm text-gray-500 font-bold">ความเร็วลม</div>
                  <div className="text-2xl font-extrabold text-gray-800">{(staticWeather.wind_speed_10m / 3.6).toFixed(1)} <span className="text-xs font-normal text-gray-500">ม./วินาที</span></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center"><span className="text-cyan-500 text-xl">💧</span></div>
                <div>
                  <div className="text-xs md:text-sm text-gray-500 font-bold">ความชื้นสัมพัทธ์</div>
                  <div className="text-2xl font-extrabold text-gray-800">{staticWeather.relative_humidity_2m}<span className="text-xs font-normal text-gray-500">%</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* 📦 กล่อง 4: ข้อมูลฝนตกและ UV */}
          <div className="col-span-1 bg-white p-6 md:p-7 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-center space-y-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center"><span className="text-indigo-500 text-xl">🌧️</span></div>
                <div>
                  <div className="text-xs md:text-sm text-gray-500 font-bold">ปริมาณฝน (วันนี้)</div>
                  <div className="text-2xl font-extrabold text-gray-800">{staticWeather.rain_today.toFixed(1)} <span className="text-xs font-normal text-gray-500">มม.</span></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center"><span className="text-purple-500 text-xl">☀️</span></div>
                <div>
                  <div className="text-xs md:text-sm text-gray-500 font-bold">UV Index (สูงสุด)</div>
                  <div className="text-2xl font-extrabold text-gray-800">{staticWeather.uv_max} <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded ml-1">Index</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* 📦 กล่อง 5: กราฟพยากรณ์อุณหภูมิ 7 วัน */}
          <div className="col-span-1 md:col-span-2 bg-white p-6 md:p-7 rounded-3xl border border-gray-200 shadow-sm h-[400px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-xl mr-2">📈</span>
              <h3 className="text-gray-800 text-base md:text-lg font-extrabold">พยากรณ์อุณหภูมิ 7 วันล่วงหน้า (°C)</h3>
            </div>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={staticForecast} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f87171" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={13} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={13} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '12px', color: '#1e293b', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} itemStyle={{ fontWeight: 'bold' }} />
                  <Area type="monotone" name="อุณหภูมิสูงสุด" dataKey="maxTemp" stroke="#f87171" strokeWidth={3} fillOpacity={1} fill="url(#colorMax)" />
                  <Area type="monotone" name="อุณหภูมิต่ำสุด" dataKey="minTemp" stroke="#38bdf8" strokeWidth={3} fillOpacity={1} fill="url(#colorMin)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📦 กล่อง 6: กราฟพยากรณ์ปริมาณฝน 7 วัน */}
          <div className="col-span-1 md:col-span-2 bg-white p-6 md:p-7 rounded-3xl border border-gray-200 shadow-sm h-[400px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-xl mr-2">🌧️</span>
              <h3 className="text-gray-800 text-base md:text-lg font-extrabold">พยากรณ์ปริมาณน้ำฝน 7 วัน (มม.)</h3>
            </div>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={staticForecast} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={13} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={13} tickLine={false} axisLine={false} />
                  <RechartsTooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ backgroundColor: '#ffffff', borderColor: '#0ea5e9', borderRadius: '12px', color: '#1e293b', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <Bar name="ปริมาณฝนสะสม" dataKey="rain" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📦 กล่อง 7: แผนที่ Windy Interactive (ปรับปรุงควบคุมและจัดระเบียบใหม่ให้สมส่วน) */}
          <div className="col-span-1 md:col-span-4 bg-white p-4 md:p-6 rounded-3xl border border-gray-200 shadow-md flex flex-col mt-4 h-[650px] md:h-[800px]">
            
            {/* Header ของแผงควบคุม Windy */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <span className="text-3xl">🛰️</span>
                <div className="flex flex-col">
                  <span className="text-gray-900 font-extrabold text-lg md:text-xl leading-tight">แผนที่อากาศเรียลไทม์ (Windy)</span>
                  <span className="text-gray-500 font-medium text-xs md:text-sm mt-0.5">เรดาร์ฝน ลม เมฆ และมลพิษแบบเรียลไทม์ • {locationName}</span>
                </div>
              </div>
              
              {/* ชุดปุ่ม Zoom มุมขวาบน และปุ่มตำแหน่งปัจจุบัน */}
              <div className="flex items-center space-x-3 mt-4 md:mt-0">
                 <button onClick={handleCurrentLocation} className="bg-[#0f172a] text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-sm flex items-center hover:bg-gray-800 transition">
                   <span className="mr-1.5 text-red-500 text-base">📍</span> ตำแหน่งของฉัน
                 </button>
                 <div className="flex items-center space-x-2 bg-gray-100 rounded-xl px-3 py-1.5 border border-gray-200">
                    <button onClick={() => setWindyZoom(Math.max(1, windyZoom - 1))} className="w-7 h-7 rounded-lg bg-white text-[#0ea5e9] hover:bg-sky-50 flex items-center justify-center font-bold shadow-sm transition-colors text-base">-</button>
                    <span className="text-xs md:text-sm font-mono text-gray-700 font-bold px-2">z{windyZoom}</span>
                    <button onClick={() => setWindyZoom(Math.min(20, windyZoom + 1))} className="w-7 h-7 rounded-lg bg-white text-[#0ea5e9] hover:bg-sky-50 flex items-center justify-center font-bold shadow-sm transition-colors text-base">+</button>
                 </div>
              </div>
            </div>

            {/* แถบปุ่ม Layer ของ Windy */}
            <div className="flex space-x-3 py-4 overflow-x-auto custom-scrollbar w-full">
              {WINDY_LAYERS.map((layer) => (
                <button 
                  key={layer.id}
                  onClick={() => setWindyLayer(layer.id)}
                  className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold whitespace-nowrap transition-all duration-300 flex-shrink-0 border
                    ${windyLayer === layer.id 
                      ? 'bg-[#0f4a8a] text-white border-[#0f4a8a] shadow-md transform scale-105' 
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 shadow-sm'
                    }`}
                >
                  <span className="text-base">{layer.icon}</span><span>{layer.label}</span>
                </button>
              ))}
            </div>

            {/* Iframe ของ Windy */}
            <div className="w-full flex-1 rounded-2xl overflow-hidden relative border border-gray-200 shadow-inner">
              <iframe 
   src="https://embed.windy.com/embed2.html?lat=18.163&lon=98.374&zoom=10...&lang=th" 
   width="100%" 
   height="100%">
</iframe>
            </div>

            {/* Footer ของแผงควบคุม Windy */}
            <div className="flex flex-col md:flex-row items-center justify-between pt-3 text-xs md:text-sm text-gray-500 font-bold">
               <div className="flex items-center">
                 <span className="mr-2 text-orange-500 text-base">💡</span> เลื่อนแถบเวลาด้านล่างแผนที่เพื่อดูพยากรณ์อากาศล่วงหน้า
               </div>
               <a 
                 href={`https://www.windy.com/?${position.lat},${position.lng},${windyZoom}`} 
                 target="_blank" rel="noopener noreferrer" 
                 className="text-[#0ea5e9] hover:text-[#0284c7] font-bold flex items-center bg-sky-50 px-3.5 py-1.5 rounded-lg transition-colors border border-sky-200 mt-2 md:mt-0"
               >
                 เปิดหน้าจอเต็มใน Windy.com ↗
               </a>
            </div>

          </div>

        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}} />
    </div>
  );
}
