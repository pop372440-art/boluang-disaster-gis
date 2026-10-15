'use client'; 

import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import LineIcon from '@/components/ui/LineIcon';
import ExternalFloodLink from '@/components/ui/ExternalFloodLink';
import AreaContextPanel from '@/components/gis/AreaContextPanel';
import AreaEvidencePanel from '@/components/gis/AreaEvidencePanel';
import { BO_LUANG_CONTEXT, containsPoint, parseAreaSearch, resolveAreaContext, villageContexts, type AreaContext, type VillageContext } from '@/lib/gis/area-context';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import { parseSourceTimestamp } from '@/lib/environment/source-quality';

// ==========================================
//  1. การตั้งค่าระบบ (Config)
// ==========================================
const supabase = getBrowserSupabaseClient();

const BO_LUANG_LAT = 18.1633;
const BO_LUANG_LNG = 98.3744;
const MAX_DISTANCE_KM = 150;

const PRIMARY_NAV = [
  { href: '/', label: 'แผนที่', icon: 'map' },
  { href: '/center', label: 'ศูนย์สถานการณ์', icon: 'chart' },
  { href: '/report', label: 'แจ้งเหตุ', icon: 'report' },
  { href: '/dashboard', label: 'สถิติการแจ้งเหตุ', icon: 'chart' },
  { href: '/open-data', label: 'ข้อมูลเปิด', icon: 'download' },
] as const;

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
//  2. ฟังก์ชันเสริม (Utils)
// ==========================================
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

//  API Resilience
  const fetchWithCache = async (url: string, cacheKey: string) => {
    try {
      const res = await fetch(url);

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         console.warn(`[API Warning] ข้อมูลจาก ${cacheKey} ไม่ใช่ JSON (API อาจขัดข้อง)`);
         return { data: null, status: 'ERROR' };
      }

      if (!res.ok) {
        throw new Error(`API Error: ${res.status}`);
      }
      
      const data = await res.json();
      return { data, status: 'LIVE' };
      
    } catch (error) {
      console.warn(`[API Offline] ไม่สามารถดึงข้อมูล ${cacheKey} ได้`);
      return { data: null, status: 'ERROR' };
    }
  };

// ==========================================
//  3. โหลด Leaflet และ Component
// ==========================================
const MapContainer = dynamic(
  () => import('react-leaflet').then(mod => mod.MapContainer), 
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-screen bg-white flex items-center justify-center z-0">
        <div className="animate-pulse text-slate-600 font-semibold">กำลังเตรียมแผนที่ GIS...</div>
      </div>
    )
  }
);
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

const CustomToggleBox = ({ label, source, active, onClick, dotColor = '#38bdf8', isRadio = false, apiStatus = '' }: any) => {
  const [localActive, setLocalActive] = useState(active);
  useEffect(() => { setLocalActive(active); }, [active]);

  const handlePress = () => {
    setLocalActive(!localActive);
    setTimeout(() => { onClick(); }, 50);
  };

  const renderStatusBadge = () => {
    if (!apiStatus) return null;
    if (apiStatus === 'FRESH' || apiStatus === 'LIVE') return <span className="ml-auto text-sm bg-emerald-500/20 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider" title="ข้อมูลอยู่ในเกณฑ์อายุที่กำหนด">FRESH</span>;
    if (apiStatus === 'STALE' || apiStatus === 'CACHED') return <span className="ml-auto text-sm bg-yellow-500/20 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider" title="ข้อมูลเก่ากว่าเกณฑ์ กรุณาใช้ด้วยความระมัดระวัง">STALE</span>;
    if (apiStatus === 'EXPIRED') return <span className="ml-auto text-sm bg-orange-500/20 text-orange-700 border border-orange-500/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider" title="ข้อมูลหมดอายุและไม่ใช้สร้างคำเตือน">EXPIRED</span>;
    if (apiStatus === 'INVALID_SCHEMA' || apiStatus === 'UNKNOWN') return <span className="ml-auto text-sm bg-violet-500/20 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider" title="รูปแบบข้อมูลหรือเวลาอ้างอิงไม่สมบูรณ์">INVALID</span>;
    return <span className="ml-auto text-sm bg-red-500/20 text-red-700 border border-red-200 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider" title="ระบบต้นทางขัดข้อง">OFFLINE</span>;
  };

  return (
    <button type="button" aria-pressed={localActive} className="bl-layer-toggle min-h-12 flex w-full items-center space-x-3 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-white transition-colors duration-200 cursor-pointer select-none mb-1 group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300" onClick={handlePress}>
      {isRadio ? (
        <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${localActive ? 'border-[#38bdf8]' : 'border-gray-500'}`}>
          {localActive && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}
        </div>
      ) : (
        <div className={`relative w-8 h-4 rounded-full transition-colors duration-300 flex-shrink-0 ${localActive ? 'bg-[#38bdf8]' : 'bg-white'}`}>
          <div className={`absolute top-[2px] left-[2px] bg-white rounded-full h-3 w-3 transition-transform duration-300  ${localActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
        </div>
      )}
      <div className="flex items-center justify-between flex-1 w-full overflow-hidden">
        <div className="flex flex-col">
            <div className="flex items-center space-x-2">
               {!isRadio && <div className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ backgroundColor: dotColor }}></div>}
               <span className={`text-base font-medium transition-colors whitespace-normal ${localActive ? 'text-slate-900' : 'text-gray-600 group-hover:text-gray-800'}`}>{label}</span>
            </div>
            {source && <span className="text-sm text-gray-500 leading-5 mt-0.5 ml-4">{source}</span>}
        </div>
        {renderStatusBadge()}
      </div>
    </button>
  );
};

