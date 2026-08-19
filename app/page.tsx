'use client'; 

import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js'; 
import Swal from 'sweetalert2';

// ==========================================
// 🌟 1. การตั้งค่าระบบ (Config)
// ==========================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const GISTDA_API_KEY = 'AF9B1EEFF30042208F1DE95B579E7F90';

const BO_LUANG_LAT = 18.1633;
const BO_LUANG_LNG = 98.3744;
const MAX_DISTANCE_KM = 150;

// 🏥 พิกัดศูนย์พักพิงและจุดปลอดภัย (Safe Zones)
const safeZonesData = [
  { id: 1, name: 'รพ.สต. บ่อหลวง (ศูนย์การแพทย์)', lat: 18.14913, lng: 98.35532, type: 'hospital' },
  { id: 2, name: 'เทศบาลตำบลบ่อหลวง (ศูนย์บัญชาการ)', lat: 18.14722, lng: 98.34933, type: 'shelter' },
  { id: 3, name: 'วัดบ่อหลวง (จุดอพยพรวมพล)', lat: 18.15199, lng: 98.35327, type: 'temple' },
  { id: 4, name: 'โรงเรียนบ้านบ่อหลวง (จุดพักพิงชั่วคราว)', lat: 18.15269, lng: 98.35439, type: 'school' },
  { id: 5, name: 'โรงเรียนบ้านแม่หืด (จุดพักพิงชั่วคราว)', lat: 18.21915, lng: 98.37122, type: 'school' },
  { id: 6, name: 'โรงเรียนบ้านวังกอง (จุดพักพิงชั่วคราว)', lat: 18.12107, lng: 98.35366, type: 'school' },
  { id: 7, name: 'โรงเรียนบ้านขุน (จุดพักพิงชั่วคราว)', lat: 18.10471, lng: 98.37400, type: 'school' },
  { id: 8, name: 'วัดบ่อสะแง๋ (จุดอพยพรวมพล)', lat: 18.15015, lng: 98.35515, type: 'temple' },
  { id: 9, name: 'โรงเรียนบ้านพุย (จุดพักพิงชั่วคราว)', lat: 18.03907, lng: 98.30002, type: 'school' },
  { id: 10, name: 'คริสจักรกิ่วลึกบ้านพุย (จุดอพยพรวมพล)', lat: 18.03681, lng: 98.30693, type: 'church' },
  { id: 11, name: 'โรงเรียนบ้านนาฟ่อน (จุดพักพิงชั่วคราว)', lat: 18.08870, lng: 98.36053, type: 'school' },
  { id: 12, name: 'โรงเรียนบ้านกิ่วลม (จุดพักพิงชั่วคราว)', lat: 18.14027, lng: 98.36942, type: 'school' },
  { id: 13, name: 'วัดบ่อพะแวน (จุดอพยพรวมพล)', lat: 18.14681, lng: 98.35252, type: 'temple' },
  { id: 14, name: 'โรงเรียนบ้านแม่ลาย (จุดพักพิงชั่วคราว)', lat: 18.04770, lng: 98.36286, type: 'school' },
  { id: 15, name: 'โรงเรียนบ้านแม่ลายเหนือ (จุดพักพิงชั่วคราว)', lat: 18.06555, lng: 98.33780, type: 'school' },
  { id: 16, name: 'โรงเรียนบ้านเตียนอาง (จุดพักพิงชั่วคราว)', lat: 18.03097, lng: 98.40366, type: 'school' },
  { id: 17, name: 'คริสจักรเจริญธรรมห้วยบง (จุดอพยพรวมพล)', lat: 18.01215, lng: 98.43016, type: 'church' },
];

// ==========================================
// 🛠️ 2. ฟังก์ชันเสริม (Utils)
// ==========================================

// 🧮 คำนวณระยะทาง
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

// 🛡️ API Resilience (มี Cache ป้องกันระบบล่ม)
const fetchWithCache = async (url: string, cacheKey: string, timeoutMs = 5000) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (storageErr) {
      console.warn('Storage full, skipping cache save.');
    }
    
    return { data, status: 'LIVE' };
  } catch (error) {
    console.warn(`[API Resilience] ${cacheKey} failed. Using cache. Error:`, error);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      return { data: JSON.parse(cached).data, status: 'CACHED' };
    }
    return { data: null, status: 'OFFLINE' };
  }
};

// ==========================================
// 🗺️ 3. โหลด Leaflet และ Component
// ==========================================
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