const getWmoWeatherDesc = (code: number) => {
  const codes: Record<number, string> = { 0: 'แจ่มใส', 1: 'มีเมฆบางส่วน', 2: 'มีเมฆครึ้ม', 3: 'เมฆเป็นส่วนมาก', 45: 'มีหมอก', 48: 'หมอกหนา', 51: 'ฝนปรอยๆ', 61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง', 65: 'ฝนตกหนัก', 80: 'ฝนเป็นหย่อมๆ', 95: 'พายุฝนฟ้าคะนอง' };
  return codes[code] || 'ปกติ';
};
const getWeatherSymbol = (code: number) => {
  if (code === 0) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></svg>'; if (code === 1 || code === 2) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></svg>'; if (code === 3) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17a4 4 0 1 1 1-7 5 5 0 0 1 10 1 3 3 0 0 1 0 6H7Z" /></svg>'; if (code >= 45 && code <= 48) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17a4 4 0 1 1 1-7 5 5 0 0 1 10 1 3 3 0 0 1 0 6H7Z" /></svg>'; if (code >= 51 && code <= 67) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 16a4 4 0 1 1 1-7 5 5 0 0 1 10 1 3 3 0 0 1 0 6H7Zm2 3-1 2m6-2-1 2" /></svg>'; if (code >= 80 && code <= 82) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 16a4 4 0 1 1 1-7 5 5 0 0 1 10 1 3 3 0 0 1 0 6H7Zm2 3-1 2m6-2-1 2" /></svg>'; if (code >= 95) return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 16a4 4 0 1 1 1-7 5 5 0 0 1 10 1 3 3 0 0 1 0 6H7Zm2 3-1 2m6-2-1 2" /></svg>'; return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></svg>';
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

export default function BoLuangDashboard() {
  const [mounted, setMounted] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const coordsRef = useRef<HTMLSpanElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [headerWeather, setHeaderWeather] = useState<{ temp: number; wCode: number } | null>(null);

  //  State สำหรับฟีเจอร์ติดตั้ง PWA
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null); 
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchHeaderWeather = async () => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}&current=temperature_2m,weathercode&timezone=Asia%2FBangkok`);
        const data = await res.json();
        if (data && data.current) {
          setHeaderWeather({
            temp: data.current.temperature_2m,
            wCode: data.current.weathercode
          });
        }
      } catch (err) {
        console.warn('Header weather fetch failed:', err);
      }
    };
    fetchHeaderWeather();
  }, []);
  
  const [apiStatus, setApiStatus] = useState({ tmd: '', pm25: '', onwrRain: '', onwrWater: '', gistda: '' });
  const [searchQuery, setSearchQuery] = useState('');

  const [tmdWeather, setTmdWeather] = useState(false);
  const [tmdRain, setTmdRain] = useState(false);
  const [pm25, setPm25] = useState(false); 
  const [windyLayer, setWindyLayer] = useState(false); 
  const [onwrRain, setOnwrRain] = useState(false);
  const [onwrWaterLevel, setOnwrWaterLevel] = useState(false);

  const [satelliteLayer, setSatelliteLayer] = useState(false); 
  const [showBoluang, setShowBoluang] = useState(true); 
  const [showBlock, setShowBlock] = useState(true);          
  const [showParcel, setShowParcel] = useState(false);       
  const [citizenReport, setCitizenReport] = useState(false); 
  const [earthquakeLayer, setEarthquakeLayer] = useState(false);        
  const [hotspot, setHotspot] = useState(false);
  const [showLandslide, setShowLandslide] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false); 
  
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<AreaContext>(BO_LUANG_CONTEXT);
  const pendingAreaRef = useRef<AreaContext | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const [localWeatherData, setLocalWeatherData] = useState<any[]>([]); 
  const [localAirData, setLocalAirData] = useState<any[]>([]);
  const [disasterReports, setDisasterReports] = useState<any[]>([]); 
  const [onwrRainData, setOnwrRainData] = useState<any[]>([]);
  const [onwrWaterLevelData, setOnwrWaterLevelData] = useState<any[]>([]);
  const [visitStats, setVisitStats] = useState<{
    today: number | null;
    total: number | null;
    state: 'loading' | 'ready' | 'error';
  }>({ today: null, total: null, state: 'loading' });
  
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [villageError, setVillageError] = useState<string | null>(null);
  const villages = useMemo<VillageContext[]>(() => {
    if (!geoBlock) return [];
    try { return villageContexts(geoBlock); } catch { return []; }
  }, [geoBlock]);
  const [geoParcel, setGeoParcel] = useState<any>(null);
  const [geoLandslide, setGeoLandslide] = useState<any>(null); 
  const [hotspotData, setHotspotData] = useState<any>(null);
  const [hotspotMeta, setHotspotMeta] = useState<{ acquisitionTime: string | null; satelliteTypes: string[] }>({ acquisitionTime: null, satelliteTypes: [] });
  const [mapRef, setMapRef] = useState<any>(null);
  const [FaultLineData, setFaultLineData] = useState<any>(null);

  const syncData = useRef({ lat: 18.1633, lng: 98.3744, zoom: 9 });
  
  const [activeVillageIndex, setActiveVillageIndex] = useState<number | null>(null);

  const activeLayersCount = [satelliteLayer, showBoluang, showBlock, showParcel, citizenReport, earthquakeLayer, hotspot, showLandslide, onwrRain, onwrWaterLevel, showSafeZone].filter(Boolean).length;

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
        popup: 'border border-slate-200 rounded-xl ',
        image: 'rounded-lg max-h-[80vh] object-contain'
      }
    });
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
        Swal.close();
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
        const { lat, lon } = data[0];
        if (mapRef) {
          mapRef.flyTo([parseFloat(lat), parseFloat(lon)], 14, { duration: 2 });
        }
        Swal.close();
      } else {
        Swal.fire({ icon: 'warning', title: 'ไม่พบสถานที่', text: 'ลองเปลี่ยนคำค้นหาให้กว้างขึ้น', background: '#0f172a', color: '#fff' });
      }
    } catch (error) { 
      Swal.fire({ icon: 'error', title: 'ระบบค้นหาขัดข้อง', background: '#0f172a', color: '#fff' }); 
    }
  };

  //  ฟังก์ชันดักจับ Event การติดตั้ง PWA
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault(); 
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
      console.log('PWA was installed');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    setDeferredPrompt(null);
    setIsInstallable(false);
    setShowQrModal(false); // ปิด Modal หลังจากกดปุ่ม
  };

  useEffect(() => {
    pendingAreaRef.current = parseAreaSearch(window.location.search);
    const handleResize = () => {
      const mobile = window.innerWidth < 1024; 
      setIsMobile(mobile);
      if (mobile) { 
        setIsLeftPanelOpen(false); 
        setIsRightPanelOpen(false); 
      } else {
        setIsLeftPanelOpen(false);
        setIsRightPanelOpen(true); 
      }
    };
    handleResize(); 
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') setQrUrl(window.location.origin + '/report');

    const ts = Date.now();
    const loadGeoJSON = async (url: string, setter: any) => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          let data = await res.json();
          if (Array.isArray(data)) setter({ type: "FeatureCollection", features: data });
          else setter(data);
          if (url.includes('/block.json')) {
            try { villageContexts(data); setVillageError(null); } catch { setVillageError('ขอบเขตหมู่บ้านไม่ผ่านการตรวจสอบ จึงไม่สรุปแทนพื้นที่'); }
          }
        }
      } catch (e) { if (url.includes('/block.json')) setVillageError('โหลดขอบเขตหมู่บ้านไม่สำเร็จ'); console.error('Failed to load layer:', url, e); }
    };

    const timer = setTimeout(() => {
      loadGeoJSON(`/geojson/boluang.json?v=${ts}`, setGeoBoluang);
      loadGeoJSON(`/geojson/block.json?v=${ts}`, setGeoBlock);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hotspot) {
      setHotspotData(null);
      return;
    }
    const fetchHotspot = async () => {
      try {
        const response = await fetch('/api/environment/summary?latitude=18.1633&longitude=98.3744', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.fire) {
           setApiStatus(prev => ({ ...prev, gistda: 'OFFLINE' }));
           setHotspotData(null);
           return;
        }
        const quality = String(data.fire.quality?.state || 'unknown').toUpperCase();
        setApiStatus(prev => ({ ...prev, gistda: quality }));
        setHotspotMeta({
          acquisitionTime: data.fire.acquisitionTime || null,
          satelliteTypes: Array.isArray(data.fire.satelliteTypes) ? data.fire.satelliteTypes : [],
        });
        if (Array.isArray(data.fire.hotspots) && ['FRESH', 'STALE'].includes(quality)) {
           const geoJsonData = {
             type: 'FeatureCollection',
             features: data.fire.hotspots.map((item: any) => ({
               type: 'Feature',
               geometry: {
                 type: 'Point',
                 coordinates: [Number(item.longitude), Number(item.latitude)]
               },
               properties: { ...item, title: 'จุดความร้อน (Hotspot)', source: 'GISTDA' }
             })).filter((feature: any) => feature.geometry.coordinates[0] !== 0 && feature.geometry.coordinates[1] !== 0)
           };
           setHotspotData(geoJsonData);
        } else {
           setHotspotData(null);
        }
      } catch (error) {
        setApiStatus(prev => ({ ...prev, gistda: 'OFFLINE' }));
        setHotspotData(null);
      }
    };
    fetchHotspot();
  }, [hotspot]);

  useEffect(() => {
    if (!showLandslide) {
      setGeoLandslide(null);
      return;
    }
    fetch(`/geojson/boluang_landslide_risk.json?v=${Date.now()}`)
      .then(res => res.json())
      .then(data => setGeoLandslide(data))
      .catch(e => console.error(e));
  }, [showLandslide]);

  useEffect(() => {
    if (!earthquakeLayer) {
      setFaultLineData(null);
      return;
    }
    const fetchFaultLine = async () => {
      try {
        const response = await fetch('/geojson/fault_line.json'); 
        if (!response.ok) { setFaultLineData(null); return; }
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) { setFaultLineData(null); return; }
        const data = await response.json();
        setFaultLineData(data); 
      } catch (error) {
        setFaultLineData(null);
      }
    };
    fetchFaultLine();
  }, [earthquakeLayer]);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;
    const loadVisitorStats = async () => {
      if (!supabase) {
        if (!cancelled) setVisitStats({ today: null, total: null, state: 'error' });
        return;
      }

      try {
        let sessionId = sessionStorage.getItem('bl_session_id');
        if (!sessionId) {
          sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          sessionStorage.setItem('bl_session_id', sessionId);
          const { error: insertError } = await supabase.from('visitor_logs').insert([{ session_id: sessionId }]);
          if (insertError) throw insertError;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [totalResult, todayResult] = await Promise.all([
          supabase.from('visitor_logs').select('*', { count: 'exact', head: true }),
          supabase.from('visitor_logs').select('*', { count: 'exact', head: true }).gte('visited_at', today.toISOString()),
        ]);
        if (totalResult.error) throw totalResult.error;
        if (todayResult.error) throw todayResult.error;

        if (!cancelled) {
          setVisitStats({
            today: todayResult.count ?? 0,
            total: totalResult.count ?? 0,
            state: 'ready',
          });
        }
      } catch (error) {
        console.warn('Visitor stats unavailable:', error);
        if (!cancelled) setVisitStats({ today: null, total: null, state: 'error' });
      }
    };

    void loadVisitorStats();
    return () => { cancelled = true; };
  }, [mounted]);

  useEffect(() => {
    if (!tmdWeather && !tmdRain) { 
      setLocalWeatherData([]); 
      return; 
    }
    const fetchLocalWeather = async () => {
      const lats = localAirStations.map(p => p.lat.toFixed(4)).join(',');
      const lngs = localAirStations.map(p => p.lng.toFixed(4)).join(',');
      const url = `/api/proxy?service=weather-tmd&lats=${lats}&lons=${lngs}`;
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

  useEffect(() => {
    if (!pm25) { 
      setLocalAirData([]); 
      return; 
    }
    const fetchLocalAir = async () => {
      const lats = localAirStations.map(s => s.lat.toFixed(4)).join(',');
      const lngs = localAirStations.map(s => s.lng.toFixed(4)).join(',');
      const urlAqi = `/api/proxy?service=air-quality&lats=${lats}&lons=${lngs}`;
      const urlWx = `/api/proxy?service=weather-tmd&lats=${lats}&lons=${lngs}`;
      
      const [aqiResult, wxResult] = await Promise.all([ fetchWithCache(urlAqi, 'pm25_aqi_cache'), fetchWithCache(urlWx, 'pm25_wx_cache') ]);

      const aqiData = aqiResult.data; 
      const wxData = wxResult.data;
      if (Array.isArray(aqiData) && Array.isArray(wxData)) {
        const formatted = localAirStations.map((station, i) => {
          const time = typeof aqiData[i]?.current?.time === 'string' ? aqiData[i].current.time : null;
          const observedAt = parseSourceTimestamp(time);
          const ageMinutes = observedAt != null ? Math.max(0, (Date.now() - observedAt) / 60_000) : null;
          const quality = ageMinutes == null ? 'UNKNOWN' : ageMinutes > 720 ? 'EXPIRED' : ageMinutes > 180 ? 'STALE' : 'FRESH';
          const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
          return {
            ...station,
            pm25Val: numeric(aqiData[i]?.current?.pm2_5),
            pm10Val: numeric(aqiData[i]?.current?.pm10),
            coVal: numeric(aqiData[i]?.current?.carbon_monoxide),
            no2Val: numeric(aqiData[i]?.current?.nitrogen_dioxide),
            so2Val: numeric(aqiData[i]?.current?.sulphur_dioxide),
            o3Val: numeric(aqiData[i]?.current?.ozone),
            time,
            quality,
            ageMinutes,
            wCode: wxData[i]?.current?.weathercode ?? null,
          };
        });
        setLocalAirData(formatted);
        const qualities = formatted.map(item => item.quality);
        const status = aqiResult.status === 'ERROR' ? 'OFFLINE' : qualities.includes('EXPIRED') ? 'EXPIRED' : qualities.includes('UNKNOWN') ? 'UNKNOWN' : qualities.includes('STALE') ? 'STALE' : 'FRESH';
        setApiStatus(prev => ({ ...prev, pm25: status }));
      } else {
        setLocalAirData([]);
        setApiStatus(prev => ({ ...prev, pm25: 'OFFLINE' }));
      }
    };
    fetchLocalAir();
  }, [pm25]);

  useEffect(() => {
    if (!onwrRain) { setOnwrRainData([]); return; }
    const fetchOnwrRain = async () => {
      const { data: json, status } = await fetchWithCache('/api/proxy?service=onwr-rain', 'onwr_rain_cache');
      setApiStatus(prev => ({ ...prev, onwrRain: status }));
      
      let arrData = [];
      if (json && Array.isArray(json.data)) arrData = json.data;
      else if (json && json.data && Array.isArray(json.data.data)) arrData = json.data.data;
      
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

  useEffect(() => {
    if (!onwrWaterLevel) { setOnwrWaterLevelData([]); return; }
    const fetchOnwrWaterLevel = async () => {
      const { data: json, status } = await fetchWithCache('/api/proxy?service=onwr-waterlevel', 'onwr_water_cache');
      setApiStatus(prev => ({ ...prev, onwrWater: status }));
      
      let arrData: any[] = [];
      if (Array.isArray(json)) arrData = json;
      else if (json?.data && Array.isArray(json.data)) arrData = json.data;
      else if (json?.data?.waterlevel_data?.data && Array.isArray(json.data.waterlevel_data.data)) arrData = json.data.waterlevel_data.data;
      else if (json?.waterlevel_data?.data && Array.isArray(json.waterlevel_data.data)) arrData = json.waterlevel_data.data;
      
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

  useEffect(() => {
    if (!citizenReport || !supabase) return;
    const fetchReports = async () => {
      try {
        const { data, error } = await supabase.from('boluang_disaster_reports').select('*').neq('status', 'ดำเนินการเสร็จแล้ว').order('created_at', { ascending: false }); 
        if (error) throw error;
        if (data) setDisasterReports(data);
      } catch (error) { console.error('Error fetching disaster reports:', error); }
    };
    fetchReports();
  }, [citizenReport]);

  // ฟังก์ชันล้างไฮไลท์แผนที่
  const clearSelection = () => {
    setActiveVillageIndex(null);
    setSelectedArea(BO_LUANG_CONTEXT);
  };

  const selectVillage = (id: string) => {
    const village = villages.find(item => item.id === id);
    const area = village ?? (id === 'point' && selectedArea.id === 'point' ? selectedArea : BO_LUANG_CONTEXT);
    setSelectedArea(area);
    if (village) {
      const index = geoBlock.features.findIndex((feature: { properties?: { own_villag?: string } }) => feature.properties?.own_villag === village.name);
      setActiveVillageIndex(index >= 0 ? index : null);
    } else setActiveVillageIndex(null);
    mapRef?.flyTo([area.lat, area.lng], village ? 13 : 11);
    if (isMobile) setIsLeftPanelOpen(false);
  };

  useEffect(() => {
    const requested = pendingAreaRef.current;
    if (!requested || !mapRef || (requested.id.startsWith('moo-') && !villages.length)) return;
    const area = resolveAreaContext(requested, villages);
    pendingAreaRef.current = null;
    setSelectedArea(area);
    const village = villages.find(item => item.id === area.id);
    setActiveVillageIndex(village ? Number(village.feature.properties.__idx) : null);
    mapRef.flyTo([area.lat, area.lng], area.id === 'bo-luang' ? 11 : 13);
  }, [villages, mapRef]);

  const applyLayerPreset = (preset: 'water' | 'fire' | 'report') => {
    setShowBoluang(true); setShowBlock(true);
    setOnwrRain(preset === 'water'); setOnwrWaterLevel(preset === 'water'); setShowLandslide(preset === 'water');
    setHotspot(preset === 'fire'); setPm25(preset === 'fire');
    setCitizenReport(preset === 'report'); setShowSafeZone(preset === 'report');
    if (isMobile) { setIsLeftPanelOpen(false); setIsRightPanelOpen(true); }
  };
  const togglePanel = (side: 'left' | 'right') => {
    if (side === 'left') { setIsLeftPanelOpen(open => !open); if (isMobile) setIsRightPanelOpen(false); }
    else { setIsRightPanelOpen(open => !open); if (isMobile) setIsLeftPanelOpen(false); }
  };

  // ==========================================
  //  การตกแต่งและสร้าง Style (GeoJSON)
  // ==========================================
  const BLOCK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#14b8a6', '#0ea5e9'];
  
  const getVillageColor = (feature: any) => {
    const props = feature?.properties || {};
    if (props.fill) return props.fill;
    const nameStr = String(props.own_villag || props.name_th || props.name || props.zone_name || props.id || "");
    const match = nameStr.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num >= 1 && num <= BLOCK_COLORS.length) return BLOCK_COLORS[num - 1]; 
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

  const getBlockStyle = (feature: any) => {
    const defaultColor = getVillageColor(feature);
    const isHovered = activeVillageIndex === feature.properties?.indexId;
    return { 
        fillColor: defaultColor, 
        weight: isHovered ? 3 : 1.5, 
        color: isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.3)', 
        fillOpacity: isHovered ? 0.7 : 0.12, 
        dashArray: isHovered ? '' : '3, 3' 
    };
  };

  //  เพิ่มการรองรับ Touch Events สำหรับมือถือโดยตรง
  const onEachBlockFeature = (feature: any, layer: any) => {
    layer.options.bubblingMouseEvents = false;
    const props = feature?.properties || {};
    const rawName = props.own_villag || props.name_th || props.name || props.zone_name || `หมู่ที่ ${props.zone_id || props.id || ''}`;
    const villageName = formatVillageName(rawName);

    layer.bindTooltip(villageName, { sticky: true, direction: 'auto', className: 'village-hover-tooltip', permanent: false });
    
    layer.on({
      mouseover: (e: any) => {
        if (!isMobile) {
          setActiveVillageIndex(props.indexId);
          if (e.target.bringToFront) e.target.bringToFront();
        }
      },
      click: (e: any) => {
        const village = villages.find(item => containsPoint([e.latlng.lng, e.latlng.lat], item.feature.geometry));
        if (village) setSelectedArea(village);
        setActiveVillageIndex(props.indexId);
        setIsLeftPanelOpen(false); setIsRightPanelOpen(true);
        if (e.target.bringToFront) e.target.bringToFront();
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

  const styleBoluang = { color: '#0ea5e9', weight: 3, fill: false, interactive: true }; 
  const onEachBoluangFeature = (feature: any, layer: any) => {
    layer.on({
      mouseover: (e: any) => {
        const target = e.target;
        target.setStyle({ weight: 5, color: '#38bdf8' });
        if (target.bringToFront) target.bringToFront();
        target.bindTooltip('เขตเทศบาลตำบลบ่อหลวง', { sticky: true, direction: 'auto', className: 'village-hover-tooltip' }).openTooltip(e.latlng);
      },
      mouseout: (e: any) => {
        const target = e.target;
        target.setStyle(styleBoluang);
        target.closeTooltip();
        target.unbindTooltip();
      }
    });
  };

  const styleParcel = { color: '#4ade80', fillColor: '#4ade80', weight: 1, fillOpacity: 0.2 }; 
  const styleLandslide = (feature: any) => {
    const risk = String(feature.properties?.risk || feature.properties?.Risk || '');
    let color = '#facc15'; let opacity = 0.3;
    if (risk.includes('สูง') || risk.includes('High')) { color = '#ef4444'; opacity = 0.6; } 
    else if (risk.includes('ปานกลาง') || risk.includes('Moderate')) { color = '#f97316'; opacity = 0.4; }
    return { color: color, fillColor: color, weight: 0, fillOpacity: opacity };
  };

  useEffect(() => {
    if (!mapRef) return;
    const updateSyncData = () => {
      const center = mapRef.getCenter(); 
      const zoom = mapRef.getZoom();
      syncData.current = { lat: center.lat, lng: center.lng, zoom: zoom };
    };

    const onMouseMove = (e: any) => { 
      if (coordsRef.current) coordsRef.current.innerText = `${e.latlng.lat.toFixed(4)}°N ${e.latlng.lng.toFixed(4)}°E`; 
    };

    mapRef.on('moveend', updateSyncData); 
    mapRef.on('zoomend', updateSyncData); 
    mapRef.on('mousemove', onMouseMove); 
    mapRef.on('click', clearSelection);

    return () => { 
      mapRef.off('moveend', updateSyncData); 
      mapRef.off('zoomend', updateSyncData); 
      mapRef.off('mousemove', onMouseMove); 
      mapRef.off('click', clearSelection);
    };
  }, [mapRef]);

  // ==========================================
  //  Custom Icons
  // ==========================================
  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const createTmdIcon = useMemo(() => {
    if (!L) return () => null;
    return (wCode: number) => {
      const symbol = getWeatherSymbol(wCode);
      return L.divIcon({ className: 'bg-transparent border-none', html: `<div class="flex items-center justify-center w-[36px] h-[36px] bg-white border-[2px] border-[#38bdf8] rounded-full transition-transform"><span class="text-[18px]">${symbol}</span></div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
    };
  }, [L]);

  const createPm25Icon = useMemo(() => {
    if (!L) return () => null;
    return (pmVal: number) => {
      const { color } = getAirQualityDetails(pmVal);
      return L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex flex-col items-center justify-center w-[48px] h-[48px] bg-white border-[2px] rounded-xl transition-transform z-10" style="border-color: ${color};"><span class="text-slate-900 font-bold text-[15px] leading-none mt-1 z-0">${pmVal.toFixed(1)}</span><span class="text-[10px] font-bold mt-1.5 z-0 tracking-widest" style="color: ${color};">PM2.5</span></div>`, iconSize: [48, 48], iconAnchor: [24, 24] });
    };
  }, [L]);

  const getIncidentIcon = (incident: any) => {
    if(!L) return null;
    const isResolved = incident.status?.includes('เสร็จแล้ว') || incident.status?.includes('ปิดจ๊อบ');
    const inProgress = incident.status?.includes('กำลัง') || incident.status?.includes('ระหว่าง');
    const bgColor = isResolved ? 'bg-emerald-500' : inProgress ? 'bg-orange-500' : 'bg-red-600';
    const borderColor = isResolved ? 'border-emerald-200' : inProgress ? 'border-orange-300' : 'border-red-200';
    const shadowColor = isResolved ? '' : inProgress ? '' : '';
    const pulseAnimation = (!isResolved) ? `<div class="absolute inset-0 rounded-full ${bgColor} opacity-60 animate-ping" style="animation-duration: 2s;"></div>` : '';

    return L.divIcon({
      className: 'custom-incident-icon bg-transparent border-none',
      html: `
        <div class="relative flex items-center justify-center w-10 h-10">
          ${pulseAnimation}
          <div class="relative z-10 w-8 h-8 ${bgColor} rounded-full border-2 ${borderColor} ${shadowColor} flex items-center justify-center transform transition-transform">
            <span class="text-slate-900 text-sm" >
              ${isResolved ? '✓' : inProgress ? '…' : '!'}
            </span>
          </div>
          <div class="absolute -bottom-1 w-4 h-1.5 bg-slate-50 rounded-full blur-[2px]"></div>
        </div>
      `,
      iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -15],
    });
  };

  const getSeverityColor = (level: number) => {
    if (level >= 4) return 'bg-red-500';
    if (level === 3) return 'bg-orange-500';
    return 'bg-emerald-500';
  };

  const createHotspotIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#ea580c] rounded-full blur-[8px] opacity-60"></div><div class="relative flex items-center justify-center w-7 h-7 bg-white border-[1.5px] border-[#ea580c] rounded-full z-10"><span class="text-[#ea580c] text-[14px]"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c2 5 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 3 2 3 2 3s2-3 1-8Z" /></svg></span></div></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
  }, [L]);

  const createQuakeIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#c084fc] rounded-full blur-[8px] opacity-50"></div><div class="relative flex items-center justify-center w-7 h-7 bg-white border-[1.5px] border-[#c084fc] rounded-full z-10"><span class="text-[#c084fc] text-[14px] font-bold">〰</span></div></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
  }, [L]);

  const createWaterLevelIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-[36px] h-[36px] bg-white border-[2px] border-[#3b82f6] rounded-full transition-transform z-20"><span class="text-[16px]"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8c3-4 6 4 9 0s6 4 9 0M3 15c3-4 6 4 9 0s6 4 9 0" /></svg></span></div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
  }, [L]);

  const createUserLocationIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-8 h-8"><div class="absolute inset-0 bg-[#38bdf8] rounded-full blur-[6px] opacity-70 animate-ping"></div><div class="relative flex items-center justify-center w-5 h-5 bg-[#0ea5e9] border-[2px] border-white rounded-full z-10"></div></div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
  }, [L]);

  const createSafeZoneIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#10b981] rounded-full blur-[8px] opacity-40"></div><div class="relative flex items-center justify-center w-7 h-7 bg-white border-[1.5px] border-[#10b981] rounded-full z-10"><span class="text-[#047857] text-[13px]"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 10 8-7 8 7v11H4V10Zm5 11v-7h6v7" /></svg></span></div></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
  }, [L]);

  const geoBlockWithIndex = useMemo(() => {
    if (!geoBlock || !geoBlock.features || !villages.length) return null;
    return {
      ...geoBlock,
      features: geoBlock.features.map((feature: any, index: number) => ({
        ...feature,
        properties: {
          ...feature.properties,
          indexId: index
        }
      }))
    };
  }, [geoBlock, villages]);

  return (
    <main className="bl-ui bl-map relative w-screen h-screen bg-slate-100 font-sans text-slate-900 overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: transparent !important; cursor: crosshair !important; }
        .leaflet-top.leaflet-left { top: 134px !important; left: 10px !important; }
        @media (min-width: 1024px) { .leaflet-top.leaflet-left { top: 134px !important; left: 370px !important; } }
        .leaflet-bar a { background-color: #ffffff !important; color: #334155 !important; border: 1px solid #dbe5eb !important; border-radius: 8px !important; }
        .leaflet-bar a:hover { background-color: #1e293b !important; }
        .leaflet-div-icon { background: transparent !important; border: none !important; }
        .leaflet-tooltip { pointer-events: none !important; }
        .leaflet-interactive:focus { outline: none !important; }
        
        .leaflet-tooltip.village-hover-tooltip { 
          background-color: #ffffff !important; color: #0f172a !important; border: 1px solid #cbd5e1 !important; 
          font-family: inherit !important; font-size: 14px !important; font-weight: 600 !important; 
          padding: 6px 14px !important; border-radius: 6px !important; box-shadow: none; 
        }
        
        .popup-location .leaflet-popup-content-wrapper { background-color: #ffffff !important; color: #334155 !important; border: 1px solid #0ea5e9 !important; border-radius: 8px !important; box-shadow: none; padding: 0 !important; overflow: hidden; }
        .popup-location .leaflet-popup-tip { background-color: #ffffff !important; border-top: 1px solid #0ea5e9 !important; border-left: 1px solid #0ea5e9 !important; }
        .popup-location .leaflet-popup-content { margin: 0 !important; }

        .popup-safezone .leaflet-popup-content-wrapper { background-color: #ffffff !important; color: #334155 !important; border: 1px solid #10b981 !important; border-radius: 8px !important; box-shadow: none; padding: 0 !important; overflow: hidden; }
        .popup-safezone .leaflet-popup-tip { background-color: #ffffff !important; border-top: 1px solid #10b981 !important; border-left: 1px solid #10b981 !important; }
        .popup-safezone .leaflet-popup-content { margin: 0 !important; }

        .popup-pm25-custom .leaflet-popup-content-wrapper { background-color: #ffffff !important; color: #334155 !important; border-radius: 8px !important; box-shadow: none; padding: 0 !important; overflow: hidden; border: 1px solid #dbe5eb !important; }
        .popup-pm25-custom .leaflet-popup-tip { background-color: #ffffff !important; border-bottom: 1px solid #1e293b !important; border-right: 1px solid #1e293b !important; }
        .popup-pm25-custom .leaflet-popup-content { margin: 0 !important; width: 290px !important; }
        .popup-pm25-custom .leaflet-popup-close-button { color: rgba(0,0,0,0.4) !important; font-size: 20px !important; padding-top: 6px !important; padding-right: 12px !important; z-index: 50; }
        .popup-pm25-custom .leaflet-popup-close-button:hover { color: rgba(0,0,0,0.8) !important; background: transparent !important; }

        .popup-tmd-weather .leaflet-popup-content-wrapper { background-color: #ffffff !important; color: #334155 !important; border: 1px solid #38bdf8 !important; border-radius: 10px !important; box-shadow: none; padding: 0 !important; overflow: hidden; }
        .popup-tmd-weather .leaflet-popup-tip { background-color: #ffffff !important; border-top: 1px solid #38bdf8 !important; border-left: 1px solid #38bdf8 !important; }
        .popup-tmd-weather .leaflet-popup-content { margin: 0 !important; width: 280px !important; }
        .popup-tmd-weather .leaflet-popup-close-button { color: #0f172a !important; font-size: 18px !important; padding-top: 5px !important; padding-right: 10px !important; z-index: 50; }
        .popup-tmd-weather .leaflet-popup-close-button:hover { color: #ffffff !important; background: transparent !important; }

        .popup-tmd-rain .leaflet-popup-content-wrapper { background-color: #ffffff !important; color: #334155 !important; border: 1px solid #facc15 !important; border-radius: 10px !important; box-shadow: none; padding: 0 !important; overflow: hidden; }
        .popup-tmd-rain .leaflet-popup-tip { background-color: #ffffff !important; border-top: 1px solid #facc15 !important; border-left: 1px solid #facc15 !important; }
        .popup-tmd-rain .leaflet-popup-content { margin: 0 !important; width: 280px !important; }
        .popup-tmd-rain .leaflet-popup-close-button { color: #0f172a !important; font-size: 18px !important; padding-top: 5px !important; padding-right: 10px !important; z-index: 50; }
        .popup-tmd-rain .leaflet-popup-close-button:hover { color: #ffffff !important; background: transparent !important; }

        .popup-hotspot .leaflet-popup-content-wrapper { background-color: #ffffff !important; color: #334155 !important; border: 1px solid #ea580c !important; border-radius: 8px !important; box-shadow: none; padding: 0 !important; overflow: hidden; }
        .popup-hotspot .leaflet-popup-tip { background-color: #ffffff !important; border-top: 1px solid #ea580c !important; border-left: 1px solid #ea580c !important; }
        .popup-hotspot .leaflet-popup-content { margin: 0 !important; }

        .popup-quake .leaflet-popup-content-wrapper { background-color: #ffffff !important; color: #334155 !important; border: 1px solid #a855f7 !important; border-radius: 8px !important; box-shadow: none; padding: 0 !important; overflow: hidden; }
        .popup-quake .leaflet-popup-tip { background-color: #ffffff !important; border-top: 1px solid #a855f7 !important; border-left: 1px solid #a855f7 !important; }
        .popup-quake .leaflet-popup-content { margin: 0 !important; }

        .popup-water .leaflet-popup-content-wrapper { background-color: #ffffff !important; color: #334155 !important; border: 1px solid #3b82f6 !important; border-radius: 10px !important; box-shadow: none; padding: 0 !important; overflow: hidden; }
        .popup-water .leaflet-popup-tip { background-color: #ffffff !important; border-top: 1px solid #3b82f6 !important; border-left: 1px solid #3b82f6 !important; }
        .popup-water .leaflet-popup-content { margin: 0 !important; width: 280px !important; }
        .popup-water .leaflet-popup-close-button { color: #0f172a !important; font-size: 18px !important; padding-top: 5px !important; padding-right: 10px !important; z-index: 50; }
        .popup-water .leaflet-popup-close-button:hover { color: #ffffff !important; background: transparent !important; }

        .custom-popup .leaflet-popup-content-wrapper { background: transparent !important; box-shadow: none; padding: 0 !important; border-radius: 24px; }
        .custom-popup .leaflet-popup-content { margin: 0 !important; width: 320px !important; }
        .custom-popup .leaflet-popup-tip-container { display: none !important; }
        .custom-popup .leaflet-popup-close-button { color: rgba(255, 255, 255, 0.8) !important; font-weight: normal !important; font-size: 22px !important; top: 6px !important; right: 12px !important; z-index: 50 !important; }
        .custom-popup .leaflet-popup-close-button:hover { background: transparent !important; color: white !important; }

        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 5px; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-api { animation: fadeIn 0.3s ease-out forwards; }
        
        /*  CSS กลับสีแผนที่ OSM ให้เป็นโหมดกลางคืน (Dark Mode) */
        .dark-map-filter {
          filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
        }
      `}} />

      {isMobile && (isLeftPanelOpen || isRightPanelOpen) && (
        <div 
          className="fixed inset-0 bg-slate-900/20 z-[60]"
          onClick={() => { setIsLeftPanelOpen(false); setIsRightPanelOpen(false); }}
        />
      )}

      {showScanModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-50">
          <div className="bg-white border border-slate-200 w-[90%] max-w-[400px] rounded-xl p-8 relative flex flex-col items-center justify-center mx-auto text-center animate-fade-in-api">
            <button onClick={() => setShowScanModal(false)} className="absolute top-4 right-4 text-gray-600 hover:text-slate-900 text-2xl font-bold leading-none">&times;</button>
            <h2 className="text-[20px] font-bold text-slate-900 mb-2 w-full">สแกนเพื่อแจ้งจุดเสี่ยงภัย</h2>
            <p className="text-base text-gray-600 mb-6 leading-relaxed w-full">พบเห็นจุดเสี่ยงภัย สามารถสแกนคิวอาร์โค้ดด้านล่างนี้เพื่อแจ้งเหตุได้ทันที</p>
            <div className="bg-white p-4 rounded-xl mb-6 flex items-center justify-center">
              {qrUrl ? (
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} alt="QR Code" className="w-48 h-48 object-contain rounded-lg"/>
              ) : (
                <div className="w-48 h-48 bg-gray-100 flex items-center justify-center text-gray-600 text-base rounded-lg animate-pulse border-2 border-dashed border-gray-300">กำลังสร้าง QR Code...</div>
              )}
            </div>
            <div className="flex flex-col space-y-3 w-full mt-2">
              <Link href="/report" className="py-3 w-full text-slate-900 font-bold text-base rounded-xl hover:brightness-110 transition-all flex items-center justify-center space-x-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
                <span>เปิดหน้าฟอร์มแจ้งจุดเสี่ยงภัย</span>
              </Link>
              <button onClick={() => setShowScanModal(false)} className="py-3 w-full bg-white text-gray-700 font-semibold text-base rounded-xl hover:bg-white transition-colors">ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}

      {/*  ระบบแผนที่หลัก */}
      <div className="absolute inset-0 z-0 bg-white overflow-hidden">        
        <div className="absolute inset-0 pointer-events-auto" style={{ zIndex: 10 }}>         
          <div 
            className={`absolute top-[150px] z-[1000] flex flex-col space-y-2 transition-all duration-500 ease-in-out pointer-events-auto ${
              isLeftPanelOpen && !isMobile ? 'left-[420px]' : 'left-[15px] md:left-[50px]'
            }`}
          >
            <button 
              onClick={(e) => { e.stopPropagation(); handleLocateMe(); }}
              className="w-[36px] h-[36px] bg-white border border-slate-200 rounded-xl flex items-center justify-center text-gray-700 hover:text-slate-900 hover:bg-[#1f2937] transition-all duration-200 group"
              title="ตำแหน่งของฉัน"
            >
              <svg className="w-5 h-5 transition-transform text-[#0369a1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v2m0 12v2m8-8h-2M6 12H4m14 0a6 6 0 11-12 0 6 6 0 0112 0z" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
              </svg>
            </button>

            <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button 
                onClick={(e) => { e.stopPropagation(); mapRef?.zoomIn(); }}
                className="w-[36px] h-[36px] flex items-center justify-center text-gray-700 hover:text-slate-900 hover:bg-[#1f2937] transition-colors"
                title="ซูมเข้า"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v12m-6-6h12" /></svg>
              </button>
              <div className="h-[1px] w-[20px] mx-auto bg-white"></div>
              <button 
                onClick={(e) => { e.stopPropagation(); mapRef?.zoomOut(); }}
                className="w-[36px] h-[36px] flex items-center justify-center text-gray-700 hover:text-slate-900 hover:bg-[#1f2937] transition-colors"
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
          preferCanvas={true} 
          className="w-full h-full z-0" 
          ref={setMapRef}
          >
            {!windyLayer && !satelliteLayer && <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} className="dark-map-filter" />}
            {!windyLayer && satelliteLayer && <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} attribution="Tiles &copy; Esri" />}
            
            {userLocation && (
              <Marker position={[userLocation.lat, userLocation.lng]} icon={createUserLocationIcon()}>
                <Popup className="popup-location">
                  <div className="p-3 bg-white text-center min-w-[180px]">
                    <div className="text-[#0369a1] font-bold text-base mb-2 border-b border-slate-200 pb-2 flex items-center justify-center space-x-1.5">
                      <span></span> <span>ตำแหน่งของคุณ</span>
                    </div>
                    <div className="text-gray-700 text-base font-mono mb-1">Lat: <span className="text-slate-900">{userLocation.lat.toFixed(6)}</span></div>
                    <div className="text-gray-700 text-base font-mono">Lng: <span className="text-slate-900">{userLocation.lng.toFixed(6)}</span></div>
                  </div>
                </Popup>
              </Marker>
            )}

            {showSafeZone && safeZonesData.map((sz, i) => (
              <Marker key={`safezone-${i}`} position={[sz.lat, sz.lng]} icon={createSafeZoneIcon()}>
                <Popup className="popup-safezone">
                  <div className="p-3 bg-white min-w-[150px]">
                    <div className="text-[#047857] font-bold text-base mb-1 flex items-center space-x-1.5">
                      <span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 10 8-7 8 7v11H4V10Zm5 11v-7h6v7" /></svg></span> <span>จุดปลอดภัย/ศูนย์พักพิง</span>
                    </div>
                    <div className="text-slate-900 text-base font-semibold">{sz.name}</div>
                    <div className="text-gray-600 text-sm mt-2 border-t border-slate-200 pt-2">เทศบาลตำบลบ่อหลวง</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {showBoluang && geoBoluang && <GeoJSON key="boluang-layer" data={geoBoluang} style={styleBoluang} onEachFeature={onEachBoluangFeature} />}
            {showBlock && geoBlockWithIndex && <GeoJSON key="block-layer" data={geoBlockWithIndex} style={getBlockStyle} onEachFeature={onEachBlockFeature} />}
            {showParcel && geoParcel && <GeoJSON key="parcel-layer" data={geoParcel} style={styleParcel} />}
            
            {showLandslide && geoLandslide && (
              <GeoJSON 
                key="landslide-layer" 
                data={geoLandslide} 
                style={styleLandslide} 
                onEachFeature={(feature: any, layer: any) => {
                  const riskLevel = feature.properties?.risk || feature.properties?.Risk || feature.properties?.RISK_LEVEL || 'พื้นที่เสี่ยงดินถล่ม';
                  layer.bindTooltip(` ระดับความเสี่ยง: ${riskLevel}`, { sticky: true, direction: 'auto', className: 'village-hover-tooltip' });
                }} 
              />
            )}

            {tmdWeather && localWeatherData.map((prov, i) => {
              return (
                <Marker key={`prov-wx-${i}`} position={[prov.lat, prov.lng]} icon={createTmdIcon(prov.wCode)}>
                  <Popup className="popup-tmd-weather">
                    <div>
                      <div className="bg-[#38bdf8] px-4 py-3 font-bold text-[#0f172a] text-base flex items-center">
                        <span className="mr-2 text-[18px]">≋</span> พยากรณ์อากาศ
                      </div>
                      <div className="p-4 bg-white">
                        <div className="font-bold text-slate-900 mb-3 pb-2 border-b border-slate-200 flex items-center">
                          จุดตรวจวัด: {prov.name}
                          {prov.type === 'local' && <span className="bg-[#10b981] text-slate-900 px-1.5 py-0.5 rounded text-sm ml-2 font-mono">Micro-climate</span>}
                          {prov.type === 'district' && <span className="bg-[#f59e0b] text-slate-900 px-1.5 py-0.5 rounded text-sm ml-2">ระดับอำเภอ</span>}
                        </div>
                        <div className="text-base text-gray-700 space-y-2 font-medium mb-4">
                          <div>สภาพอากาศ: <span className="text-slate-900">{getWmoWeatherDesc(prov.wCode)}</span></div>
                          <div>อุณหภูมิ: <span className="text-[#0369a1] font-bold text-base">{prov.tempMin.toFixed(1)}° – {prov.tempMax.toFixed(2)}°C</span></div>
                          <div>ฝน: <span className="text-slate-900">{prov.rain} มม.</span></div>
                          <div>ความชื้น: <span className="text-slate-900">{prov.humidity}%</span></div>
                          <div>ลม: <span className="text-slate-900">{prov.wind.toFixed(2)} ม./วินาที</span></div>
                        </div>
                        <div className="text-sm text-gray-500 font-mono text-left pt-3 border-t border-slate-200">
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
                      <div className="bg-[#fcd34d] px-4 py-3 font-bold text-[#0f172a] text-base flex items-center">
                        <span className="mr-2 text-[18px]">∴</span> ปริมาณน้ำฝนสะสม
                      </div>
                      <div className="p-4 bg-white">
                        <div className="font-bold text-slate-900 mb-3 pb-2 border-b border-slate-200 flex items-center">
                          พื้นที่: {prov.name}
                          {prov.type === 'local' && <span className="bg-[#10b981] text-slate-900 px-1.5 py-0.5 rounded text-sm ml-2 font-mono">Micro-climate</span>}
                          {prov.type === 'district' && <span className="bg-[#f59e0b] text-slate-900 px-1.5 py-0.5 rounded text-sm ml-2">ระดับอำเภอ</span>}
                        </div>
                        <div className="text-base text-gray-700 space-y-2 font-medium mb-4">
                          <div>ฝนสะสม: <span className="text-[#92400e] font-bold text-base">{prov.rainSum.toFixed(1)} มม.</span></div>
                          <div>ขนาดจุด: <span className="text-slate-900">{style.radius.toFixed(1)} px</span></div>
                          <div>สภาพอากาศ: <span className="text-slate-900">{getWmoWeatherDesc(prov.wCode)}</span></div>
                          <div>อุณหภูมิ: <span className="text-slate-900">{prov.tempMin.toFixed(2)}° – {prov.tempMax.toFixed(2)}°C</span></div>
                        </div>
                        <div className="text-sm text-gray-500 font-mono text-left pt-3 border-t border-slate-200 leading-relaxed">
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
                      <div className="bg-[#3b82f6] px-4 py-3 font-bold text-slate-900 text-base flex items-center">
                        <span className="mr-2 text-[18px]">∴</span> ปริมาณฝน 24 ชม. (สทนช.)
                      </div>
                      <div className="p-4 bg-white">
                        <div className="text-base font-bold text-slate-900 mb-3 pb-2 border-b border-slate-200">
                          สถานี: {stationName}
                        </div>
                        <div className="text-base text-gray-700 space-y-2 font-medium mb-4">
                          <div>จังหวัด: <span className="text-slate-900">{provName}</span></div>
                          <div>ปริมาณฝน: <span className="text-[#3b82f6] font-bold text-[16px]">{rainVal.toFixed(1)} มม.</span></div>
                        </div>
                        <div className="text-sm text-gray-500 font-mono text-left pt-3 border-t border-slate-200 leading-relaxed">
                          แหล่งที่มา: สถานีตรวจวัดจริง สทนช. (ThaiWater)<br/>
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
                      <div className="bg-[#2563eb] px-4 py-3 font-bold text-slate-900 text-base flex items-center">
                        <span className="mr-2 text-[18px]"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8c3-4 6 4 9 0s6 4 9 0M3 15c3-4 6 4 9 0s6 4 9 0" /></svg></span> ระดับน้ำ (สทนช.)
                      </div>
                      <div className="p-4 bg-white">
                        <div className="text-base font-bold text-slate-900 mb-3 pb-2 border-b border-slate-200">
                          สถานี: {stationName}
                        </div>
                        <div className="text-base text-gray-700 space-y-2 font-medium mb-4">
                          <div>ลุ่มน้ำ: <span className="text-slate-900">{basin}</span></div>
                          <div>ระดับน้ำ: <span className="text-[#1d4ed8] font-bold text-[16px]">{waterLevel.toFixed(2)} ม.รทก.</span></div>
                          <div>อัตราการไหล: <span className="text-slate-900">{discharge}</span></div>
                        </div>
                        <div className="text-sm text-gray-500 font-mono text-left pt-3 border-t border-slate-200 leading-relaxed">
                          แหล่งที่มา: เซนเซอร์วัดจริง สทนช. (ThaiWater)<br/>
                          เวลา: {time}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {pm25 && localAirData.filter(station => typeof station.pm25Val === 'number' && station.quality !== 'EXPIRED').map((station) => {
              const { aqi, text, color } = getAirQualityDetails(station.pm25Val);
              const formattedTime = station.time ? new Date(station.time).toLocaleString('th-TH') : 'ไม่ทราบเวลา';
              
              return (
                <Marker key={`cams-pm25-${station.name}`} position={[station.lat, station.lng]} icon={createPm25Icon(station.pm25Val)}>
                  <Popup className="popup-pm25-custom">
                    <div className="flex flex-col">
                      <div style={{ backgroundColor: color }} className="px-4 py-3 font-bold text-[#0f172a] text-base flex items-center rounded-t-lg relative">
                        <span className="mr-2 text-[18px]">≋</span> ค่าฝุ่น PM2.5 / AQI
                      </div>
                      
                      <div className="p-4 bg-white text-base text-gray-800 font-medium rounded-b-lg">
                        <div className="font-bold text-slate-900 mb-3 pb-2 border-b border-slate-200 flex items-center">
                          จุดประเมินแบบจำลอง: {station.name}
                        </div>

                        <div className="space-y-1.5 font-bold text-base">
                          <div className="flex items-center">
                            <span className="w-16 text-slate-900">PM2.5:</span>
                            <span style={{ color: color }} className="text-[17px]">{station.pm25Val.toFixed(1)} <span className="text-base">µg/m³</span></span>
                          </div>
                          <div className="flex items-center">
                            <span className="w-16 text-slate-900">AQI:</span>
                            <span className="text-slate-900">{aqi} <span style={{ color: color }}>({text})</span></span>
                          </div>
                          <div className="flex items-center text-slate-900">
                            <span className="w-16">PM10:</span>
                            <span className="font-normal">{station.pm10Val != null ? `${station.pm10Val} µg/m³` : 'ไม่มีข้อมูล'}</span>
                          </div>
                          <div className="flex items-center text-slate-900 pt-1">
                            <span className="font-bold">O₃:</span> <span className="font-normal ml-1">{station.o3Val ?? 'ไม่มีข้อมูล'}</span>
                            <span className="mx-2 text-gray-500">·</span> 
                            <span className="font-bold">CO:</span> <span className="font-normal ml-1">{station.coVal ?? 'ไม่มีข้อมูล'}</span>
                          </div>
                          <div className="flex items-center text-slate-900">
                            <span className="font-bold">NO₂:</span> <span className="font-normal ml-1">{station.no2Val ?? 'ไม่มีข้อมูล'}</span>
                            <span className="mx-2 text-gray-500">·</span> 
                            <span className="font-bold">SO₂:</span> <span className="font-normal ml-1">{station.so2Val ?? 'ไม่มีข้อมูล'}</span>
                          </div>
                        </div>

                        <div className="border-t border-slate-200 my-3"></div>
                        <div className="text-sm text-gray-600 font-mono tracking-wide leading-relaxed">
                          แหล่งที่มา: แบบจำลอง CAMS ผ่าน Open-Meteo — ไม่ใช่สถานีตรวจวัด<br/>
                          เวลาอ้างอิง: {formattedTime} · สถานะ {station.quality}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {citizenReport && disasterReports.map((incident: any) => {
              const severityColor = getSeverityColor(incident.severity_level);
              
              let statusColor = "bg-blue-100 text-blue-700 border-blue-200";
              let statusText = incident.status || "รับเรื่องแล้ว";
              
              if (statusText.includes("เสร็จแล้ว") || statusText.includes("ปิดจ๊อบ")) {
                statusColor = "bg-emerald-100 text-emerald-700 border-emerald-200";
                statusText = "ดำเนินการเสร็จแล้ว";
              } else if (statusText.includes("กำลัง") || statusText.includes("ระหว่าง")) {
                statusColor = "bg-orange-100 text-orange-700 border-orange-200";
                statusText = "อยู่ระหว่างดำเนินการ";
              }

              return (
                <Marker key={`report-${incident.id}`} position={[incident.latitude, incident.longitude]} icon={getIncidentIcon(incident)}>
                  <Popup className="custom-popup" minWidth={320} maxWidth={320}>
                    <div className="w-[320px] bg-white rounded-xl overflow-hidden flex flex-col -m-5 border border-slate-200">
                      
                      <div className="bg-white px-4 py-3 flex items-center justify-between shrink-0 border-b border-slate-200">
                        <div className="flex items-center space-x-2.5 w-full pr-6">
                          <div className="w-8 h-8 bg-rose-500/10 rounded-lg flex items-center justify-center border border-rose-200 shrink-0">
                            <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <h3 className="text-base font-bold text-slate-900 truncate">
                            {incident.risk_type}
                          </h3>
                        </div>
                      </div>

                      <div className="p-4 flex-1 space-y-3.5">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-slate-600 uppercase">ความรุนแรง:</span>
                            <span className={`px-2 py-0.5 rounded text-sm font-bold text-slate-900  ${severityColor}`}>
                              ระดับ {incident.severity_level}
                            </span>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded text-sm font-bold border  ${statusColor}`}>
                            {statusText}
                          </span>
                        </div>

                        <div className="space-y-3 text-base">
                          <div className="flex items-start">
                            <svg className="w-4 h-4 text-rose-500 mt-0.5 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            <div>
                              <span className="text-slate-500 font-bold text-sm block leading-none mb-1">พื้นที่เกิดเหตุ</span>
                              <span className="text-slate-800 font-bold">{incident.village_name}</span>
                            </div>
                          </div>

                          <div className="flex items-start">
                            <svg className="w-4 h-4 text-emerald-500 mt-0.5 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                            <div>
                              <span className="text-slate-500 font-bold text-sm block leading-none mb-1">พิกัด (GPS)</span>
                              <span className="text-emerald-600 font-mono font-bold select-all cursor-text bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                {incident.latitude.toFixed(6)}, {incident.longitude.toFixed(6)}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-start bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <svg className="w-4 h-4 text-slate-500 mt-0.5 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <div className="flex-1">
                              <span className="text-slate-500 font-bold text-sm block leading-none mb-1">รายละเอียด</span>
                              <p className="text-slate-800 leading-snug line-clamp-3">{incident.description}</p>
                            </div>
                          </div>

                          <div className="flex items-start">
                            <svg className="w-4 h-4 text-blue-500 mt-0.5 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            <div>
                              <span className="text-slate-500 font-bold text-sm block leading-none mb-1">ผู้แจ้ง ({incident.reporter_role})</span>
                              <span className="text-blue-700 font-bold">{incident.reporter_name || 'ไม่ระบุชื่อ'}</span>
                            </div>
                          </div>
                        </div>

                        {incident.image_url && (
                          <div 
                            className="mt-4 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:border-blue-200 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewImage(incident.image_url);
                            }}
                          >
                            <img 
                              src={incident.image_url} 
                              alt="Incident" 
                              className="w-full h-36 object-cover"
                              onError={(e: any) => { e.target.style.display = 'none'; }} 
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-4 mt-1 border-t border-slate-100">
                          <a 
                            href={`https://maps.google.com/?q=${incident.latitude},${incident.longitude}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 py-2.5 rounded-lg font-bold text-base flex justify-center items-center space-x-1.5 transition-colors"
                          >
                            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                            <span>เปิดใน Maps</span>
                          </a>
                          <a 
                            href={`https://www.google.com/maps/dir/?api=1&destination=${incident.latitude},${incident.longitude}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="bg-blue-50 hover:bg-blue-50 text-slate-900 py-2.5 rounded-lg font-bold text-base flex justify-center items-center space-x-1.5 transition-colors"
                          >
                            <svg className="w-4 h-4 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            <span className="text-slate-900">เริ่มนำทาง</span>
                          </a>
                        </div>
                      </div>

                      <div className="bg-slate-50 py-2.5 px-4 text-center border-t border-slate-200 shrink-0">
                        <p className="text-sm text-slate-500 font-medium">
                          แหล่งที่มา: ประชาชนในพื้นที่<br/>
                          แจ้งเหตุเมื่อ: {new Date(incident.created_at).toLocaleString('th-TH')}
                        </p>
                      </div>

                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {hotspot && hotspotData && hotspotData.features && hotspotData.features.map((feature: any, i: number) => {
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
                      <div className="bg-[#f97316] px-5 py-3 font-bold text-[#0f172a] text-base flex items-center">
                        <span className="mr-2 text-[18px]"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3c2 5 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 3 2 3 2 3s2-3 1-8Z" /></svg></span> จุดความร้อน Hotspot
                      </div>
                      <div className="p-5 bg-white">
                        <div className="text-base text-gray-700 font-medium mb-4">
                          ประเภทของพื้นที่: <span className="bg-[#3b82f6] text-slate-900 px-2 py-1 rounded text-base font-bold ml-1">{areaType}</span>
                        </div>
                        <div className="border-t border-slate-200 py-3 text-base text-gray-700 leading-relaxed font-semibold">
                          จังหวัด: <span className="text-slate-900">{provName}</span><br/>
                          ตำบล: <span className="text-slate-900">{tamName}</span>
                        </div>
                        <div className="border-t border-slate-200 pt-3 text-sm text-gray-500 font-mono">
                          แหล่งที่มา: ดาวเทียม GISTDA Sphere API<br/>
                          ดาวเทียม: {props.satellite || hotspotMeta.satelliteTypes.join(', ') || 'ไม่ระบุ'}<br/>
                          เวลาตรวจพบ: {props.acquiredAt ? new Date(props.acquiredAt).toLocaleString('th-TH') : hotspotMeta.acquisitionTime ? new Date(hotspotMeta.acquisitionTime).toLocaleString('th-TH') : 'ไม่ทราบเวลา'}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {earthquakeLayer && FaultLineData && FaultLineData.features && FaultLineData.features.map((feature: any, i: number) => {
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
                      <div className="bg-[#a855f7] px-5 py-3 font-bold text-slate-900 text-base flex items-center">
                        <span className="mr-2 text-[18px]">〰</span> จุดเสี่ยงแผ่นดินไหว
                      </div>
                      <div className="p-5 bg-white">
                        <div className="text-base text-gray-700 font-medium mb-4">
                          พื้นที่: <span className="text-[#c084fc] font-bold text-base ml-1">{areaName}</span>
                        </div>
                        <div className="border-t border-slate-200 py-3 text-base text-gray-700 leading-relaxed font-semibold">
                          จังหวัด: {provName}<br/>
                          อำเภอ/แนวพื้นที่: {distName}<br/>
                          ระดับความเสี่ยง: <span className="text-[#854d0e]">{riskLevel}</span><br/>
                          สถานการณ์จำลอง: <span className="text-slate-900">{mag}</span>
                        </div>
                        <div className="border-t border-slate-200 pt-3 text-sm text-gray-500 font-mono">
                          แหล่งที่มา: กรมทรัพยากรธรณี
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
      {/*  6. แถบเครื่องมือและ Legend */}
      {/* ========================================== */}

      <header className="bl-map-header">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/Logogis3.png" alt="เทศบาลตำบลบ่อหลวง" className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-contain" />
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900 sm:text-base">บ่อหลวง GIS</h1>
            <p className="truncate text-sm text-slate-500">แผนที่และข้อมูลสาธารณภัย</p>
          </div>
        </div>
        <div className="hidden items-center gap-4 text-sm text-slate-600 xl:flex">
          <span>{headerWeather ? `${Math.round(headerWeather.temp)}°C · ${getWmoWeatherDesc(headerWeather.wCode)}` : 'กำลังตรวจสอบข้อมูลอากาศ'}</span>
          <span className="border-l border-slate-200 pl-4 tabular-nums">{mounted ? currentTime.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'กำลังซิงค์เวลา'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => togglePanel('left')} aria-label="ชั้นอากาศและน้ำ" aria-expanded={isLeftPanelOpen} aria-controls="gis-environment-panel" className="bl-toolbar-button">
            <LineIcon name="weather" /><span className="hidden sm:inline">อากาศและน้ำ</span>
          </button>
          <button type="button" onClick={() => togglePanel('right')} aria-expanded={isRightPanelOpen} aria-controls="gis-layer-panel" className="bl-toolbar-button">
            <LineIcon name="layers" /><span>ชั้นข้อมูล</span>
          </button>
          <button type="button" aria-label="ติดตั้งแอป" onClick={() => { if (isInstallable && deferredPrompt) handleInstallClick(); else setShowQrModal(true); }} className="bl-toolbar-button hidden md:inline-flex">
            <LineIcon name="download" /><span>ติดตั้งแอป</span>
          </button>
        </div>
      </header>

      <nav aria-label="เมนูหลัก" className="absolute top-[72px] left-0 right-0 h-12 z-[79] border-b border-slate-200 bg-white pointer-events-auto">
        <div className="h-full overflow-x-auto custom-scrollbar">
          <div className="mx-auto flex h-full min-w-max items-center gap-1 px-3 md:justify-center md:px-6">
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.href === '/' ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${item.href === '/' ? 'border border-sky-200 bg-sky-400/15 text-sky-700' : item.href === '/report' ? 'text-rose-700 hover:bg-rose-400/10' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <LineIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
            <button type="button" className="bl-nav-qr" onClick={() => setShowScanModal(true)} aria-haspopup="dialog">QR แบบฟอร์มแจ้งเหตุ</button>
            <span className="mx-1 h-5 w-px bg-white" aria-hidden="true" />
            <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
              <span>เจ้าหน้าที่</span>
            </Link>
          </div>
        </div>
      </nav>
      
      <aside 
        id="gis-environment-panel" aria-label="ชั้นอากาศและน้ำ"
        className="absolute inset-x-0 bottom-0 lg:inset-x-auto lg:bottom-auto lg:top-[132px] lg:left-4 z-[70] transition-transform duration-500 ease-in-out flex pointer-events-auto"
        style={{ transform: isLeftPanelOpen ? 'translate(0)' : (isMobile ? 'translateY(100%)' : 'translateX(-430px)') }}
      >
        <div className="relative flex h-full w-full items-start">
          <div inert={!isLeftPanelOpen} className="w-full lg:w-[380px] bg-white border border-slate-200 rounded-t-3xl lg:rounded-xl p-4 md:p-5 pb-20 lg:pb-5 max-h-[72vh] lg:max-h-[calc(100vh-148px)] overflow-y-auto custom-scrollbar">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xl font-semibold text-slate-900">ชั้นอากาศและน้ำ</span>
              <button type="button" onClick={() => setIsLeftPanelOpen(false)} aria-label="ปิดแผงข้อมูล" className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <p className="mb-4 text-sm leading-6 text-slate-600">เปิดหรือปิดข้อมูลบนแผนที่ รายละเอียดอากาศและสถานีของพื้นที่อยู่ในแผง “ชั้นข้อมูล”</p>
            <div className="space-y-4">
              <div>
                <div className="flex items-center mb-2">
                  <LineIcon name="weather" className="mr-2 h-4 w-4" />
                  <span className="text-sm md:text-sm text-[#0369a1] tracking-widest font-bold">พยากรณ์และปริมาณฝน</span>
                  <div className="flex-1 border-t border-slate-200 ml-4"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="พยากรณ์อากาศรายพื้นที่" source="ข้อมูล: Open-Meteo & TMD" active={tmdWeather} onClick={() => setTmdWeather(!tmdWeather)} dotColor="#38bdf8" apiStatus={apiStatus.tmd} />
                  <CustomToggleBox label="ฝนจากแบบจำลอง 24 ชม." source="Open-Meteo — ไม่ใช่สถานีตรวจวัด" active={tmdRain} onClick={() => setTmdRain(!tmdRain)} dotColor="#facc15" apiStatus={apiStatus.tmd} />
                </div>
              </div>

              <div>
                <div className="flex items-center mb-2">
                  <LineIcon name="weather" className="mr-2 h-4 w-4" />
                  <span className="text-sm md:text-sm text-gray-600 tracking-widest font-bold">คุณภาพอากาศ (AIR QUALITY)</span>
                  <div className="flex-1 border-t border-slate-200 ml-4"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="ค่าฝุ่น PM2.5" source="แบบจำลอง CAMS ผ่าน Open-Meteo — ไม่ใช่สถานีตรวจวัด" active={pm25} onClick={() => setPm25(!pm25)} dotColor="#06b6d4" apiStatus={apiStatus.pm25} />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 rounded-xl">
                    <span className="text-slate-900 text-[18px]"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8c3-4 6 4 9 0s6 4 9 0M3 15c3-4 6 4 9 0s6 4 9 0" /></svg></span>
                  </div>
                  <h2 className="text-[18px] md:text-[20px] font-sans font-bold tracking-wide text-[#1d4ed8]">น้ำและน้ำท่วม</h2>
                </div>

                <div className="flex items-center mb-2">
                  
                  <span className="text-sm md:text-sm text-blue-700 tracking-widest font-bold">ข้อมูลแหล่งน้ำ (สทนช.)</span>
                  <div className="flex-1 border-t border-slate-200 ml-4"></div>
                </div>
                <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                  <CustomToggleBox label="ระดับน้ำในพื้นที่" source="เซนเซอร์ สทนช." active={onwrWaterLevel} onClick={() => setOnwrWaterLevel(!onwrWaterLevel)} dotColor="#2563eb" apiStatus={apiStatus.onwrWater} />
                  <CustomToggleBox label="ปริมาณฝน 24 ชม." source="สถานี สทนช." active={onwrRain} onClick={() => setOnwrRain(!onwrRain)} dotColor="#3b82f6" apiStatus={apiStatus.onwrRain} />
                  

                </div>
              </div>       
            </div>

            <details className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-600">
              <summary className="min-h-11 cursor-pointer font-semibold">แหล่งข้อมูลและข้อมูลเว็บไซต์</summary>
              <p className="mb-3 leading-6">อากาศเป็นแบบจำลอง สถานีน้ำและฝนเป็นค่าตรวจวัด ตรวจเวลาอ้างอิงก่อนใช้</p>
              <ExternalFloodLink />
              <p className="mt-3">ผู้เข้าชม: {visitStats.state === 'ready' ? `วันนี้ ${visitStats.today?.toLocaleString('th-TH')} · รวม ${visitStats.total?.toLocaleString('th-TH')}` : visitStats.state === 'error' ? 'ข้อมูลไม่พร้อม' : 'กำลังโหลด'}</p>
              <button type="button" onClick={() => { if (isInstallable && deferredPrompt) handleInstallClick(); else setShowQrModal(true); }} className="bl-toolbar-button mt-3 md:hidden">ติดตั้งแอปบนอุปกรณ์</button>
            </details>
          </div>



        </div>
      </aside>

      <div className="hidden md:flex absolute bottom-4 left-4 z-[60] flex-wrap gap-2 pointer-events-auto max-w-[60%]">
        <div className="bg-white border border-slate-200 rounded-full px-3 py-1.5 text-sm font-mono text-gray-600">
          {satelliteLayer ? 'Esri World Imagery' : 'OpenStreetMap'}
        </div>
        <div className="bg-white border border-slate-200 rounded-full px-3 py-1.5 text-sm font-mono text-[#0369a1]">
          <span ref={coordsRef}>18.1633°N 98.3744°E</span>
        </div>
      </div>

      <div className="hidden md:flex absolute bottom-4 right-1/2 translate-x-1/2 z-[60] pointer-events-auto">
        <div className="bg-white border border-slate-200 rounded-full px-3 py-1.5 text-sm font-mono text-gray-600 flex items-center space-x-1.5">
          
          <span>แผนที่: OSM / Esri · ข้อมูล: Open-Meteo / สทนช. / GISTDA</span>
        </div>
      </div>

      {/* Sidebar ขวา (แจ้งเหตุ/ภัยธรรมชาติ/แผนที่) */}
      <aside id="gis-layer-panel" aria-label="จัดการชั้นข้อมูลแผนที่" className="absolute inset-x-0 bottom-0 lg:inset-x-auto lg:bottom-auto lg:top-[132px] lg:right-0 z-[70] transition-transform duration-500 ease-in-out flex pointer-events-auto" style={{ transform: isRightPanelOpen ? 'translate(0)' : (isMobile ? 'translateY(100%)' : 'translateX(440px)') }}>
        <div className="relative lg:mr-5 flex w-full lg:w-auto">

          
          <div inert={!isRightPanelOpen} className="w-full lg:w-[400px] ml-auto bg-white border border-slate-200 rounded-t-3xl lg:rounded-xl p-4 md:p-5 pb-20 lg:pb-5 max-h-[72vh] lg:max-h-[calc(100vh-148px)] overflow-y-auto custom-scrollbar">
            
            <AreaContextPanel area={selectedArea} villages={villages} loading={!geoBlock && !villageError} error={villageError} onSelect={selectVillage} onPreset={applyLayerPreset} onClose={() => setIsRightPanelOpen(false)} />
            <div className="mb-4 bg-white p-1.5 rounded-xl border border-slate-200 flex">
              <form onSubmit={handleSearchSubmit} className="flex w-full">
                <input 
                  type="text" 
                  aria-label="ค้นหาสถานที่บนแผนที่" placeholder="ค้นหาหมู่บ้าน ถนน หรือสถานที่" 
                  className="w-full bg-transparent text-base text-slate-900 px-3 py-1.5 outline-none placeholder-gray-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" aria-label="ค้นหาสถานที่" className="bg-[#38bdf8] text-[#0b132b] px-3 rounded-lg font-bold hover:bg-[#7dd3fc] transition-colors flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>
              </form>
            </div>

            <div className="mb-4 border-b border-slate-200 pb-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold text-slate-900">แสดงบนแผนที่</h2>
                <span className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600">เปิด {activeLayersCount} ชั้น</span>
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-600">ชั้นอากาศและสถานีน้ำอยู่ในแผง “อากาศและน้ำ”</p>
            </div>

            <div className="space-y-4">
              
              <div>
                <div className="flex items-center mb-2">
                  <span className="text-sm md:text-sm text-gray-600 tracking-widest font-bold">รายงานบนแผนที่</span>
                  <div className="flex-1 border-t border-slate-200 ml-3"></div>
                </div>
                <div className="space-y-2">
                  <CustomToggleBox label="จุดแจ้งเหตุจากประชาชน" source="ระบบรับแจ้งเหตุเทศบาล" active={citizenReport} onClick={() => setCitizenReport(!citizenReport)} dotColor="#ef4444" />
                </div>
              </div>

              <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 p-3 rounded-xl mb-4">
                <div className="flex items-center mb-2">
                  <span className="text-sm text-[#b91c1c] font-bold tracking-widest">ภัยและพื้นที่อ้างอิง</span>
                  <div className="flex-1 border-t border-[#ef4444]/30 ml-3"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="จุดความร้อน/ไฟป่า" source="ดาวเทียม GISTDA" active={hotspot} onClick={() => setHotspot(!hotspot)} dotColor="#ea580c" apiStatus={apiStatus.gistda} />
                  <CustomToggleBox label="พื้นที่เสี่ยงดินถล่ม" source="ข้อมูลอ้างอิง: กรมทรัพยากรฯ" active={showLandslide} onClick={() => setShowLandslide(!showLandslide)} dotColor="#ef4444" />
                  <CustomToggleBox label="รอยเลื่อนแผ่นดินไหว" source="ข้อมูลอ้างอิง: กรมทรัพยากรธรณี" active={earthquakeLayer} onClick={() => setEarthquakeLayer(!earthquakeLayer)} dotColor="#c084fc" />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex items-center mb-2">
                  <span className="text-sm md:text-sm text-[#047857] tracking-widest font-bold">แผนที่ฐานและขอบเขต</span>
                  <div className="flex-1 border-t border-slate-200 ml-3"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="จุดอ้างอิง / ศูนย์พักพิง" source="พิกัดศูนย์: เทศบาลบ่อหลวง" active={showSafeZone} onClick={() => setShowSafeZone(!showSafeZone)} dotColor="#10b981" />
                  <CustomToggleBox label="แผนที่ดาวเทียม" source="Esri World Imagery" active={satelliteLayer} onClick={() => setSatelliteLayer(!satelliteLayer)} dotColor="#10b981" />
                  <CustomToggleBox label="ขอบเขตตำบลบ่อหลวง" active={showBoluang} onClick={() => setShowBoluang(!showBoluang)} dotColor="#38bdf8" />
                  <CustomToggleBox label="โซน 13 หมู่บ้าน" active={showBlock} onClick={() => setShowBlock(!showBlock)} dotColor="#fcd34d" />
                  
                  <div className="relative mt-2 pt-2 border-t border-slate-200">
                    <CustomToggleBox label="แปลงที่ดินรายบุคคล" active={showParcel} onClick={() => setShowParcel(!showParcel)} dotColor="#4ade80" />
                    <span className="absolute right-3 top-4 text-sm md:text-sm bg-red-500/10 text-red-700 px-1.5 py-0.5 rounded border border-red-200 pointer-events-none flex items-center">
                       เจ้าหน้าที่
                    </span>
                  </div>
                </div>
              </div>
              
            <div className="mb-4 text-slate-800"><AreaEvidencePanel area={selectedArea} /></div>
              <div className="mt-6 p-3 bg-white border border-slate-200 rounded-xl text-center">
                  <p className="text-sm text-gray-500 font-mono leading-relaxed">
                      <b>ความโปร่งใสของข้อมูล (Data Honesty):</b><br/>ข้อมูลภายนอกอาจล่าช้าหรือขาดหาย โปรดตรวจเวลารายชุด พื้นที่เสี่ยงเป็นข้อมูลอ้างอิง ไม่ใช่คำเตือนปัจจุบัน
                  </p>
              </div>



            </div>
          </div>
        </div>
      </aside>  
                 
      {/*  วางโค้ด Modal ที่หายไปตรงนี้ครับ (ก่อนปิด main) */}
      {showQrModal && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#050b14]/80 px-4 pointer-events-auto"
          onClick={() => setShowQrModal(false)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 max-w-sm w-full relative flex flex-col items-center text-center animate-fade-in-api"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setShowQrModal(false)} 
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white rounded-full text-gray-600 hover:text-slate-900 hover:bg-red-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">ติดตั้งแอปลงมือถือ</h3>
            <p className="text-base text-gray-600 mb-5 leading-relaxed">
              สแกนคิวอาร์โค้ดด้านล่าง เพื่อเปิดระบบในสมาร์ทโฟน
            </p>

            {/* ซ่อนรูป QR Code ถ้าเปิดบนมือถือ เพราะสแกนหน้าจอตัวเองไม่ได้ */}
            {!isMobile && (
              <div className="bg-white p-3 rounded-xl mb-5 w-[180px] h-[180px] flex items-center justify-center">
                <img 
                  src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://boluang-disaster-gis.vercel.app/" 
                  alt="QR Code สำหรับเข้าเว็บไซต์" 
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            
            {/* คำแนะนำเพิ่มเติมสำหรับคนที่เปิดลิงก์ผ่านแอป LINE */}
            {isMobile && !isInstallable && (
              <div className="bg-blue-500/10 border border-blue-200 p-3 rounded-xl mb-4 text-left w-full">
                <p className="text-sm text-blue-700 leading-relaxed">
                   <b>คำแนะนำ:</b> หากคุณเปิดเว็บนี้ผ่านแอป <b>LINE</b> หรือ <b>Facebook</b> แนะนำให้กดเมนู <span className="font-bold text-slate-900">⋮ มุมขวาบน</span> แล้วเลือก <span className="font-bold text-slate-900">เปิดด้วยเบราว์เซอร์ (Open in Browser)</span> ก่อน เพื่อให้ระบบรองรับการติดตั้งแอปครับ
                </p>
              </div>
            )}

            <div className="w-full bg-white border border-slate-200 rounded-xl p-4 mb-6 text-left">
              <h4 className="text-slate-900 font-bold text-base mb-3 flex items-center">
                <svg className="w-4 h-4 mr-1.5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ติดตั้งลงเครื่องแบบ Manual
              </h4>
              <div className="space-y-3 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-start text-base">
                  <span className="text-gray-800 font-bold w-[120px] flex-shrink-0">IOS • Safari</span>
                  <span className="text-gray-600">กดปุ่มแชร์ แล้วเลือก <span className="text-slate-900">เพิ่มไปยังหน้าจอโฮม</span></span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-start text-base">
                  <span className="text-gray-800 font-bold w-[120px] flex-shrink-0">Android • Chrome</span>
                  <span className="text-gray-600">กดเมนู ⋮ แล้วเลือก <span className="text-slate-900">ติดตั้งแอป</span></span>
                </div>
              </div>

              {/* ปุ่มติดตั้งฉุกเฉินใน Modal */}
              {isInstallable && (
                <button 
                  onClick={handleInstallClick} 
                  className="w-full bg-blue-50 hover:bg-blue-50 text-slate-900 font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>ติดตั้งแอปลงเครื่องทันที</span>
                </button>
              )}
            </div>

            <button 
              onClick={() => setShowQrModal(false)} 
              className="w-full bg-white hover:bg-white text-slate-900 py-3 rounded-xl font-bold transition-colors border border-slate-200"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

    </main>
  );
}