const CustomToggleBox = ({ label, active, onClick, dotColor = '#38bdf8', isRadio = false, apiStatus = '' }: any) => {
  const [localActive, setLocalActive] = useState(active);
  useEffect(() => { setLocalActive(active); }, [active]);

  const handlePress = () => {
    setLocalActive(!localActive);
    setTimeout(() => { onClick(); }, 50);
  };

  const renderStatusBadge = () => {
    if (!apiStatus) return null;
    if (apiStatus === 'LIVE') return <span className="ml-auto text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">LIVE</span>;
    if (apiStatus === 'CACHED') return <span className="ml-auto text-[8px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">CACHED</span>;
    return <span className="ml-auto text-[8px] bg-red-500/20 text-red-400 border border-red-500/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">OFFLINE</span>;
  };

  return (
    <div className="flex items-center space-x-3 px-3 py-1.5 rounded-xl border border-[#1e293b] bg-[#0b132b]/50 hover:bg-[#1e293b]/80 transition-colors duration-200 cursor-pointer select-none mb-1 group" onClick={handlePress}>
      {isRadio ? (
        <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${localActive ? 'border-[#38bdf8]' : 'border-gray-500'}`}>
          {localActive && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}
        </div>
      ) : (
        <div className={`relative w-8 h-4 rounded-full transition-colors duration-300 flex-shrink-0 ${localActive ? 'bg-[#38bdf8]' : 'bg-[#334155]'}`}>
          <div className={`absolute top-[2px] left-[2px] bg-white rounded-full h-3 w-3 transition-transform duration-300 shadow-sm ${localActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
        </div>
      )}
      <div className="flex items-center space-x-2 flex-1 w-full overflow-hidden">
        {!isRadio && <div className="w-2.5 h-2.5 rounded-[3px] shadow-sm flex-shrink-0" style={{ backgroundColor: dotColor }}></div>}
        <span className={`text-[13px] font-medium transition-colors truncate ${localActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>{label}</span>
        {renderStatusBadge()}
      </div>
    </div>
  );
};

// ==========================================
// 🌦️ 4. ฟังก์ชันข้อมูลอากาศ
// ==========================================
const getWmoWeatherDesc = (code: number) => {
  const codes: Record<number, string> = { 0: 'แจ่มใส', 1: 'มีเมฆบางส่วน', 2: 'มีเมฆครึ้ม', 3: 'เมฆเป็นส่วนมาก', 45: 'มีหมอก', 48: 'หมอกหนา', 51: 'ฝนปรอยๆ', 61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง', 65: 'ฝนตกหนัก', 80: 'ฝนเป็นหย่อมๆ', 95: 'พายุฝนฟ้าคะนอง' };
  return codes[code] || 'ปกติ';
};
const getWeatherEmoji = (code: number) => {
  if (code === 0) return '☀️'; if (code === 1 || code === 2) return '🌤️'; if (code === 3) return '☁️'; if (code >= 45 && code <= 48) return '🌫️'; if (code >= 51 && code <= 67) return '🌧️'; if (code >= 80 && code <= 82) return '🌦️'; if (code >= 95) return '⛈️'; return '☀️';
};

const getAirQualityDetails = (pm25: number) => {
  let aqi = 0; let text = ''; let color = ''; let shadow = '';
  if (pm25 <= 15.0) { aqi = Math.round(pm25 * (25/15)); text = 'ดีมาก'; color = '#38bdf8'; shadow = 'rgba(56,189,248,0.5)'; } 
  else if (pm25 <= 25.0) { aqi = Math.round(26 + ((pm25-15.1) * (24/9.9))); text = 'ดี'; color = '#84cc16'; shadow = 'rgba(132,204,22,0.5)'; } 
  else if (pm25 <= 37.5) { aqi = Math.round(51 + ((pm25-25.1) * (49/12.4))); text = 'ปานกลาง'; color = '#facc15'; shadow = 'rgba(250,204,21,0.5)'; } 
  else if (pm25 <= 75.0) { aqi = Math.round(101 + ((pm25-37.6) * (99/37.4))); text = 'เริ่มมีผลกระทบ'; color = '#f97316'; shadow = 'rgba(249,115,22,0.5)'; } 
  else { aqi = Math.round(201 + ((pm25-75.1) * (99/250))); text = 'มีผลกระทบ'; color = '#ef4444'; shadow = 'rgba(239,68,68,0.5)'; }
  if (aqi > 500) aqi = 500;
  return { aqi, text, color, shadow };
};

const localAirStations = [
  { name: 'ต.บ่อหลวง (ศูนย์กลางเทศบาล)', lat: 18.1633, lng: 98.3744, type: 'local' },
  { name: 'ต.บ่อหลวง (บ้านแม่หืด)', lat: 18.1472, lng: 98.3487, type: 'local' },
  { name: 'ต.บ่อสลี (พื้นที่ติดกัน)', lat: 18.1147, lng: 98.3184, type: 'local' },
  { name: 'อ.ฮอด (ตัวอำเภอ)', lat: 18.1908, lng: 98.6133, type: 'district' },
  { name: 'อ.แม่แจ่ม (ดอยอินทนนท์)', lat: 18.4988, lng: 98.3601, type: 'district' },
  { name: 'อ.จอมทอง', lat: 18.4172, lng: 98.6738, type: 'district' },
  { name: 'อ.อมก๋อย', lat: 17.7969, lng: 98.3585, type: 'district' },
  { name: 'อ.แม่สะเรียง (แม่ฮ่องสอน)', lat: 18.1601, lng: 97.9333, type: 'district' },
  { name: 'อ.สบเมย (แม่ฮ่องสอน)', lat: 17.9547, lng: 97.9405, type: 'district' },
  { name: 'ศูนย์ราชการฯ เชียงใหม่', lat: 18.7883, lng: 98.9853, type: 'province' }
];

// ==========================================
// 🚀 5. MAIN COMPONENT 
// ==========================================
export default function BoLuangDashboard() {
  const [mounted, setMounted] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const coordsRef = useRef<HTMLSpanElement>(null);
  
  const [isMobile, setIsMobile] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);

  const [apiStatus, setApiStatus] = useState({ tmd: '', pm25: '', onwrRain: '', onwrWater: '' });
  const [searchQuery, setSearchQuery] = useState('');

  // ----------------------------------------
  // State: Sidebar ด้านซ้าย
  // ----------------------------------------
  const [tmdWeather, setTmdWeather] = useState(false);
  const [tmdRain, setTmdRain] = useState(false);
  const [pm25, setPm25] = useState(false); 
  const [windyLayer, setWindyLayer] = useState(false); 
  const [windyType, setWindyType] = useState('rain'); 
  const [onwrRain, setOnwrRain] = useState(false);
  const [onwrWaterLevel, setOnwrWaterLevel] = useState(false);

  // ----------------------------------------
  // State: Sidebar ด้านขวา
  // ----------------------------------------
  const [satelliteLayer, setSatelliteLayer] = useState(true); 
  const [showBoluang, setShowBoluang] = useState(true); 
  const [showBlock, setShowBlock] = useState(true);         
  const [showParcel, setShowParcel] = useState(false);      
  const [citizenReport, setCitizenReport] = useState(false); 
  const [earthquakeLayer, setEarthquakeLayer] = useState(false);        
  const [hotspot, setHotspot] = useState(false);
  const [showLandslide, setShowLandslide] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false); 
  
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [showScanModal, setShowScanModal] = useState(false);

  // 🌟 State สำหรับเปิด/ปิดหน้าต่าง QR Code ติดตั้งแอป
  const [showQrModal, setShowQrModal] = useState(false);

  // ----------------------------------------
  // State: Data ข้อมูลจาก API
  // ----------------------------------------
  const [localWeatherData, setLocalWeatherData] = useState<any[]>([]); 
  const [localAirData, setLocalAirData] = useState<any[]>([]);
  const [disasterReports, setDisasterReports] = useState<any[]>([]); 
  const [onwrRainData, setOnwrRainData] = useState<any[]>([]);
  const [onwrWaterLevelData, setOnwrWaterLevelData] = useState<any[]>([]);
  const [visitStats, setVisitStats] = useState({ today: 0, total: 0 });
  
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [geoParcel, setGeoParcel] = useState<any>(null);
  const [geoHotspot, setGeoHotspot] = useState<any>(null);
  const [geoEarthquake, setGeoEarthquake] = useState<any>(null);
  const [geoLandslide, setGeoLandslide] = useState<any>(null); 

  const [mapRef, setMapRef] = useState<any>(null);
  
  const initialCenter = { lat: 18.1633, lng: 98.3744, zoom: 9 }; 
  const [iframeState, setIframeState] = useState(initialCenter);
  const [transform, setTransform] = useState({ x: 0, y: 0 });
  const [currentZoom, setCurrentZoom] = useState(9);
  const syncData = useRef(initialCenter);

  const activeLayersCount = [satelliteLayer, showBoluang, showBlock, showParcel, citizenReport, earthquakeLayer, hotspot, showLandslide, onwrRain, onwrWaterLevel, showSafeZone].filter(Boolean).length;

  const [locationName, setLocationName] = useState('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');

  // ==========================================
  // 🎯 Action Functions
  // ==========================================
  
  const handleViewImage = (imageUrl: string) => {
    Swal.fire({
      imageUrl: imageUrl,
      imageAlt: 'ภาพแจ้งเหตุจากประชาชน',
      showConfirmButton: false,
      showCloseButton: true,
      width: 'auto',
      padding: '1em',
      background: '#0f172a',
      backdrop: 'rgba(0,0,0,0.85)',
      customClass: {
        popup: 'border border-gray-700 rounded-2xl shadow-2xl',
        image: 'rounded-lg max-h-[80vh] object-contain'
      }
    });
  };

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

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'เบราว์เซอร์ไม่รองรับ GPS', background: '#0f172a', color: '#fff' }); 
      return;
    }
    Swal.fire({ title: 'กำลังวิเคราะห์พิกัด...', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        
        if (mapRef) {
          mapRef.flyTo([latitude, longitude], 15, { duration: 1.5 });
        }

        let nearestSZ: any = null;
        let minDistance = Infinity;
        safeZonesData.forEach(sz => {
           const d = calculateDistance(latitude, longitude, sz.lat, sz.lng);
           if (d < minDistance) { 
             minDistance = d; 
             nearestSZ = sz; 
           }
        });

        let inRisk = false;
        if (geoLandslide && geoLandslide.features) {
           geoLandslide.features.forEach((f: any) => {
              if (f.geometry && f.geometry.coordinates && f.geometry.coordinates[0] && f.geometry.coordinates[0][0]) {
                 const pLng = f.geometry.coordinates[0][0][0];
                 const pLat = f.geometry.coordinates[0][0][1];
                 const d = calculateDistance(latitude, longitude, pLat, pLng);
                 if (d < 1.5) inRisk = true; 
              }
           });
        }

        Swal.close();

        if (inRisk) {
           Swal.fire({
              icon: 'warning',
              title: '⚠️ แจ้งเตือนพื้นที่เสี่ยง',
              html: `<div class="text-left text-sm mt-3 space-y-3">
                       <p class="text-red-400 font-bold">พิกัดของคุณอยู่ใกล้/ในเขตเฝ้าระวังดินถล่ม!</p>
                       <div class="bg-gray-800 p-3 rounded-lg border border-gray-600">
                         <span class="text-emerald-400 font-bold">🛡️ จุดปลอดภัยใกล้เคียง:</span><br/>
                         <b>${nearestSZ.name}</b><br/>
                         <span class="text-gray-400">ระยะห่าง: ${minDistance.toFixed(2)} กิโลเมตร</span>
                       </div>
                       <p class="text-xs text-gray-500">โปรดติดตามประกาศจากเทศบาลอย่างใกล้ชิด</p>
                     </div>`,
              background: '#0f172a', 
              color: '#fff', 
              confirmButtonColor: '#ef4444', 
              confirmButtonText: 'รับทราบ'
           });
        } else {
           Swal.fire({
              toast: true, position: 'top-end', icon: 'success', title: 'พื้นที่ของคุณปลอดภัย', 
              text: `จุดรวมพลใกล้สุด: ${nearestSZ.name} (${minDistance.toFixed(1)} กม.)`,
              showConfirmButton: false, timer: 4000, background: '#1e293b', color: '#fff'
           });
        }
      },
      (error) => {
        Swal.fire({ icon: 'error', title: 'ไม่สามารถระบุตำแหน่งได้', text: 'กรุณาเปิดสิทธิ์ GPS ให้เบราว์เซอร์', background: '#0f172a', color: '#fff' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSearchSubmit = async (e: any) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    Swal.fire({ title: 'กำลังค้นหาพิกัด...', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery + ' เชียงใหม่')}&limit=1`);
      const data = await res.json();
      
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        if (mapRef) {
          mapRef.flyTo([parseFloat(lat), parseFloat(lon)], 14, { duration: 2 });
        }
        Swal.close();
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'พบพิกัด', text: display_name.split(',')[0], showConfirmButton: false, timer: 3000, background: '#1e293b', color: '#fff' });
      } else {
        Swal.fire({ icon: 'warning', title: 'ไม่พบสถานที่', text: 'ลองเปลี่ยนคำค้นหาให้กว้างขึ้น', background: '#0f172a', color: '#fff' });
      }
    } catch (error) { 
      Swal.fire({ icon: 'error', title: 'ระบบค้นหาขัดข้อง', background: '#0f172a', color: '#fff' }); 
    }
  };

  const markerRef = useRef<any>(null);
  const handleMarkerDragEnd = () => {
    const marker = markerRef.current;
    if (marker != null) {
      const latlng = marker.getLatLng();
      fetchLocationName(latlng.lat, latlng.lng);
    }
  };

  // ==========================================
  // ⚙️ UseEffects สำหรับดึงข้อมูล & Responsive
  // ==========================================
  
  // 🚀 Logic ควบคุมการเปิดปิดเมนูสำหรับ "Wow Effect" บนหน้าจอมือถือ/แท็บเล็ต
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024; 
      setIsMobile(mobile);
      if (mobile) { 
        setIsLeftPanelOpen(false); 
        setIsRightPanelOpen(true); 
      } else { 
        setIsLeftPanelOpen(true); 
        setIsRightPanelOpen(true); 
      }
    };
    handleResize(); 
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setQrUrl(window.location.origin + '/report');
    }
    const ts = Date.now(); 

    const loadGeoJSON = async (url: string, setter: any) => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          let data = await res.json();
          if (Array.isArray(data)) setter({ type: "FeatureCollection", features: data });
          else setter(data);
        }
      } catch (e) { 
        console.error('Failed to load layer:', url, e); 
      }
    };

    loadGeoJSON(`/geojson/boluang.json?v=${ts}`, setGeoBoluang);
    loadGeoJSON(`/geojson/block.json?v=${ts}`, setGeoBlock); 
    
    // 🛑 ปิดการโหลดแปลงที่ดินชั่วคราว เพื่อเพิ่มความเร็วหน้า Landing
    // loadGeoJSON(`/geojson/parcel.json?v=${ts}`, setGeoParcel);
    
    // 🛑 ปิดบรรทัดนี้ไปเลยครับ (เอาไปโหลดแยกต่างหาก)
    // loadGeoJSON(`https://api.sphere.gistda.or.th/services/info/disaster-recurring?lon=98.3744&lat=18.1633&disaster_type=hotspot&key=${GISTDA_API_KEY}`, setGeoHotspot);
    
    // 🛑 ปิดการโหลดแผ่นดินไหวชั่วคราว
    // loadGeoJSON(`/geojson/earthquake.geojson?v=${ts}`, setGeoEarthquake);
    
    // 🛑 ปิดบรรทัดนี้ไปเลยครับ (เอาไปโหลดแยกต่างหาก)
    // loadGeoJSON(`/geojson/boluang_landslide_risk.json?v=${ts}`, setGeoLandslide);
  }, []);

  // 💡 โค้ดชุดใหม่ 1: โหลดจุดความร้อน GISTDA ก็ต่อเมื่อกดเปิดสวิตช์ hotspot
  useEffect(() => {
    if (hotspot && !geoHotspot) {
      fetch(`https://api.sphere.gistda.or.th/services/info/disaster-recurring?lon=98.3744&lat=18.1633&disaster_type=hotspot&key=${GISTDA_API_KEY}`)
        .then(res => res.json())
        .then(data => setGeoHotspot(data))
        .catch(e => console.error(e));
    }
  }, [hotspot]);

  // 💡 โค้ดชุดใหม่ 2: โหลดดินถล่ม ก็ต่อเมื่อกดเปิดสวิตช์ showLandslide
  useEffect(() => {
    if (showLandslide && !geoLandslide) {
      fetch(`/geojson/boluang_landslide_risk.json?v=${Date.now()}`)
        .then(res => res.json())
        .then(data => setGeoLandslide(data))
        .catch(e => console.error(e));
    }
  }, [showLandslide]);

  useEffect(() => {
    if (!mounted) return;
    const handleVisitorCount = async () => {
      try {
        let sessionId = sessionStorage.getItem('bl_session_id');
        if (!sessionId) {
          sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; 
          sessionStorage.setItem('bl_session_id', sessionId);
          const { error: insertError } = await supabase.from('visitor_logs').insert([{ session_id: sessionId }]);
          if (insertError) console.warn('ไม่สามารถบันทึกสถิติใหม่ได้:', insertError.message);
        }
      } catch (error) { 
        console.warn('Error saving visit:', error); 
      }

      try {
        const { count: totalCount } = await supabase.from('visitor_logs').select('*', { count: 'exact', head: true });
        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const { count: todayCount } = await supabase.from('visitor_logs').select('*', { count: 'exact', head: true }).gte('visited_at', today.toISOString());
        
        setVisitStats({ today: todayCount || 0, total: totalCount || 0 });
      } catch (error) { 
        console.error('Error fetching visitor stats:', error); 
      }
    };
    handleVisitorCount();
  }, [mounted]);

  // พยากรณ์อากาศ (TMD)
  useEffect(() => {
    if (!tmdWeather && !tmdRain) { 
      setLocalWeatherData([]); 
      return; 
    }

    const fetchLocalWeather = async () => {
      const lats = localAirStations.map(p => p.lat.toFixed(4)).join(',');
      const lngs = localAirStations.map(p => p.lng.toFixed(4)).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weathercode&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FBangkok`;
      
      const { data, status } = await fetchWithCache(url, 'tmd_weather_cache');
      setApiStatus(prev => ({ ...prev, tmd: status }));
      
      if (data && Array.isArray(data)) {
        const formatted = localAirStations.map((station, i) => ({
          ...station,
          temp: data[i]?.current?.temperature_2m || 0, 
          humidity: data[i]?.current?.relative_humidity_2m || 0,
          rain: data[i]?.current?.precipitation || 0, 
          rainSum: data[i]?.daily?.precipitation_sum?.[0] || 0,
          wind: (data[i]?.current?.wind_speed_10m / 3.6) || 0, 
          wCode: data[i]?.current?.weathercode || 0,
          tempMin: data[i]?.daily?.temperature_2m_min?.[0] || 0, 
          tempMax: data[i]?.daily?.temperature_2m_max?.[0] || 0,
        }));
        setLocalWeatherData(formatted);
      }
    };
    fetchLocalWeather();
  }, [tmdWeather, tmdRain]);

  // ฝุ่น PM2.5 
  useEffect(() => {
    if (!pm25) { 
      setLocalAirData([]); 
      return; 
    }

    const fetchLocalAir = async () => {
      const lats = localAirStations.map(s => s.lat.toFixed(4)).join(',');
      const lngs = localAirStations.map(s => s.lng.toFixed(4)).join(',');
      const urlAqi = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lngs}&current=pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=Asia%2FBangkok`;
      const urlWx = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=weathercode&timezone=Asia%2FBangkok`;
      
      const [aqiResult, wxResult] = await Promise.all([
        fetchWithCache(urlAqi, 'pm25_aqi_cache'),
        fetchWithCache(urlWx, 'pm25_wx_cache')
      ]);
      
      setApiStatus(prev => ({ ...prev, pm25: aqiResult.status === 'LIVE' && wxResult.status === 'LIVE' ? 'LIVE' : (aqiResult.status === 'OFFLINE' ? 'OFFLINE' : 'CACHED') }));

      const aqiData = aqiResult.data; 
      const wxData = wxResult.data;

      if (Array.isArray(aqiData) && Array.isArray(wxData)) {
        const formatted = localAirStations.map((station, i) => ({
          ...station, 
          pm25Val: aqiData[i]?.current?.pm2_5 || 0, 
          pm10Val: aqiData[i]?.current?.pm10 || '—',
          coVal: aqiData[i]?.current?.carbon_monoxide || '—', 
          no2Val: aqiData[i]?.current?.nitrogen_dioxide || '—',
          so2Val: aqiData[i]?.current?.sulphur_dioxide || '—', 
          o3Val: aqiData[i]?.current?.ozone || '—',
          time: aqiData[i]?.current?.time || new Date().toISOString(), 
          wCode: wxData[i]?.current?.weathercode || 0
        }));
        setLocalAirData(formatted);
      }
    };
    fetchLocalAir();
  }, [pm25]);

  // 💧 ข้อมูลฝน ONWR 
  useEffect(() => {
    if (!onwrRain) { 
      setOnwrRainData([]); 
      return; 
    }

    const fetchOnwrRain = async () => {
      const { data: json, status } = await fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', 'onwr_rain_cache');
      setApiStatus(prev => ({ ...prev, onwrRain: status }));
      
      let arrData = [];
      if (json && Array.isArray(json.data)) {
        arrData = json.data;
      } else if (json && json.data && Array.isArray(json.data.data)) {
        arrData = json.data.data;
      }
      
      const filteredData = arrData.filter((station: any) => {
        const latStr = station?.station?.tele_station_lat || station?.tele_station_lat || station?.lat;
        const lngStr = station?.station?.tele_station_long || station?.tele_station_long || station?.lng;
        if (!latStr || !lngStr) return false;

        return calculateDistance(BO_LUANG_LAT, BO_LUANG_LNG, parseFloat(latStr), parseFloat(lngStr)) <= MAX_DISTANCE_KM; 
      });
      setOnwrRainData(filteredData);
    };
    fetchOnwrRain();
  }, [onwrRain]);

  // 💧 ข้อมูลระดับน้ำ ONWR 
  useEffect(() => {
    if (!onwrWaterLevel) { 
      setOnwrWaterLevelData([]); 
      return; 
    }

    const fetchOnwrWaterLevel = async () => {
      const { data: json, status } = await fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load', 'onwr_water_cache');
      setApiStatus(prev => ({ ...prev, onwrWater: status }));
      
      let arrData: any[] = [];
      if (Array.isArray(json)) {
        arrData = json;
      } else if (json?.data && Array.isArray(json.data)) {
        arrData = json.data;
      } else if (json?.data?.waterlevel_data?.data && Array.isArray(json.data.waterlevel_data.data)) {
        arrData = json.data.waterlevel_data.data;
      } else if (json?.waterlevel_data?.data && Array.isArray(json.waterlevel_data.data)) {
        arrData = json.waterlevel_data.data;
      } else {
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
      
      const filteredData = arrData.filter((station: any) => {
        const latStr = station?.station?.tele_station_lat || station?.tele_station_lat || station?.lat;
        const lngStr = station?.station?.tele_station_long || station?.tele_station_long || station?.lng;
        if (!latStr || !lngStr) return false;

        return calculateDistance(BO_LUANG_LAT, BO_LUANG_LNG, parseFloat(latStr), parseFloat(lngStr)) <= MAX_DISTANCE_KM; 
      });
      setOnwrWaterLevelData(filteredData);
    };
    fetchOnwrWaterLevel();
  }, [onwrWaterLevel]);

  // แจ้งเหตุจาก Supabase 
  useEffect(() => {
    if (!citizenReport) return;
    const fetchReports = async () => {
      try {
        const { data, error } = await supabase
          .from('boluang_disaster_reports')
          .select('*')
          .neq('status', 'ดำเนินการเสร็จแล้ว')
          .order('created_at', { ascending: false }); 
        
        if (error) throw error;
        if (data) setDisasterReports(data);
      } catch (error) { 
        console.error('Error fetching disaster reports:', error); 
      }
    };
    fetchReports();
  }, [citizenReport]);

  useEffect(() => {
    if (mapRef && (showBoluang || showBlock)) { 
      mapRef.flyTo([18.1633, 98.3744], 12, { duration: 2.5, easeLinearity: 0.25 }); 
    }
  }, [showBoluang, showBlock, mapRef]);

  // ==========================================
  // 🎨 การตกแต่งและสร้าง Style (GeoJSON)
  // ==========================================
  
  const BLOCK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#14b8a6', '#0ea5e9'];
  
  const getVillageColor = (feature: any) => {
    const props = feature?.properties || {};
    if (props.fill) return props.fill;
    
    const nameStr = String(props.own_villag || props.name_th || props.name || props.zone_name || props.id || "");
    const match = nameStr.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num >= 1 && num <= BLOCK_COLORS.length) {
        return BLOCK_COLORS[num - 1]; 
      }
    }
    const colorIndex = nameStr.length % BLOCK_COLORS.length;
    return BLOCK_COLORS[colorIndex];
  };

  const formatVillageName = (rawName: any) => {
    if (!rawName) return 'พื้นที่หมู่บ้าน';
    const safeName = String(rawName); 
    let cName = safeName.replace(/^(บ้าน|บ\.|หมู่ที่\s*\d+|หมู่\s*\d+)/, '').replace(/\s+/g, '');
    if (cName.includes('บ่อหลวง')) cName = 'บ้านบ่อหลวง';
    else if (cName === 'ขุน' || cName.includes('บ้านขุน')) cName = 'บ้านขุน';
    else cName = `บ้าน${cName}`;
    return cName;
  };

  const getBlockStyle = (feature: any) => ({ fillColor: getVillageColor(feature), weight: 1.5, color: 'rgba(255, 255, 255, 0.3)', fillOpacity: 0.12, dashArray: '3, 3' });
  
  const onEachBlockFeature = (feature: any, layer: any) => {
    const props = feature?.properties || {};
    const rawName = props.own_villag || props.name_th || props.name || props.zone_name || `หมู่ที่ ${props.zone_id || props.id || ''}`;
    const villageName = formatVillageName(rawName);
    const defaultColor = getVillageColor(feature);

    layer.bindTooltip(villageName, { sticky: true, direction: 'auto', className: 'village-hover-tooltip', permanent: false });
    layer.on({
      mouseover: (e: any) => {
        const targetLayer = e.target;
        targetLayer.setStyle({ weight: 3, color: '#ffffff', fillColor: defaultColor, fillOpacity: 0.7, dashArray: '' });
        if (targetLayer.bringToFront) {
          targetLayer.bringToFront();
        }
      },
      mouseout: (e: any) => {
        const targetLayer = e.target;
        targetLayer.setStyle({ weight: 1.5, color: 'rgba(255, 255, 255, 0.3)', fillOpacity: 0.12, dashArray: '3, 3' });
      }
    });
  };

  const getRainCircleStyle = (rainSum: number) => {
    let radius = 8 + (rainSum * 1.5); if (radius > 35) radius = 35; 
    let color = '#38bdf8'; let fillColor = '#7dd3fc'; 
    if (rainSum === 0) { color = '#94a3b8'; fillColor = '#cbd5e1'; radius = 7; } 
    else if (rainSum > 5 && rainSum <= 20) { color = '#10b981'; fillColor = '#34d399'; } 
    else if (rainSum > 20 && rainSum <= 50) { color = '#facc15'; fillColor = '#fde047'; } 
    else if (rainSum > 50) { color = '#ef4444'; fillColor = '#f87171'; }
    return { radius, color, fillColor, fillOpacity: 0.5, weight: 2.5 };
  };

  // 🚀 ตั้งค่าให้ Hover เฉพาะเส้นขอบเขต (Border)
  const styleBoluang = { color: '#0ea5e9', weight: 3, fill: false, interactive: true }; 
  const onEachBoluangFeature = (feature: any, layer: any) => {
    
    // 🌟 เอาการสร้างป้ายข้อความออกทั้งหมด เพื่อไม่ให้ไปแย่งการชี้เมาส์ของระดับหมู่บ้าน
    
    layer.on({
      mouseover: (e: any) => {
        // เมื่อชี้เส้นแนวเขต ให้เส้นเรืองแสงและหนาขึ้นเท่านั้น
        e.target.setStyle({ weight: 5, color: '#38bdf8' });
        if (e.target.bringToFront) e.target.bringToFront();
      },
      mouseout: (e: any) => {
        // เมื่อเอาเมาส์ออก ให้เส้นกลับเป็นปกติ
        e.target.setStyle(styleBoluang);
      }
    });
  };

  const styleParcel = { color: '#4ade80', fillColor: '#4ade80', weight: 1, fillOpacity: 0.2 }; 
  
  const styleLandslide = (feature: any) => {
    const risk = String(feature.properties?.risk || feature.properties?.Risk || '');
    let color = '#facc15';
    let opacity = 0.3;

    if (risk.includes('สูง') || risk.includes('High')) {
      color = '#ef4444';
      opacity = 0.6;
    } else if (risk.includes('ปานกลาง') || risk.includes('Moderate')) {
      color = '#f97316';
      opacity = 0.4;
    }

    return { color: color, fillColor: color, weight: 0, fillOpacity: opacity };
  };

  // ----------------------------------------
  // Map Sync Logic
  // ----------------------------------------
  useEffect(() => {
    if (!mapRef) return;
    const updateSyncData = () => {
      const center = mapRef.getCenter(); 
      const zoom = mapRef.getZoom();
      syncData.current = { lat: center.lat, lng: center.lng, zoom: zoom };
      setIframeState({ lat: center.lat, lng: center.lng, zoom: zoom });
      setCurrentZoom(zoom); 
      setTransform({ x: 0, y: 0 });
    };

    const onMove = () => {
      const zoom = mapRef.getZoom();
      if (zoom !== syncData.current.zoom) return;
      const initialPoint = mapRef.project(syncData.current, zoom);
      const currentPoint = mapRef.project(mapRef.getCenter(), zoom);
      setTransform({ x: initialPoint.x - currentPoint.x, y: initialPoint.y - currentPoint.y });
    };

    const onMouseMove = (e: any) => { 
      if (coordsRef.current) coordsRef.current.innerText = `${e.latlng.lat.toFixed(4)}°N ${e.latlng.lng.toFixed(4)}°E`; 
    };

    mapRef.on('move', onMove); 
    mapRef.on('moveend', updateSyncData); 
    mapRef.on('zoomend', updateSyncData); 
    mapRef.on('mousemove', onMouseMove); 

    return () => { 
      mapRef.off('move', onMove); 
      mapRef.off('moveend', updateSyncData); 
      mapRef.off('zoomend', updateSyncData); 
      mapRef.off('mousemove', onMouseMove); 
    };
  }, [mapRef]);

  // ==========================================
  // 🖼️ การสร้าง Custom Icons (Leaflet)
  // ==========================================
  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  
  const createTmdIcon = useMemo(() => {
    if (!L) return () => null;
    return (wCode: number) => {
      const emoji = getWeatherEmoji(wCode);
      return L.divIcon({ className: 'bg-transparent border-none', html: `<div class="flex items-center justify-center w-[36px] h-[36px] bg-[#0f172a] border-[2px] border-[#38bdf8] rounded-full shadow-[0_0_15px_rgba(56,189,248,0.5)] transition-transform hover:scale-110"><span class="text-[18px] drop-shadow-md">${emoji}</span></div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
    };
  }, [L]);

  const createPm25Icon = useMemo(() => {
    if (!L) return () => null;
    return (pmVal: number) => {
      const { color, shadow } = getAirQualityDetails(pmVal);
      return L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex flex-col items-center justify-center w-[48px] h-[48px] bg-[#0f172a]/95 border-[2px] rounded-xl backdrop-blur-md transition-transform hover:scale-110 z-10" style="border-color: ${color}; box-shadow: 0 0 15px ${shadow};"><span class="text-white font-bold text-[15px] leading-none mt-1 z-0">${pmVal.toFixed(1)}</span><span class="text-[10px] font-bold mt-1.5 z-0 tracking-widest" style="color: ${color};">PM2.5</span></div>`, iconSize: [48, 48], iconAnchor: [24, 24] });
    };
  }, [L]);

  const createReportIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#ef4444] rounded-full blur-[8px] opacity-60 animate-pulse"></div><div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#ef4444] rounded-full shadow-[0_0_15px_rgba(239,68,68,0.9)] z-10"><span class="text-[#ef4444] text-[14px]">🚨</span></div></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
  }, [L]);

  const createHotspotIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#ea580c] rounded-full blur-[8px] opacity-60"></div><div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#ea580c] rounded-full shadow-[0_0_15px_rgba(234,88,12,0.9)] z-10"><span class="text-[#ea580c] text-[14px]">🔥</span></div></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
  }, [L]);

  const createQuakeIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#c084fc] rounded-full blur-[8px] opacity-50"></div><div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#c084fc] rounded-full shadow-[0_0_15px_rgba(192,132,252,0.9)] z-10"><span class="text-[#c084fc] text-[14px] font-bold">〰</span></div></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
  }, [L]);

  const createWaterLevelIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-[36px] h-[36px] bg-[#0f172a] border-[2px] border-[#3b82f6] rounded-full shadow-[0_0_15px_rgba(59,130,246,0.6)] transition-transform hover:scale-110 z-20"><span class="text-[16px] drop-shadow-md">🌊</span></div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
  }, [L]);

  const createUserLocationIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-8 h-8"><div class="absolute inset-0 bg-[#38bdf8] rounded-full blur-[6px] opacity-70 animate-ping"></div><div class="relative flex items-center justify-center w-5 h-5 bg-[#0ea5e9] border-[2px] border-white rounded-full shadow-lg z-10"></div></div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
  }, [L]);

  const createSafeZoneIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#10b981] rounded-full blur-[8px] opacity-40"></div><div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#10b981] rounded-full shadow-[0_0_15px_rgba(16,185,129,0.9)] z-10"><span class="text-[#10b981] text-[13px]">🛡️</span></div></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
  }, [L]);

  // ==========================================
  // 🚀 โครงสร้างหน้าเว็บหลัก (HTML UI)
  // ==========================================
  return (
    <main className="relative w-screen h-screen bg-[#0b132b] font-sans text-white overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: transparent !important; cursor: crosshair !important; }
        .leaflet-top.leaflet-left { top: 90px !important; left: 10px !important; }
        @media (min-width: 768px) { .leaflet-top.leaflet-left { top: 90px !important; left: 370px !important; } }
        .leaflet-bar a { background-color: #0f172a !important; color: #fff !important; border: 1px solid #1e293b !important; border-radius: 8px !important; }
        .leaflet-bar a:hover { background-color: #1e293b !important; }
        .leaflet-div-icon { background: transparent !important; border: none !important; }
        .leaflet-tooltip { pointer-events: none !important; }
        .leaflet-interactive:focus { outline: none !important; }
        
        .leaflet-tooltip.village-hover-tooltip { 
          background-color: #ffffff !important; color: #0f172a !important; border: 1px solid #cbd5e1 !important; 
          font-family: inherit !important; font-size: 14px !important; font-weight: 600 !important; 
          padding: 6px 14px !important; border-radius: 6px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important; 
        }
        
        .popup-location .leaflet-popup-content-wrapper { background-color: #0f172a !important; color: #e2e8f0 !important; border: 1px solid #0ea5e9 !important; border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important; padding: 0 !important; overflow: hidden; }
        .popup-location .leaflet-popup-tip { background-color: #0f172a !important; border-top: 1px solid #0ea5e9 !important; border-left: 1px solid #0ea5e9 !important; }
        .popup-location .leaflet-popup-content { margin: 0 !important; }

        .popup-safezone .leaflet-popup-content-wrapper { background-color: #0f172a !important; color: #e2e8f0 !important; border: 1px solid #10b981 !important; border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important; padding: 0 !important; overflow: hidden; }
        .popup-safezone .leaflet-popup-tip { background-color: #0f172a !important; border-top: 1px solid #10b981 !important; border-left: 1px solid #10b981 !important; }
        .popup-safezone .leaflet-popup-content { margin: 0 !important; }

        .popup-pm25-custom .leaflet-popup-content-wrapper { background-color: #0b132b !important; color: #e2e8f0 !important; border-radius: 8px !important; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8) !important; padding: 0 !important; overflow: hidden; border: 1px solid #1e293b !important; }
        .popup-pm25-custom .leaflet-popup-tip { background-color: #0b132b !important; border-bottom: 1px solid #1e293b !important; border-right: 1px solid #1e293b !important; }
        .popup-pm25-custom .leaflet-popup-content { margin: 0 !important; width: 290px !important; }
        .popup-pm25-custom .leaflet-popup-close-button { color: rgba(0,0,0,0.4) !important; font-size: 20px !important; padding-top: 6px !important; padding-right: 12px !important; z-index: 50; }
        .popup-pm25-custom .leaflet-popup-close-button:hover { color: rgba(0,0,0,0.8) !important; background: transparent !important; }

        .popup-tmd-weather .leaflet-popup-content-wrapper { background-color: #0f172a !important; color: #e2e8f0 !important; border: 1px solid #38bdf8 !important; border-radius: 10px !important; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7) !important; padding: 0 !important; overflow: hidden; }
        .popup-tmd-weather .leaflet-popup-tip { background-color: #0f172a !important; border-top: 1px solid #38bdf8 !important; border-left: 1px solid #38bdf8 !important; }
        .popup-tmd-weather .leaflet-popup-content { margin: 0 !important; width: 280px !important; }
        .popup-tmd-weather .leaflet-popup-close-button { color: #0f172a !important; font-size: 18px !important; padding-top: 5px !important; padding-right: 10px !important; z-index: 50; }
        .popup-tmd-weather .leaflet-popup-close-button:hover { color: #ffffff !important; background: transparent !important; }

        .popup-tmd-rain .leaflet-popup-content-wrapper { background-color: #0f172a !important; color: #e2e8f0 !important; border: 1px solid #facc15 !important; border-radius: 10px !important; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7) !important; padding: 0 !important; overflow: hidden; }
        .popup-tmd-rain .leaflet-popup-tip { background-color: #0f172a !important; border-top: 1px solid #facc15 !important; border-left: 1px solid #facc15 !important; }
        .popup-tmd-rain .leaflet-popup-content { margin: 0 !important; width: 280px !important; }
        .popup-tmd-rain .leaflet-popup-close-button { color: #0f172a !important; font-size: 18px !important; padding-top: 5px !important; padding-right: 10px !important; z-index: 50; }
        .popup-tmd-rain .leaflet-popup-close-button:hover { color: #ffffff !important; background: transparent !important; }

        .popup-report .leaflet-popup-content-wrapper { background-color: rgba(15, 23, 42, 0.95) !important; color: #e2e8f0 !important; border: 1px solid #ef4444 !important; border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important; padding: 0 !important; overflow: hidden; }
        .popup-report .leaflet-popup-tip { background-color: rgba(15, 23, 42, 0.95) !important; border-top: 1px solid #ef4444 !important; border-left: 1px solid #ef4444 !important; }
        .popup-report .leaflet-popup-content { margin: 0 !important; }

        .popup-hotspot .leaflet-popup-content-wrapper { background-color: rgba(15, 23, 42, 0.95) !important; color: #e2e8f0 !important; border: 1px solid #ea580c !important; border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important; padding: 0 !important; overflow: hidden; }
        .popup-hotspot .leaflet-popup-tip { background-color: rgba(15, 23, 42, 0.95) !important; border-top: 1px solid #ea580c !important; border-left: 1px solid #ea580c !important; }
        .popup-hotspot .leaflet-popup-content { margin: 0 !important; }

        .popup-quake .leaflet-popup-content-wrapper { background-color: rgba(15, 23, 42, 0.95) !important; color: #e2e8f0 !important; border: 1px solid #a855f7 !important; border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important; padding: 0 !important; overflow: hidden; }
        .popup-quake .leaflet-popup-tip { background-color: rgba(15, 23, 42, 0.95) !important; border-top: 1px solid #a855f7 !important; border-left: 1px solid #a855f7 !important; }
        .popup-quake .leaflet-popup-content { margin: 0 !important; }

        .popup-water .leaflet-popup-content-wrapper { background-color: #0f172a !important; color: #e2e8f0 !important; border: 1px solid #3b82f6 !important; border-radius: 10px !important; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7) !important; padding: 0 !important; overflow: hidden; }
        .popup-water .leaflet-popup-tip { background-color: #0f172a !important; border-top: 1px solid #3b82f6 !important; border-left: 1px solid #3b82f6 !important; }
        .popup-water .leaflet-popup-content { margin: 0 !important; width: 280px !important; }
        .popup-water .leaflet-popup-close-button { color: #0f172a !important; font-size: 18px !important; padding-top: 5px !important; padding-right: 10px !important; z-index: 50; }
        .popup-water .leaflet-popup-close-button:hover { color: #ffffff !important; background: transparent !important; }

        .leaflet-popup-close-button { color: #cbd5e1 !important; font-size: 16px !important; padding-top: 4px !important; padding-right: 8px !important; z-index: 50;}
        .leaflet-popup-close-button:hover { color: #ef4444 !important; background: transparent !important; }

        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 5px; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-api { animation: fadeIn 0.3s ease-out forwards; }
      `}} />

      {/* ม่านดำเวลาเปิด Sidebar ในมือถือ */}
      {isMobile && (isLeftPanelOpen || isRightPanelOpen) && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          onClick={() => { setIsLeftPanelOpen(false); setIsRightPanelOpen(false); }}
        />
      )}

      {/* Modal สแกนแจ้งเหตุ */}
      {showScanModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-[#1e293b] w-[90%] max-w-[400px] rounded-2xl shadow-2xl p-8 relative flex flex-col items-center justify-center mx-auto text-center animate-fade-in-api">
            <button onClick={() => setShowScanModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl font-bold leading-none">&times;</button>
            <h2 className="text-[20px] font-bold text-white mb-2 w-full">สแกนเพื่อแจ้งจุดเสี่ยงภัย</h2>
            <p className="text-[14px] text-gray-400 mb-6 leading-relaxed w-full">พบเห็นจุดเสี่ยงภัย สามารถสแกนคิวอาร์โค้ดด้านล่างนี้เพื่อแจ้งเหตุได้ทันที</p>
            <div className="bg-white p-4 rounded-2xl shadow-inner mb-6 flex items-center justify-center">
              {qrUrl ? (
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} alt="QR Code" className="w-48 h-48 object-contain rounded-lg"/>
              ) : (
                <div className="w-48 h-48 bg-gray-100 flex items-center justify-center text-gray-400 text-sm rounded-lg animate-pulse border-2 border-dashed border-gray-300">กำลังสร้าง QR Code...</div>
              )}
            </div>
            <div className="flex flex-col space-y-3 w-full mt-2">
              <a href="/report" target="_blank" rel="noopener noreferrer" className="py-3 w-full bg-gradient-to-r from-[#06b6d4] to-[#0284c7] text-white font-bold text-[15px] rounded-xl shadow-lg hover:brightness-110 transition-all flex items-center justify-center space-x-2">
                <span>เปิดหน้าฟอร์มแจ้งจุดเสี่ยงภัย</span>
              </a>
              <button onClick={() => setShowScanModal(false)} className="py-3 w-full bg-[#1e293b] text-gray-300 font-semibold text-[15px] rounded-xl hover:bg-[#334155] transition-colors">ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}

      {/* 🗺️ ระบบแผนที่หลัก */}
      <div className="absolute inset-0 z-0 bg-[#0b132b] overflow-hidden">        
        <div className="absolute inset-0 pointer-events-auto" style={{ zIndex: 10 }}>         
            
          {/* 🚀 ชุดปุ่มควบคุมแผนที่ (เลื่อนหลบอัตโนมัติเมื่อกาง/พับ Sidebar) */}
          <div 
            className={`absolute top-[110px] z-[1000] flex flex-col space-y-2 transition-all duration-500 ease-in-out pointer-events-auto ${
              isLeftPanelOpen 
                ? 'left-[315px] md:left-[390px]' /* ระยะตอนกาง Sidebar (หลบมาทางขวา) */
                : 'left-[15px] md:left-[50px]'   /* ระยะตอนพับ Sidebar (กลับไปชิดขอบซ้าย) */
            }`}
          >
            
            {/* 📍 ปุ่ม Locate Me */}
            <button 
              onClick={(e) => { e.stopPropagation(); handleLocateMe(); }}
              className="w-[36px] h-[36px] bg-[#111827]/95 backdrop-blur-md border border-[#334155] rounded-xl shadow-[0_4px_15px_rgba(0,0,0,0.5)] flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#1f2937] transition-all duration-200 group"
              title="ตำแหน่งของฉัน"
            >
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform text-[#38bdf8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v2m0 12v2m8-8h-2M6 12H4m14 0a6 6 0 11-12 0 6 6 0 0112 0z" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
              </svg>
            </button>

            {/* 🔍 กลุ่มปุ่ม Zoom In / Out */}
            <div className="flex flex-col bg-[#111827]/95 backdrop-blur-md border border-[#334155] rounded-xl shadow-[0_4px_15px_rgba(0,0,0,0.5)] overflow-hidden">
              <button 
                onClick={(e) => { e.stopPropagation(); mapRef?.zoomIn(); }}
                className="w-[36px] h-[36px] flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#1f2937] transition-colors"
                title="ซูมเข้า"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v12m-6-6h12" /></svg>
              </button>
              
              <div className="h-[1px] w-[20px] mx-auto bg-[#334155]"></div>
              
              <button 
                onClick={(e) => { e.stopPropagation(); mapRef?.zoomOut(); }}
                className="w-[36px] h-[36px] flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#1f2937] transition-colors"
                title="ซูมออก"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
              </button>
            </div>
            
          </div>

          <MapContainer 
          center={[18.1633, 98.3744]} 
          zoom={isMobile ? 10 : 11} 
          maxZoom={20} 
          zoomControl={false} 
          attributionControl={false} 
          preferCanvas={true} /* 👈 เพิ่มบรรทัดนี้บรรทัดเดียว ลื่นขึ้น 300% */
          className="w-full h-full z-0" 
          ref={setMapRef}
          >
            
            {!windyLayer && !satelliteLayer && <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={20} />}
            {!windyLayer && satelliteLayer && <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} />}
            
            {/* 🚀 หมุดตำแหน่งผู้ใช้งานปัจจุบัน */}
            {userLocation && (
              <Marker position={[userLocation.lat, userLocation.lng]} icon={createUserLocationIcon()}>
                <Popup className="popup-location">
                  <div className="p-3 bg-[#0f172a] text-center min-w-[180px]">
                    <div className="text-[#38bdf8] font-bold text-[15px] mb-2 border-b border-[#1e293b] pb-2 flex items-center justify-center space-x-1.5">
                      <span>📍</span> <span>ตำแหน่งของคุณ</span>
                    </div>
                    <div className="text-gray-300 text-[13px] font-mono mb-1">Lat: <span className="text-white">{userLocation.lat.toFixed(6)}</span></div>
                    <div className="text-gray-300 text-[13px] font-mono">Lng: <span className="text-white">{userLocation.lng.toFixed(6)}</span></div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* 🚀 หมุดศูนย์พักพิง/ปลอดภัย */}
            {showSafeZone && safeZonesData.map((sz, i) => (
              <Marker key={`safezone-${i}`} position={[sz.lat, sz.lng]} icon={createSafeZoneIcon()}>
                <Popup className="popup-safezone">
                  <div className="p-3 bg-[#0f172a] min-w-[150px]">
                    <div className="text-[#10b981] font-bold text-[14px] mb-1 flex items-center space-x-1.5">
                      <span>🛡️</span> <span>จุดปลอดภัย/ศูนย์พักพิง</span>
                    </div>
                    <div className="text-white text-[13px] font-semibold">{sz.name}</div>
                    <div className="text-gray-400 text-[10px] mt-2 border-t border-[#1e293b] pt-2">เทศบาลตำบลบ่อหลวง</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* 🚀 ขอบเขตบ่อหลวง (Hover เฉพาะเส้นขอบ) */}
            {showBoluang && geoBoluang && <GeoJSON key="boluang-layer" data={geoBoluang} style={styleBoluang} onEachFeature={onEachBoluangFeature} />}
            
            {showBlock && geoBlock && <GeoJSON key="block-layer" data={geoBlock} style={getBlockStyle} onEachFeature={onEachBlockFeature} />}
            {showParcel && geoParcel && <GeoJSON key="parcel-layer" data={geoParcel} style={styleParcel} />}
            
            {showLandslide && geoLandslide && (
              <GeoJSON 
                key="landslide-layer" 
                data={geoLandslide} 
                style={styleLandslide} 
                onEachFeature={(feature: any, layer: any) => {
                  const riskLevel = feature.properties?.risk || feature.properties?.Risk || feature.properties?.RISK_LEVEL || 'พื้นที่เสี่ยงดินถล่ม';
                  layer.bindTooltip(`⚠️ ระดับความเสี่ยง: ${riskLevel}`, { sticky: true, direction: 'auto', className: 'village-hover-tooltip' });
                }} 
              />
            )}

            {tmdWeather && localWeatherData.map((prov, i) => {
              return (
                <Marker key={`prov-wx-${i}`} position={[prov.lat, prov.lng]} icon={createTmdIcon(prov.wCode)}>
                  <Popup className="popup-tmd-weather">
                    <div>
                      <div className="bg-[#38bdf8] px-4 py-3 font-bold text-[#0f172a] text-[15px] flex items-center shadow-sm">
                        <span className="mr-2 text-[18px]">☁️</span> พยากรณ์อากาศ
                      </div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="font-bold text-white mb-3 pb-2 border-b border-[#1e293b] flex items-center">
                          จุดตรวจวัด: {prov.name}
                          {prov.type === 'local' && <span className="bg-[#10b981] text-white px-1.5 py-0.5 rounded text-[10px] ml-2 font-mono">Micro-climate</span>}
                          {prov.type === 'district' && <span className="bg-[#f59e0b] text-white px-1.5 py-0.5 rounded text-[10px] ml-2">ระดับอำเภอ</span>}
                        </div>
                        <div className="text-[13px] text-gray-300 space-y-2 font-medium mb-4">
                          <div>สภาพอากาศ: <span className="text-white">{getWmoWeatherDesc(prov.wCode)}</span></div>
                          <div>อุณหภูมิ: <span className="text-[#38bdf8] font-bold text-[15px]">{prov.tempMin.toFixed(1)}° – {prov.tempMax.toFixed(2)}°C</span></div>
                          <div>ฝน: <span className="text-white">{prov.rain} มม.</span></div>
                          <div>ความชื้น: <span className="text-white">{prov.humidity}%</span></div>
                          <div>ลม: <span className="text-white">{prov.wind.toFixed(2)} ม./วินาที</span></div>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono text-left pt-3 border-t border-[#1e293b]">
                          ข้อมูลจาก TMD API · {new Date().toISOString().split('T')[0]}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {tmdRain && localWeatherData.map((prov, i) => {
              const style = getRainCircleStyle(prov.rainSum);
              return (
                <CircleMarker key={`rain-prov-${i}`} center={[prov.lat, prov.lng]} radius={style.radius} pathOptions={{ color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }}>
                  <Popup className="popup-tmd-rain">
                    <div>
                      <div className="bg-[#fcd34d] px-4 py-3 font-bold text-[#0f172a] text-[15px] flex items-center shadow-sm">
                        <span className="mr-2 text-[18px]">🌧️</span> ปริมาณน้ำฝนสะสม
                      </div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="font-bold text-white mb-3 pb-2 border-b border-[#1e293b] flex items-center">
                          พื้นที่: {prov.name}
                          {prov.type === 'local' && <span className="bg-[#10b981] text-white px-1.5 py-0.5 rounded text-[10px] ml-2 font-mono">Micro-climate</span>}
                          {prov.type === 'district' && <span className="bg-[#f59e0b] text-white px-1.5 py-0.5 rounded text-[10px] ml-2">ระดับอำเภอ</span>}
                        </div>
                        <div className="text-[13px] text-gray-300 space-y-2 font-medium mb-4">
                          <div>ฝนสะสม: <span className="text-[#fcd34d] font-bold text-[15px]">{prov.rainSum.toFixed(1)} มม.</span></div>
                          <div>ขนาดจุด: <span className="text-white">{style.radius.toFixed(1)} px</span></div>
                          <div>สภาพอากาศ: <span className="text-white">{getWmoWeatherDesc(prov.wCode)}</span></div>
                          <div>อุณหภูมิ: <span className="text-white">{prov.tempMin.toFixed(2)}° – {prov.tempMax.toFixed(2)}°C</span></div>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono text-left pt-3 border-t border-[#1e293b] leading-relaxed">
                          ข้อมูลจาก TMD API · {new Date().toISOString().split('T')[0]}<br/>
                          <span className="text-gray-600">- ปรับขนาดจุดตามฝนสะสม</span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {onwrRain && onwrRainData.map((station: any, i: number) => {
              const latStr = station?.station?.tele_station_lat || station?.tele_station_lat || station?.lat || station?.latitude;
              const lngStr = station?.station?.tele_station_long || station?.tele_station_long || station?.lng || station?.longitude || station?.lon;
              if (!latStr || !lngStr) return null;
              
              const lat = parseFloat(latStr);
              const lng = parseFloat(lngStr);
              if (isNaN(lat) || isNaN(lng)) return null;

              const rainVal = parseFloat(station?.rain_24h) || 0;
              const style = getRainCircleStyle(rainVal);
              const stationName = station?.station?.tele_station_name?.th || station?.station?.tele_station_name || station?.tele_station_name?.th || station?.tele_station_name || 'ไม่ทราบชื่อสถานี';
              const provName = station?.station?.province_name?.th || station?.province_name?.th || '-';
              
              return (
                <CircleMarker key={`onwr-rain-${i}`} center={[lat, lng]} radius={style.radius} pathOptions={{ color: '#2563eb', fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }}>
                  <Popup className="popup-tmd-rain">
                    <div>
                      <div className="bg-[#3b82f6] px-4 py-3 font-bold text-white text-[15px] flex items-center shadow-sm">
                        <span className="mr-2 text-[18px]">🌧️</span> ปริมาณฝน 24 ชม. (สทนช.)
                      </div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="text-[14px] font-bold text-white mb-3 pb-2 border-b border-[#1e293b]">
                          สถานี: {stationName}
                        </div>
                        <div className="text-[13px] text-gray-300 space-y-2 font-medium mb-4">
                          <div>จังหวัด: <span className="text-white">{provName}</span></div>
                          <div>ปริมาณฝน: <span className="text-[#3b82f6] font-bold text-[16px]">{rainVal.toFixed(1)} มม.</span></div>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono text-left pt-3 border-t border-[#1e293b] leading-relaxed">
                          ข้อมูลจาก สทนช. (ThaiWater)<br/>
                          Station ID: {station?.station?.tele_station_id || station?.tele_station_id || '-'}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {onwrWaterLevel && onwrWaterLevelData.map((station: any, i: number) => {
              const latStr = station?.station?.tele_station_lat || station?.tele_station_lat || station?.lat || station?.latitude;
              const lngStr = station?.station?.tele_station_long || station?.tele_station_long || station?.lng || station?.longitude || station?.lon;
              
              if (!latStr || !lngStr) return null;
              
              const lat = parseFloat(latStr);
              const lng = parseFloat(lngStr);
              if (isNaN(lat) || isNaN(lng)) return null;
              
              const waterLevelRaw = station?.waterlevel || station?.water_level || station?.waterlevel_msl || station?.wl || station?.station?.water_level;
              const waterLevel = parseFloat(waterLevelRaw) || 0;
              
              const stationName = station?.station?.tele_station_name?.th || station?.station?.tele_station_name || station?.tele_station_name?.th || station?.tele_station_name || station?.name?.th || station?.name || 'ไม่ทราบชื่อสถานี';
              
              const basin = station?.station?.basin?.basin_name?.th || station?.basin?.basin_name?.th || station?.basin_name || '-';
              const dischargeRaw = station?.discharge || station?.discharge_rate || station?.flow;
              const discharge = dischargeRaw ? `${dischargeRaw} ลบ.ม./วินาที` : 'ไม่มีข้อมูล';
              const time = station?.waterlevel_datetime || station?.water_level_datetime || station?.datetime || '-';
              
              return (
                <Marker key={`onwr-water-${i}`} position={[lat, lng]} icon={createWaterLevelIcon()}>
                  <Popup className="popup-water">
                    <div>
                      <div className="bg-[#2563eb] px-4 py-3 font-bold text-white text-[15px] flex items-center shadow-sm">
                        <span className="mr-2 text-[18px]">🌊</span> ระดับน้ำ (สทนช.)
                      </div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="text-[14px] font-bold text-white mb-3 pb-2 border-b border-[#1e293b]">
                          สถานี: {stationName}
                        </div>
                        <div className="text-[13px] text-gray-300 space-y-2 font-medium mb-4">
                          <div>ลุ่มน้ำ: <span className="text-white">{basin}</span></div>
                          <div>ระดับน้ำ: <span className="text-[#60a5fa] font-bold text-[16px]">{waterLevel.toFixed(2)} ม.รทก.</span></div>
                          <div>อัตราการไหล: <span className="text-white">{discharge}</span></div>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono text-left pt-3 border-t border-[#1e293b] leading-relaxed">
                          ข้อมูลจาก สทนช. (ThaiWater)<br/>
                          เวลา: {time}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {pm25 && localAirData.map((station, i) => {
              const { aqi, text, color } = getAirQualityDetails(station.pm25Val);
              const formattedTime = new Date(station.time).toISOString().replace('T', ' ').substring(0, 16);
              const stationId = `BL-AIR-${(i + 1).toString().padStart(3, '0')}`;
              
              return (
                <Marker key={`national-pm25-${i}`} position={[station.lat, station.lng]} icon={createPm25Icon(station.pm25Val)}>
                  <Popup className="popup-pm25-custom">
                    <div className="flex flex-col">
                      <div style={{ backgroundColor: color }} className="px-4 py-3 font-bold text-[#0f172a] text-[15px] flex items-center shadow-sm rounded-t-lg relative">
                        <span className="mr-2 text-[18px]">🌫️</span> ค่าฝุ่น PM2.5 / AQI
                      </div>
                      
                      <div className="p-4 bg-[#0b132b] text-[14px] text-gray-200 font-medium rounded-b-lg">
                        <div className="font-bold text-white mb-3 pb-2 border-b border-[#1e293b] flex items-center">
                          จุดตรวจวัด: {station.name}
                          {station.type === 'local' && <span className="bg-[#10b981] text-white px-1.5 py-0.5 rounded text-[10px] ml-2 font-mono">Micro-climate</span>}
                          {station.type === 'district' && <span className="bg-[#f59e0b] text-white px-1.5 py-0.5 rounded text-[10px] ml-2">ระดับอำเภอ</span>}
                        </div>

                        <div className="space-y-1.5 font-bold text-[15px]">
                          <div className="flex items-center">
                            <span className="w-16 text-white">PM2.5:</span>
                            <span style={{ color: color }} className="text-[17px]">{station.pm25Val.toFixed(1)} <span className="text-[14px]">µg/m³</span></span>
                          </div>
                          <div className="flex items-center">
                            <span className="w-16 text-white">AQI:</span>
                            <span className="text-white">{aqi} <span style={{ color: color }}>({text})</span></span>
                          </div>
                          <div className="flex items-center text-white">
                            <span className="w-16">PM10:</span>
                            <span className="font-normal">{station.pm10Val !== '—' ? `${station.pm10Val} µg/m³` : '—'}</span>
                          </div>
                          <div className="flex items-center text-white pt-1">
                            <span className="font-bold">O₃:</span> <span className="font-normal ml-1">{station.o3Val}</span>
                            <span className="mx-2 text-gray-500">·</span> 
                            <span className="font-bold">CO:</span> <span className="font-normal ml-1">{station.coVal}</span>
                          </div>
                          <div className="flex items-center text-white">
                            <span className="font-bold">NO₂:</span> <span className="font-normal ml-1">{station.no2Val}</span>
                            <span className="mx-2 text-gray-500">·</span> 
                            <span className="font-bold">SO₂:</span> <span className="font-normal ml-1">{station.so2Val}</span>
                          </div>
                        </div>

                        <div className="border-t border-[#1e293b] my-3"></div>
                        <div className="text-[11px] text-gray-400 font-mono tracking-wide leading-relaxed">
                          ข้อมูลค่าฝุ่น · {formattedTime} · Station ID:<br/>{stationId}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {citizenReport && disasterReports.map((report) => (
              <Marker 
                key={`report-${report.id}`} 
                position={[report.latitude, report.longitude]} 
                icon={createReportIcon()}
              >
                <Popup className="popup-report">
                  <div className="w-[320px]">
                    <div className="bg-[#ef4444] px-5 py-3 font-bold text-white text-[15px] flex items-center shadow-sm">
                      <span className="mr-2 text-[18px]">🚨</span> แจ้งเหตุ: {report.risk_type}
                    </div>
                    <div className="p-5 bg-[#0f172a]/95 backdrop-blur-sm">
                      
                      <div className="text-[14px] text-gray-300 font-medium mb-4 flex items-center justify-between">
                        <span>ความรุนแรง: <span className="bg-[#ef4444] text-white px-2 py-1 rounded text-[13px] font-bold ml-1">ระดับ {report.severity_level}</span></span>
                        <span className="text-yellow-400 border border-yellow-400/50 bg-yellow-400/10 px-2 py-0.5 rounded text-[11px]">{report.status}</span>
                      </div>
                      
                      <div className="border-t border-[#1e293b] py-3 text-[13px] text-gray-300 leading-relaxed font-semibold">
                        📍 พื้นที่: <span className="text-white">{report.village_name}</span><br/>
                        🎯 พิกัด (GPS): <span className="text-[#4ade80] font-mono select-all cursor-text">{report.latitude.toFixed(6)}, {report.longitude.toFixed(6)}</span><br/>
                        📝 รายละเอียด: <span className="text-gray-400 font-normal">{report.description}</span><br/>
                        👤 ผู้แจ้ง: <span className="text-[#38bdf8]">{report.reporter_name}</span> <span className="text-[11px] text-gray-500">({report.reporter_role})</span>
                      </div>

                      {report.image_url && (
                        <div className="border-t border-[#1e293b] pt-3 mt-1">
                          <div 
                            className="relative group cursor-pointer overflow-hidden rounded-lg border border-[#1e293b] hover:border-[#38bdf8] transition-colors"
                            onClick={(e) => {
                              e.stopPropagation(); 
                              handleViewImage(report.image_url);
                            }}
                          >
                            <img 
                              src={report.image_url} 
                              alt="ภาพแจ้งเหตุ" 
                              className="w-full h-[120px] object-cover group-hover:scale-105 transition-transform duration-500" 
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                              <span className="text-white text-[12px] font-bold bg-[#0b132b]/80 border border-[#38bdf8] px-3 py-1.5 rounded-full shadow-lg flex items-center space-x-1.5 backdrop-blur-sm">
                                <span>🔍</span> <span>คลิกดูรูปขยาย</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 🚀 ชุดปุ่ม นำทาง / Google Maps */}
                      <div className="mt-4 pt-3 border-t border-[#1e293b] flex items-center justify-between">
                        <div className="flex space-x-2 w-full">
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex-1 bg-[#003ea1] hover:bg-[#002f7a] text-white text-[12px] font-bold py-2 rounded-lg flex items-center justify-center transition-colors shadow-md"
                          >
                            📍 เปิดใน Maps
                          </a>
                          <a 
                            href={`https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex-1 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-gray-800 text-[12px] font-bold py-2 rounded-lg flex items-center justify-center transition-colors shadow-md"
                          >
                            🚗 นำทาง
                          </a>
                        </div>
                      </div>

                      <div className="pt-3 mt-2 text-[10px] text-gray-500 font-mono text-center">
                        แจ้งเมื่อ: {new Date(report.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} น.
                      </div>

                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {hotspot && geoHotspot && geoHotspot.features && geoHotspot.features.map((feature: any, i: number) => {
              const geom = feature.geometry;
              if (!geom || geom.type !== 'Point') return null;
              const lng = geom.coordinates[0]; const lat = geom.coordinates[1];
              const props = feature.properties || {};
              const areaType = props['ประเภทของพื้นที่'] || props.AREA_TYPE || props.area_type || props.lu_desc || props.type || 'ไม่ระบุ';
              const provName = props['จังหวัด'] || props.PROV_NAM_T || props.prov_name || props.province || 'ไม่ระบุ';
              const tamName = props['ตำบล'] || props.TAM_NAM_T || props.tam_name || props.tambon || props.subdistrict || 'ไม่ระบุ';

              return (
                <Marker key={`hotspot-real-${i}`} position={[lat, lng]} icon={createHotspotIcon()}>
                  <Popup className="popup-hotspot">
                    <div className="w-[280px]">
                      <div className="bg-[#f97316] px-5 py-3 font-bold text-[#0f172a] text-[15px] flex items-center shadow-sm">
                        <span className="mr-2 text-[18px]">🔥</span> จุดความร้อน Hotspot
                      </div>
                      <div className="p-5 bg-[#0f172a]/95 backdrop-blur-sm">
                        <div className="text-[14px] text-gray-300 font-medium mb-4">
                          ประเภทของพื้นที่: <span className="bg-[#3b82f6] text-white px-2 py-1 rounded text-[13px] font-bold ml-1">{areaType}</span>
                        </div>
                        <div className="border-t border-[#1e293b] py-3 text-[13px] text-gray-300 leading-relaxed font-semibold">
                          จังหวัด: <span className="text-white">{provName}</span><br/>
                          ตำบล: <span className="text-white">{tamName}</span>
                        </div>
                        <div className="border-t border-[#1e293b] pt-3 text-[11px] text-gray-500 font-mono">
                          Layer: GISTDA Sphere API
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {earthquakeLayer && geoEarthquake && geoEarthquake.features && geoEarthquake.features.map((feature: any, i: number) => {
              const geom = feature.geometry;
              if (!geom || geom.type !== 'Point') return null;
              const lng = geom.coordinates[0]; const lat = geom.coordinates[1];
              const props = feature.properties || {};
              const areaName = props['พื้นที่'] || props.FAULT_NAME || props.fault || props.area || 'ไม่ระบุ';
              const provName = props['จังหวัด'] || props.PROV_NAM_T || props.province || 'ไม่ระบุ';
              const distName = props['อำเภอ/แนวพื้นที่'] || props.AMP_NAM_T || props.district || 'ไม่ระบุ';
              const riskLevel = props['ระดับความเสี่ยง'] || props.RISK_LEVEL || props.risk || 'ไม่ระบุ';
              const mag = props['สถานการณ์จำลอง'] || props.MAGNITUDE || props.magnitude || 'ไม่ระบุ';

              return (
                <Marker key={`quake-real-${i}`} position={[lat, lng]} icon={createQuakeIcon()}>
                  <Popup className="popup-quake">
                    <div className="w-[280px]">
                      <div className="bg-[#a855f7] px-5 py-3 font-bold text-white text-[15px] flex items-center shadow-sm">
                        <span className="mr-2 text-[18px]">〰️</span> จุดเสี่ยงแผ่นดินไหว
                      </div>
                      <div className="p-5 bg-[#0f172a]/95 backdrop-blur-sm">
                        <div className="text-[14px] text-gray-300 font-medium mb-4">
                          พื้นที่: <span className="text-[#c084fc] font-bold text-[15px] ml-1">{areaName}</span>
                        </div>
                        <div className="border-t border-[#1e293b] py-3 text-[13px] text-gray-300 leading-relaxed font-semibold">
                          จังหวัด: {provName}<br/>
                          อำเภอ/แนวพื้นที่: {distName}<br/>
                          ระดับความเสี่ยง: <span className="text-[#facc15]">{riskLevel}</span><br/>
                          สถานการณ์จำลอง: <span className="text-white">{mag}</span>
                        </div>
                        <div className="border-t border-[#1e293b] pt-3 text-[11px] text-gray-500 font-mono">
                          Layer: earthquake.geojson
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          </MapContainer>
        </div>
      </div>

      {/* ========================================== */}
      {/* 🚀 6. แถบเครื่องมือและ Legend */}
      {/* ========================================== */}

      <header className="absolute top-0 left-0 right-0 h-[72px] bg-[#0b132b]/95 border-b border-[#1e293b] backdrop-blur-xl z-[80] flex items-center justify-between px-4 md:px-6 pointer-events-auto shadow-md">
        <div className="flex items-center space-x-4 md:space-x-6">
          <button onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)} className="md:hidden p-2 bg-[#1e293b] rounded-lg text-gray-300 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>

          <div className="flex items-center space-x-3 md:space-x-4">
            
         {/* 🚀 โลโก้ GIS บ่อหลวง (แก้ปัญหาขอบแหว่งขั้นเด็ดขาด) */}
            <div className="relative flex-shrink-0 w-14 h-14 md:w-16 md:h-16 min-w-[56px] min-h-[56px] md:min-w-[64px] md:min-h-[64px] rounded-full shadow-[0_0_15px_rgba(56,189,248,0.4)] flex items-center justify-center bg-[#e5e7eb] p-[1.5px]">
              <img 
                src="/Logogis3.png" 
                alt="โลโก้เทศบาลตำบลบ่อหลวง GIS" 
                className="w-full h-full object-fill rounded-full"
              />
            </div>
            
            <div className="flex flex-col justify-center ml-2">
  
  <div className="flex flex-col justify-center ml-2">
  
  {/* 💻 หน้าจอคอมพิวเตอร์ (โชว์เต็ม 2 บรรทัดเหมือนเดิม) */}
  <div className="hidden md:block">
    <h1 className="text-sm font-bold text-white">
      ระบบสารสนเทศทางภูมิศาสตร์เพื่อบริหารจัดการด้านสาธารณภัย
    </h1>
    <p className="text-xs text-blue-400">
      เทศบาลตำบลบ่อหลวง จ.เชียงใหม่
    </p>
  </div>

  {/* 📱 หน้าจอมือถือ (โชว์แค่คำว่า ระบบ GIS สาธารณภัย) */}
  <div className="block md:hidden">
    <h1 className="text-[13px] sm:text-sm font-bold text-white tracking-wide leading-tight">
      ระบบ GIS boluang
    </h1>
  </div>

</div>

</div>
            <div className="hidden lg:flex items-center space-x-6 border-l border-[#1e293b] pl-6">
            
            <div className="flex flex-col justify-center">
              <span className="text-[10px] text-gray-500 font-bold tracking-widest mb-0.5">สถานะระบบ</span>
              <div className="flex items-center text-[12px] font-mono text-gray-400">
                <div className="flex items-center space-x-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10b981]"></span>
                  </span>
                  <span className="text-[#10b981]">ONLINE</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center border-l border-[#1e293b] pl-6">
              <span className="text-[10px] text-gray-500 font-bold tracking-widest mb-0.5">สถิติผู้เข้าชม</span>
              <div className="flex items-center text-[12px] font-mono text-gray-400">
                <div className="flex items-center space-x-1.5">
                  <span>วันนี้: <span className="text-[#10b981]">{visitStats.today.toLocaleString()}</span></span>
                </div>
                <span className="mx-2 text-gray-600">|</span>
                <div className="flex items-center space-x-1.5">
                  <span>รวม: <span className="text-[#38bdf8]">{visitStats.total.toLocaleString()}</span></span>
                </div>
              </div>
            </div>

            {/* ======================================================== */}
          {/* 🤖 วางโค้ด Gemini AI ตรงนี้เลยครับ! */}
          <div className="hidden xl:flex flex-1 items-center justify-center px-6 animate-fade-in-api">
            <div className="bg-[#0f172a]/80 border border-emerald-500/30 rounded-full px-5 py-1.5 flex items-center space-x-3 shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all cursor-default">
              <span className="text-[18px] animate-pulse">🌤️</span>
              <div className="flex items-center space-x-2.5">
                <span className="text-[13px] font-bold text-[#38bdf8] tracking-wide">Gemini AI</span>
                <span className="bg-[#10b981] text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">SAFE</span>
                <span className="text-gray-500 mx-1">|</span>
                <span className="text-[12px] text-gray-300 font-medium">สภาพอากาศปกติ ไม่พบความเสี่ยงภัยพิบัติรุนแรง (ปริมาณฝน: 0 mm)</span>
              </div>
            </div>
          </div>
          {/* ======================================================== */}
            
          </div>
        </div>

        {/* === ฝั่งขวา: กลุ่มปุ่มเครื่องมือ === */}
        <div className="flex items-center space-x-2 md:space-x-3">          
          {/* 📱 1. ปุ่ม QR Code ติดตั้งแอป (ตรงจุดที่วงสีแดง) */}
          <button
            onClick={() => setShowQrModal(true)}
            className="hidden md:flex items-center bg-gradient-to-r from-blue-600 to-blue-500 border border-blue-400 hover:border-white rounded-full px-3 py-1.5 shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.6)] hover:scale-105 transition-all cursor-pointer group"
          >
            <svg className="w-4 h-4 text-white mr-1.5 group-hover:animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-[12px] font-bold text-white tracking-wide">ติดตั้งแอป (PWA)</span>
          </button>

          {/* 🗺️ 2. ปุ่ม GIS Layers (ของเดิม) */}
          <div onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className="flex items-center bg-[#0f172a]/80 border border-[#1e293b] rounded-full px-3 py-1.5 md:px-4 md:py-1.5 shadow-sm transition-all hover:bg-[#1e293b] cursor-pointer flex-shrink-0">
            <svg className="w-4 h-4 text-[#2dd4bf] mr-1.5 md:mr-2 transform rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
            <span className="text-[11px] md:text-[13px] font-mono font-medium text-gray-300 tracking-wide">
              GIS Layers <span className="hidden md:inline text-gray-500 mx-1">· boluang</span>
            </span>
          </div>
        </div>
        </div>
      </header>      
     {/* Sidebar ซ้าย (ข้อมูลอากาศ/น้ำ) */}
      <aside 
        className={`absolute top-[80px] md:top-24 z-[70] transition-transform duration-500 ease-in-out flex pointer-events-auto ${isLeftPanelOpen ? 'translate-x-0 left-0 md:left-4' : 'translate-x-[-100%] left-0 md:left-4'}`}
      >
        <div className="relative flex h-full items-start">
          
          {/* ตัวกรอบเนื้อหาแผงด้านซ้าย */}
          <div className="w-[300px] md:w-[350px] bg-[#0b132b]/95 border border-[#1e293b] rounded-r-2xl md:rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] p-4 md:p-5 backdrop-blur-xl max-h-[calc(100vh-100px)] overflow-y-auto custom-scrollbar">
            
            {/* 🌤️ การ์ดเข้าสู่ระบบ Weather Dashboard */}
            <div className="relative mb-4">
              <div 
                onClick={() => window.open('/weather', '_blank')}
                className="bg-[#0f172a] border border-[#1e293b] hover:border-[#0ea5e9]/50 rounded-2xl p-4 md:p-5 cursor-pointer transition-all shadow-lg group relative overflow-hidden"
              >
                <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#0ea5e9] rounded-full blur-[50px] opacity-10 group-hover:opacity-30 transition-opacity duration-500"></div>
                <div className="flex items-start space-x-4 relative z-10">
                  <div className="w-12 h-12 bg-gradient-to-b from-[#38bdf8] to-[#0284c7] rounded-[14px] flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                    </svg>
                  </div>
                  <div className="flex flex-col mt-0.5">
                    <h3 className="text-[15px] font-extrabold text-white group-hover:text-[#38bdf8] transition-colors leading-tight">ระบบตรวจสอบสภาพอากาศ</h3>
                    <p className="text-[12px] font-bold text-[#e2e8f0] mt-1 mb-1">Bo Luang Weather</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed">ตรวจสอบอุณหภูมิ ปริมาณฝน และการพยากรณ์อากาศในพื้นที่</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 🌊 การ์ดเข้าสู่ระบบ Flood Watch */}
            <div className="relative mb-4">
              <div 
                onClick={() => window.open('/flood', '_blank')}
                className="bg-[#0f172a] border border-[#1e293b] hover:border-[#3b82f6]/50 rounded-2xl p-4 md:p-5 cursor-pointer transition-all shadow-lg group relative overflow-hidden"
              >
                {/* เอฟเฟกต์แสง Background (Glow) โทนสีน้ำเงิน */}
                <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#3b82f6] rounded-full blur-[50px] opacity-10 group-hover:opacity-30 transition-opacity duration-500"></div>
                <div className="flex items-start space-x-4 relative z-10">
                  <div className="w-12 h-12 bg-gradient-to-b from-[#60a5fa] to-[#2563eb] rounded-[14px] flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div className="flex flex-col mt-0.5">
                    <h3 className="text-[15px] font-extrabold text-white group-hover:text-[#60a5fa] transition-colors leading-tight">ระบบเฝ้าระวังน้ำท่วมและน้ำป่า</h3>
                    <p className="text-[12px] font-bold text-[#e2e8f0] mt-1 mb-1">Bo Luang Flood Watch</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed">ติดตามระดับน้ำลำห้วย แจ้งเตือนน้ำป่าไหลหลาก และดินถล่มในพื้นที่เกษตรกรรม</p>
                  </div>
                </div>
              </div>
            </div>
                      
            <div className="space-y-4">
              {/* หมวดพยากรณ์อากาศ */}
              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[13px] mr-2">🌦️</span>
                  <span className="text-[10px] md:text-[11px] text-[#38bdf8] tracking-widest font-bold">พยากรณ์และปริมาณฝน</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="พยากรณ์อากาศ (รายพื้นที่)" active={tmdWeather} onClick={() => setTmdWeather(!tmdWeather)} dotColor="#38bdf8" apiStatus={apiStatus.tmd} />
                  <CustomToggleBox label="ฝนสะสม 24 ชม. (TMD)" active={tmdRain} onClick={() => setTmdRain(!tmdRain)} dotColor="#facc15" apiStatus={apiStatus.tmd} />
                </div>
              </div>

              {/* หมวดคุณภาพอากาศ */}
              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[13px] mr-2">🌫️</span>
                  <span className="text-[10px] md:text-[11px] text-gray-400 tracking-widest font-bold">คุณภาพอากาศ (AIR QUALITY)</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="ค่าฝุ่น PM2.5 (รายพื้นที่)" active={pm25} onClick={() => setPm25(!pm25)} dotColor="#06b6d4" apiStatus={apiStatus.pm25} />
                </div>
              </div>

              {/* หมวดน้ำและน้ำท่วม */}
              <div className="mt-4 pt-4 border-t border-[#1e293b]">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] p-2 rounded-xl shadow-[0_4px_10px_rgba(37,99,235,0.4)]">
                    <span className="text-white text-[18px]">🌊</span>
                  </div>
                  <h2 className="text-[18px] md:text-[20px] font-serif font-bold tracking-wide text-[#60a5fa]">น้ำและน้ำท่วม</h2>
                </div>

                <div className="flex items-center mb-2">
                  <span className="text-[13px] mr-2">💧</span>
                  <span className="text-[10px] md:text-[11px] text-blue-400 tracking-widest font-bold">ข้อมูลแหล่งน้ำ (สทนช.)</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
                </div>
                <div className="space-y-1 bg-[#0f172a] p-3 rounded-xl border border-[#1e293b]">
                  <CustomToggleBox label="ระดับน้ำในพื้นที่" active={onwrWaterLevel} onClick={() => setOnwrWaterLevel(!onwrWaterLevel)} dotColor="#2563eb" apiStatus={apiStatus.onwrWater} />
                  <CustomToggleBox label="ปริมาณฝน 24 ชม. (สถานี)" active={onwrRain} onClick={() => setOnwrRain(!onwrRain)} dotColor="#3b82f6" apiStatus={apiStatus.onwrRain} />
                  
                  <div className="flex items-center space-x-3 px-3 py-1.5 rounded-xl border border-[#1e293b] bg-[#0b132b]/50 hover:bg-[#1e293b]/80 transition-colors duration-200 cursor-pointer select-none mb-1 group" onClick={() => window.open('https://flood.nonarkara.org/BoLuang?city=%E0%B8%9A%E0%B9%88%E0%B8%AD%E0%B8%AB%E0%B8%A5%E0%B8%A7%E0%B8%87&tv=1', '_blank')}>
                    <div className="relative w-8 h-4 rounded-full bg-[#1e293b] flex items-center justify-center flex-shrink-0 border border-gray-600 group-hover:border-[#0ea5e9] transition-colors">
                      <svg className="w-2.5 h-2.5 text-gray-400 group-hover:text-[#0ea5e9] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </div>
                    <div className="flex items-center space-x-2 flex-1">
                      <div className="w-2.5 h-2.5 rounded-[3px] shadow-sm bg-[#0ea5e9]"></div>
                      <span className="text-[13px] font-medium text-gray-400 group-hover:text-white transition-colors">สรุปรายงานน้ำท่วม (FloodDash)</span>
                    </div>
                  </div>
                </div>
              </div>       
            </div>

          </div>

          {/* 🔘 ปุ่มพับเก็บ (Toggle Button) ด้านซ้าย */}
          <button 
            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)} 
            className="hidden md:flex absolute -right-[32px] top-6 w-[32px] h-16 bg-[#0b132b]/95 border-y border-r border-[#1e293b] rounded-r-xl items-center justify-center text-gray-400 hover:text-[#38bdf8] hover:bg-[#1e293b] transition-colors shadow-[5px_0_15px_rgba(0,0,0,0.5)] backdrop-blur-md z-[80] cursor-pointer"
            title={isLeftPanelOpen ? "ซ่อนแผงข้อมูล" : "แสดงแผงข้อมูล"}
          >
            <svg 
              className={`w-5 h-5 transform transition-transform duration-300 ${isLeftPanelOpen ? 'rotate-180' : 'rotate-0'}`} 
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

        </div>
      </aside>

      <div className="hidden md:flex absolute bottom-4 left-4 z-[60] flex-wrap gap-2 pointer-events-auto max-w-[60%]">
        <div className="bg-[#0b132b]/80 backdrop-blur-md border border-[#1e293b] rounded-full px-3 py-1.5 shadow-sm text-[11px] font-mono text-gray-400">
          Base map: Dark Matter
        </div>
        <div className="bg-[#0b132b]/80 backdrop-blur-md border border-[#1e293b] rounded-full px-3 py-1.5 shadow-sm text-[11px] font-mono text-[#38bdf8]">
          <span ref={coordsRef}>18.1633°N 98.3744°E</span>
        </div>
      </div>

      <div className="hidden md:flex absolute bottom-4 right-1/2 translate-x-1/2 z-[60] pointer-events-auto">
        <div className="bg-[#0b132b]/80 backdrop-blur-md border border-[#1e293b] rounded-full px-3 py-1.5 shadow-sm text-[11px] font-mono text-gray-400 flex items-center space-x-1.5">
          <span className="text-[#38bdf8]">💨</span>
          <span>Data: TMD | ONWR | GISTDA | FloodDash</span>
        </div>
      </div>

      {/* Sidebar ขวา (แจ้งเหตุ/ภัยธรรมชาติ/แผนที่) */}
      <aside className={`absolute top-[80px] md:top-24 right-0 z-[70] transition-transform duration-500 ease-in-out flex pointer-events-auto`} style={{ transform: isRightPanelOpen ? 'translateX(0)' : (isMobile ? 'translateX(100%)' : 'translateX(360px)') }}>
        <div className="relative md:mr-5 flex w-full md:w-auto">
          <button onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className="hidden md:flex absolute -left-[32px] top-4 w-[32px] h-14 bg-[#0b132b]/95 border-y border-l border-[#1e293b] rounded-l-lg items-center justify-center text-gray-400 hover:text-white hover:bg-[#1e293b] transition-colors shadow-[-4px_0_10px_rgba(0,0,0,0.3)] backdrop-blur-md z-50 cursor-pointer">
            <svg className={`w-5 h-5 transform transition-transform duration-300 ${isRightPanelOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
          
          <div className="w-[300px] md:w-[360px] ml-auto bg-[#0b132b]/95 border border-[#1e293b] rounded-l-2xl md:rounded-xl shadow-2xl p-4 md:p-5 backdrop-blur-xl max-h-[calc(100vh-100px)] overflow-y-auto custom-scrollbar">
            
            {/* 🔍 ระบบค้นหาพิกัด (Smart Search) */}
            <div className="mb-4 bg-[#0f172a] p-1.5 rounded-xl border border-[#1e293b] flex shadow-inner">
              <form onSubmit={handleSearchSubmit} className="flex w-full">
                <input 
                  type="text" 
                  placeholder="ค้นหาหมู่บ้าน, ถนน, สถานที่..." 
                  className="w-full bg-transparent text-sm text-white px-3 py-1.5 outline-none placeholder-gray-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="bg-[#38bdf8] text-[#0b132b] px-3 rounded-lg font-bold hover:bg-[#7dd3fc] transition-colors flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>
              </form>
            </div>

            <div className="mb-4 flex flex-col items-start border-b border-[#1e293b] pb-4 relative">
              <button onClick={() => setIsRightPanelOpen(false)} className="md:hidden absolute top-0 right-0 text-gray-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              
              {/* 🚀 จัด Group ให้อยู่บรรทัดเดียวกัน */}
              <div className="flex items-center justify-between w-full mb-2 pr-6 md:pr-0">
                <div className="flex items-center space-x-3">
                  <div className="bg-gradient-to-br from-[#2dd4bf] to-[#3b82f6] p-2 rounded-xl shadow-[0_4px_10px_rgba(45,212,191,0.3)] flex-shrink-0">
                    <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <h2 className="text-[18px] md:text-[22px] font-serif font-bold tracking-wide text-[#7dd3fc]">Layers</h2>
                </div>
                
                {/* 🚀 ป้าย Active และ Zoom */}
                <div className="flex items-center space-x-2">
                  <div className="flex items-center px-2 py-1 rounded-full border border-[#1e293b] bg-[#0f172a]/50 shadow-inner">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#2dd4bf] mr-1.5 shadow-[0_0_5px_#2dd4bf]"></div>
                    <span className="text-[10px] md:text-[11px] font-bold text-gray-300 tracking-wide">Act: <span className="text-white ml-0.5">{activeLayersCount}</span></span>
                  </div>
                  <div className="flex items-center px-2 py-1 rounded-full border border-[#1e293b] bg-[#0f172a]/50 shadow-inner">
                    <span className="text-[10px] md:text-[11px] font-bold text-gray-300 tracking-wide">Zoom: <span className="text-white ml-0.5">{currentZoom}</span></span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] md:text-[12px] text-gray-400 mt-1 leading-relaxed">แผงควบคุมชั้นข้อมูลหลักด้านขวา ส่วนข้อมูลอากาศและค่าฝุ่น PM2.5 / AQI แยกไว้ด้านซ้าย</p>
            </div>

            <div className="space-y-4">
              
              {/* Report Tool */}
              <div>
                <div className="flex items-center mb-3">
                  <svg className="w-3.5 h-3.5 text-[#38bdf8] mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  <span className="text-[10px] md:text-[11px] text-gray-400 tracking-widest font-bold uppercase">Report Tool</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-3"></div>
                </div>
                <div className="bg-[#0b132b]/50 border border-[#1e293b] p-4 rounded-xl mb-4">
                  <button onClick={() => setShowScanModal(true)} className="w-full py-3 bg-gradient-to-r from-[#f43f5e] to-[#f59e0b] hover:brightness-110 rounded-xl text-[14px] font-bold text-white shadow-[0_4px_15px_rgba(244,63,94,0.4)] flex items-center justify-center space-x-2 transition-all cursor-pointer">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 3h6m-3-3v6" />
                    </svg>
                    <span>รายงานเหตุ / ปัญหาสิ่งแวดล้อม</span>
                  </button>
                  <p className="text-[11px] text-gray-400 mt-3 leading-relaxed text-center">สแกนคิวอาร์โค้ดเพื่อเปิดแบบฟอร์มแจ้งปัญหา พร้อมใช้สำหรับการเก็บข้อมูลจากประชาชน</p>
                </div>
              </div> 
              
              {/* 📊 OPEN DATA DASHBOARD */}
              <div>
                <div className="flex items-center mb-3">
                  <svg className="w-3.5 h-3.5 text-[#38bdf8] mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  <span className="text-[10px] md:text-[11px] text-[#38bdf8] tracking-widest font-bold uppercase">OPEN DATA (ข้อมูลสาธารณะ)</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-3"></div>
                </div>
                <button 
                  onClick={() => window.open('/admin/dashboard', '_blank')}
                  className="w-full py-2.5 bg-[#0f172a] hover:bg-[#1e293b] border border-[#38bdf8]/50 rounded-xl text-[13px] font-bold text-[#38bdf8] shadow-sm flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>สรุปสถิติสถานการณ์ (Dashboard)</span>
                </button>
              </div>              

              {/* แจ้งเหตุประชาชน */}
              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[10px] md:text-[11px] text-gray-400 tracking-widest font-bold">CITIZEN REPORTS (รับแจ้งเหตุ)</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-3"></div>
                </div>
                <div className="space-y-2">
                  <CustomToggleBox label="จุดแจ้งเหตุจากประชาชน" active={citizenReport} onClick={() => setCitizenReport(!citizenReport)} dotColor="#ef4444" />
                </div>
              </div>

              {/* ภัยพิบัติทางธรรมชาติ */}
              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[10px] md:text-[11px] text-[#fca5a5] tracking-widest font-bold">NATURAL HAZARDS (เตือนภัย)</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-3"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="จุดความร้อน/ไฟป่า (Hotspot)" active={hotspot} onClick={() => setHotspot(!hotspot)} dotColor="#ea580c" />
                  <CustomToggleBox label="จุดปลอดภัย / ศูนย์พักพิง" active={showSafeZone} onClick={() => setShowSafeZone(!showSafeZone)} dotColor="#10b981" />
                  <CustomToggleBox label="พื้นที่เสี่ยงดินถล่ม (Heatmap)" active={showLandslide} onClick={() => setShowLandslide(!showLandslide)} dotColor="#ef4444" />
                  <CustomToggleBox label="รอยเลื่อนแผ่นดินไหว" active={earthquakeLayer} onClick={() => setEarthquakeLayer(!earthquakeLayer)} dotColor="#c084fc" />
                </div>
              </div>

              {/* แผนที่และขอบเขตพื้นที่ */}
              <div className="mt-4 pt-4 border-t border-[#1e293b]">
                <div className="flex items-center mb-2">
                  <span className="text-[10px] md:text-[11px] text-[#10b981] tracking-widest font-bold">BASEMAP & BOUNDARIES</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-3"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="เปิดแผนที่ดาวเทียม (Satellite)" active={satelliteLayer} onClick={() => setSatelliteLayer(!satelliteLayer)} dotColor="#10b981" />
                  <CustomToggleBox label="ขอบเขตตำบลบ่อหลวง" active={showBoluang} onClick={() => setShowBoluang(!showBoluang)} dotColor="#38bdf8" />
                  <CustomToggleBox label="โซน 13 หมู่บ้าน" active={showBlock} onClick={() => setShowBlock(!showBlock)} dotColor="#fcd34d" />
                  
                  {/* โหมดเจ้าหน้าที่ (Admin Only) */}
                  <div className="relative mt-2 pt-2 border-t border-[#1e293b]/50">
                    <CustomToggleBox label="แปลงที่ดินรายบุคคล" active={showParcel} onClick={() => setShowParcel(!showParcel)} dotColor="#4ade80" />
                    <span className="absolute right-3 top-4 text-[8px] md:text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20 pointer-events-none flex items-center">
                      <span className="mr-1">🔒</span> เจ้าหน้าที่
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </aside>
      
      {/* ========================================== */}
      {/* 📱 Modal โชว์ QR Code สำหรับติดตั้งแอป PWA */}
      {/* ========================================== */}
      {showQrModal && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050b14]/80 backdrop-blur-md px-4 pointer-events-auto"
          onClick={() => setShowQrModal(false)}
        >
          <div 
            className="bg-[#0b132b] border border-[#1e293b] rounded-3xl p-6 md:p-8 shadow-[0_0_50px_rgba(37,99,235,0.2)] max-w-sm w-full relative flex flex-col items-center text-center animate-fade-in-api"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ปุ่มกากบาทปิด */}
            <button 
              onClick={() => setShowQrModal(false)} 
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-[#1e293b] rounded-full text-gray-400 hover:text-white hover:bg-red-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            {/* ไอคอนและหัวข้อ */}
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">ติดตั้งแอปลงมือถือ</h3>
            <p className="text-[13px] text-gray-400 mb-5 leading-relaxed">
              สแกนคิวอาร์โค้ดด้านล่าง เพื่อเปิดระบบในสมาร์ทโฟน
            </p>

            {/* 🌟 1. กล่องโชว์ QR Code */}
            <div className="bg-white p-3 rounded-2xl shadow-inner mb-5 w-[180px] h-[180px] flex items-center justify-center">
              <img 
                src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://boluang-disaster-gis.vercel.app/" 
                alt="QR Code สำหรับเข้าเว็บไซต์" 
                className="w-full h-full object-contain"
              />
            </div>

            {/* 🌟 2. กล่องคำแนะนำการติดตั้ง (ที่เพิ่มเข้ามาใหม่ตามรูปแรก) */}
            <div className="w-full bg-[#0f172a]/80 border border-[#1e293b] rounded-xl p-4 mb-6 text-left">
              <h4 className="text-white font-bold text-[14px] mb-3 flex items-center">
                <svg className="w-4 h-4 mr-1.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ติดตั้งลงเครื่อง
              </h4>
              <div className="space-y-3">
                {/* แถว iOS */}
                <div className="flex flex-col sm:flex-row sm:items-start text-[13px]">
                  <span className="text-gray-200 font-bold w-[120px] flex-shrink-0">IOS • Safari</span>
                  <span className="text-gray-400">กดปุ่มแชร์ แล้วเลือก <span className="text-white">เพิ่มไปยังหน้าจอโฮม</span></span>
                </div>
                {/* แถว Android */}
                <div className="flex flex-col sm:flex-row sm:items-start text-[13px]">
                  <span className="text-gray-200 font-bold w-[120px] flex-shrink-0">Android • Chrome</span>
                  <span className="text-gray-400">กดเมนู ⋮ แล้วเลือก <span className="text-white">ติดตั้งแอป</span></span>
                </div>
              </div>
            </div>

            {/* ปุ่มปิด */}
            <button 
              onClick={() => setShowQrModal(false)} 
              className="w-full bg-[#1e293b] hover:bg-[#334155] text-white py-3 rounded-xl font-bold transition-colors border border-[#334155]"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
