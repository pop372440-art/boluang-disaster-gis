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

const safeZonesData = [
  { id: 1, name: 'รพ.สต. บ่อหลวง', lat: 18.14913, lng: 98.35532, type: 'hospital' },
  { id: 2, name: 'เทศบาลตำบลบ่อหลวง', lat: 18.14722, lng: 98.34933, type: 'shelter' },
  { id: 3, name: 'วัดบ่อหลวง', lat: 18.15199, lng: 98.35327, type: 'temple' },
  { id: 4, name: 'โรงเรียนบ้านบ่อหลวง', lat: 18.15269, lng: 98.35439, type: 'school' },
  { id: 5, name: 'โรงเรียนบ้านแม่หืด', lat: 18.21915, lng: 98.37122, type: 'school' },
  { id: 6, name: 'โรงเรียนบ้านวังกอง', lat: 18.12107, lng: 98.35366, type: 'school' },
  { id: 7, name: 'โรงเรียนบ้านขุน', lat: 18.10471, lng: 98.37400, type: 'school' },
  { id: 8, name: 'วัดบ่อสะแง๋', lat: 18.15015, lng: 98.35515, type: 'temple' },
  { id: 9, name: 'โรงเรียนบ้านพุย', lat: 18.03907, lng: 98.30002, type: 'school' },
  { id: 10, name: 'คริสจักรกิ่วลึกบ้านพุย', lat: 18.03681, lng: 98.30693, type: 'church' },
  { id: 11, name: 'โรงเรียนบ้านนาฟ่อน', lat: 18.08870, lng: 98.36053, type: 'school' },
  { id: 12, name: 'โรงเรียนบ้านกิ่วลม', lat: 18.14027, lng: 98.36942, type: 'school' },
  { id: 13, name: 'วัดบ่อพะแวน', lat: 18.14681, lng: 98.35252, type: 'temple' },
  { id: 14, name: 'โรงเรียนบ้านแม่ลาย', lat: 18.04770, lng: 98.36286, type: 'school' },
  { id: 15, name: 'โรงเรียนบ้านแม่ลายเหนือ', lat: 18.06555, lng: 98.33780, type: 'school' },
  { id: 16, name: 'โรงเรียนบ้านเตียนอาง', lat: 18.03097, lng: 98.40366, type: 'school' },
  { id: 17, name: 'คริสจักรเจริญธรรมห้วยบง', lat: 18.01215, lng: 98.43016, type: 'church' },
];

// ==========================================
// 🛠️ 2. ฟังก์ชันเสริม (Architecture & Logic)
// ==========================================

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

// 🛡️ API Resilience: กลไก Data Honesty และ Fault Tolerance
const fetchWithCache = async (url: string, cacheKey: string, timeoutMs = 5000) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data })); } catch (err) {}
    return { data, status: 'LIVE' };
  } catch (error) {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return { data: JSON.parse(cached).data, status: 'CACHED' };
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

// 🛡️ Data Honesty UI: แสดงสถานะการดึงข้อมูลอย่างโปร่งใส
const CustomToggleBox = ({ label, source, active, onClick, dotColor = '#38bdf8', isRadio = false, apiStatus = '' }: any) => {
  const [localActive, setLocalActive] = useState(active);
  useEffect(() => { setLocalActive(active); }, [active]);

  const handlePress = () => {
    setLocalActive(!localActive);
    setTimeout(() => { onClick(); }, 50);
  };

  const renderStatusBadge = () => {
    if (!apiStatus) return null;
    if (apiStatus === 'LIVE') return <span className="ml-auto text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider" title="ดึงข้อมูลสดสำเร็จ">LIVE</span>;
    if (apiStatus === 'CACHED') return <span className="ml-auto text-[8px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider" title="ใช้ข้อมูลสำรองเนื่องจากต้นทางล่าช้า">CACHED</span>;
    return <span className="ml-auto text-[8px] bg-red-500/20 text-red-400 border border-red-500/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider" title="ระบบต้นทางขัดข้อง">OFFLINE</span>;
  };

  return (
    <div className="flex items-center space-x-3 px-3 py-2 rounded-xl border border-[#1e293b] bg-[#0b132b]/50 hover:bg-[#1e293b]/80 transition-colors duration-200 cursor-pointer select-none mb-1.5 group" onClick={handlePress}>
      {isRadio ? (
        <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${localActive ? 'border-[#38bdf8]' : 'border-gray-500'}`}>
          {localActive && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}
        </div>
      ) : (
        <div className={`relative w-8 h-4 rounded-full transition-colors duration-300 flex-shrink-0 ${localActive ? 'bg-[#38bdf8]' : 'bg-[#334155]'}`}>
          <div className={`absolute top-[2px] left-[2px] bg-white rounded-full h-3 w-3 transition-transform duration-300 shadow-sm ${localActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
        </div>
      )}
      <div className="flex items-center justify-between flex-1 w-full overflow-hidden">
        <div className="flex flex-col">
            <div className="flex items-center space-x-2">
               {!isRadio && <div className="w-2.5 h-2.5 rounded-[3px] shadow-sm flex-shrink-0" style={{ backgroundColor: dotColor }}></div>}
               <span className={`text-[13px] font-medium transition-colors truncate ${localActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>{label}</span>
            </div>
            {source && <span className="text-[9px] text-gray-500 font-mono tracking-widest mt-0.5 ml-4.5">{source}</span>}
        </div>
        {renderStatusBadge()}
      </div>
    </div>
  );
};

// ==========================================
// 🌦️ 4. ฟังก์ชันข้อมูลอากาศ (Algorithm)
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

  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [headerWeather, setHeaderWeather] = useState<{ temp: number; wCode: number } | null>(null);

  const [apiStatus, setApiStatus] = useState({ tmd: '', pm25: '', onwrRain: '', onwrWater: '' });
  const [searchQuery, setSearchQuery] = useState('');

  // Sidebar Left
  const [tmdWeather, setTmdWeather] = useState(false);
  const [tmdRain, setTmdRain] = useState(false);
  const [pm25, setPm25] = useState(false); 
  const [onwrRain, setOnwrRain] = useState(false);
  const [onwrWaterLevel, setOnwrWaterLevel] = useState(false);

  // Sidebar Right
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
  const [showQrModal, setShowQrModal] = useState(false);

  // Data States
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
  const [currentZoom, setCurrentZoom] = useState(9);
  const [locationName, setLocationName] = useState('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');

  // ==========================================
  // ⚙️ UseEffects (Data Fetching & Core Logic)
  // ==========================================
  
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
          setHeaderWeather({ temp: data.current.temperature_2m, wCode: data.current.weathercode });
        }
      } catch (err) {}
    };
    fetchHeaderWeather();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024; 
      setIsMobile(mobile);
      if (mobile) { setIsLeftPanelOpen(false); setIsRightPanelOpen(true); } 
      else { setIsLeftPanelOpen(true); setIsRightPanelOpen(true); }
    };
    handleResize(); window.addEventListener('resize', handleResize);
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
          setter(Array.isArray(data) ? { type: "FeatureCollection", features: data } : data);
        }
      } catch (e) {}
    };

    loadGeoJSON(`/geojson/boluang.json?v=${ts}`, setGeoBoluang);
    loadGeoJSON(`/geojson/block.json?v=${ts}`, setGeoBlock); 
  }, []);

  // Hotspot (GISTDA)
  useEffect(() => {
    if (hotspot && !geoHotspot) {
      fetch(`https://api.sphere.gistda.or.th/services/info/disaster-recurring?lon=98.3744&lat=18.1633&disaster_type=hotspot&key=${GISTDA_API_KEY}`)
        .then(res => res.json()).then(data => setGeoHotspot(data)).catch(e => console.error(e));
    }
  }, [hotspot]);

  // Landslide Risk
  useEffect(() => {
    if (showLandslide && !geoLandslide) {
      fetch(`/geojson/boluang_landslide_risk.json?v=${Date.now()}`)
        .then(res => res.json()).then(data => setGeoLandslide(data)).catch(e => console.error(e));
    }
  }, [showLandslide]);

  // Earthquake
  useEffect(() => {
      if (earthquakeLayer && !geoEarthquake) {
        fetch(`/geojson/earthquake.geojson?v=${Date.now()}`)
          .then(res => res.json()).then(data => setGeoEarthquake(data)).catch(e => console.error(e));
      }
  }, [earthquakeLayer]);

  useEffect(() => {
    if (!mounted) return;
    const handleVisitorCount = async () => {
      try {
        let sessionId = sessionStorage.getItem('bl_session_id');
        if (!sessionId) {
          sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; 
          sessionStorage.setItem('bl_session_id', sessionId);
          await supabase.from('visitor_logs').insert([{ session_id: sessionId }]);
        }
        const { count: totalCount } = await supabase.from('visitor_logs').select('*', { count: 'exact', head: true });
        const today = new Date(); today.setHours(0, 0, 0, 0); 
        const { count: todayCount } = await supabase.from('visitor_logs').select('*', { count: 'exact', head: true }).gte('visited_at', today.toISOString());
        setVisitStats({ today: todayCount || 0, total: totalCount || 0 });
      } catch (error) {}
    };
    handleVisitorCount();
  }, [mounted]);

  // Weather Data (TMD/Open-Meteo)
  useEffect(() => {
    if (!tmdWeather && !tmdRain) { setLocalWeatherData([]); return; }
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

  // Air Quality (PM2.5)
  useEffect(() => {
    if (!pm25) { setLocalAirData([]); return; }
    const fetchLocalAir = async () => {
      const lats = localAirStations.map(s => s.lat.toFixed(4)).join(',');
      const lngs = localAirStations.map(s => s.lng.toFixed(4)).join(',');
      const urlAqi = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lngs}&current=pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=Asia%2FBangkok`;
      const urlWx = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=weathercode&timezone=Asia%2FBangkok`;
      
      const [aqiResult, wxResult] = await Promise.all([ fetchWithCache(urlAqi, 'pm25_aqi_cache'), fetchWithCache(urlWx, 'pm25_wx_cache') ]);
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

  // ONWR Data
  useEffect(() => {
    if (!onwrRain) { setOnwrRainData([]); return; }
    const fetchOnwrRain = async () => {
      const { data: json, status } = await fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', 'onwr_rain_cache');
      setApiStatus(prev => ({ ...prev, onwrRain: status }));
      let arrData = json?.data?.data || json?.data || [];
      const filteredData = arrData.filter((station: any) => {
        const latStr = station?.station?.tele_station_lat || station?.lat;
        const lngStr = station?.station?.tele_station_long || station?.lng;
        return latStr && lngStr && calculateDistance(BO_LUANG_LAT, BO_LUANG_LNG, parseFloat(latStr), parseFloat(lngStr)) <= MAX_DISTANCE_KM; 
      });
      setOnwrRainData(filteredData);
    };
    fetchOnwrRain();
  }, [onwrRain]);

  useEffect(() => {
    if (!onwrWaterLevel) { setOnwrWaterLevelData([]); return; }
    const fetchOnwrWaterLevel = async () => {
      const { data: json, status } = await fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load', 'onwr_water_cache');
      setApiStatus(prev => ({ ...prev, onwrWater: status }));
      let arrData = Array.isArray(json) ? json : (json?.data?.waterlevel_data?.data || json?.data || []);
      const filteredData = arrData.filter((station: any) => {
        const latStr = station?.station?.tele_station_lat || station?.lat;
        const lngStr = station?.station?.tele_station_long || station?.lng;
        return latStr && lngStr && calculateDistance(BO_LUANG_LAT, BO_LUANG_LNG, parseFloat(latStr), parseFloat(lngStr)) <= MAX_DISTANCE_KM; 
      });
      setOnwrWaterLevelData(filteredData);
    };
    fetchOnwrWaterLevel();
  }, [onwrWaterLevel]);

  // Supabase Reports
  useEffect(() => {
    if (!citizenReport) return;
    const fetchReports = async () => {
      try {
        const { data, error } = await supabase.from('boluang_disaster_reports').select('*').neq('status', 'ดำเนินการเสร็จแล้ว').order('created_at', { ascending: false }); 
        if (!error && data) setDisasterReports(data);
      } catch (error) { console.error(error); }
    };
    fetchReports();
  }, [citizenReport]);

  useEffect(() => {
    if (mapRef && (showBoluang || showBlock)) { mapRef.flyTo([18.1633, 98.3744], 12, { duration: 2.5, easeLinearity: 0.25 }); }
  }, [showBoluang, showBlock, mapRef]);

  const handleSearchSubmit = async (e: any) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    Swal.fire({ title: 'กำลังค้นหาพิกัด...', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery + ' เชียงใหม่')}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        if (mapRef) { mapRef.flyTo([parseFloat(lat), parseFloat(lon)], 14, { duration: 2 }); }
        Swal.close(); Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'พบพิกัด', text: display_name.split(',')[0], showConfirmButton: false, timer: 3000, background: '#1e293b', color: '#fff' });
      } else {
        Swal.fire({ icon: 'warning', title: 'ไม่พบสถานที่', background: '#0f172a', color: '#fff' });
      }
    } catch (error) { Swal.fire({ icon: 'error', title: 'ระบบค้นหาขัดข้อง', background: '#0f172a', color: '#fff' }); }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) return Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'เบราว์เซอร์ไม่รองรับ GPS', background: '#0f172a', color: '#fff' }); 
    Swal.fire({ title: 'กำลังวิเคราะห์พิกัด...', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        if (mapRef) mapRef.flyTo([latitude, longitude], 15, { duration: 1.5 });
        Swal.close();
      },
      (error) => { Swal.fire({ icon: 'error', title: 'ไม่สามารถระบุตำแหน่งได้', background: '#0f172a', color: '#fff' }); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // ==========================================
  // 🖼️ Icons & Map Features
  // ==========================================
  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const createTmdIcon = useMemo(() => { if (!L) return () => null; return (wCode: number) => { const emoji = getWeatherEmoji(wCode); return L.divIcon({ className: 'bg-transparent border-none', html: `<div class="flex items-center justify-center w-[36px] h-[36px] bg-[#0f172a] border-[2px] border-[#38bdf8] rounded-full shadow-[0_0_15px_rgba(56,189,248,0.5)]"><span class="text-[18px]">${emoji}</span></div>`, iconSize: [36, 36] }); }; }, [L]);
  const createPm25Icon = useMemo(() => { if (!L) return () => null; return (pmVal: number) => { const { color, shadow } = getAirQualityDetails(pmVal); return L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex flex-col items-center justify-center w-[48px] h-[48px] bg-[#0f172a]/95 border-[2px] rounded-xl z-10" style="border-color: ${color}; box-shadow: 0 0 15px ${shadow};"><span class="text-white font-bold text-[15px] mt-1">${pmVal.toFixed(1)}</span></div>`, iconSize: [48, 48] }); }; }, [L]);
  const createWaterLevelIcon = useMemo(() => { if (!L) return () => null; return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-[36px] h-[36px] bg-[#0f172a] border-[2px] border-[#3b82f6] rounded-full shadow-[0_0_15px_rgba(59,130,246,0.6)] z-20"><span class="text-[16px]">🌊</span></div>`, iconSize: [36, 36] }); }, [L]);
  const createReportIcon = useMemo(() => { if (!L) return () => null; return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#ef4444] rounded-full blur-[8px] opacity-60 animate-pulse"></div><div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#ef4444] rounded-full z-10"><span class="text-[#ef4444] text-[14px]">🚨</span></div></div>`, iconSize: [40, 40] }); }, [L]);
  const createHotspotIcon = useMemo(() => { if (!L) return () => null; return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#ea580c] rounded-full blur-[8px] opacity-60"></div><div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#ea580c] rounded-full z-10"><span class="text-[#ea580c] text-[14px]">🔥</span></div></div>`, iconSize: [40, 40] }); }, [L]);
  const createQuakeIcon = useMemo(() => { if (!L) return () => null; return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#c084fc] rounded-full blur-[8px] opacity-50"></div><div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#c084fc] rounded-full z-10"><span class="text-[#c084fc] text-[14px] font-bold">〰</span></div></div>`, iconSize: [40, 40] }); }, [L]);
  const createSafeZoneIcon = useMemo(() => { if (!L) return () => null; return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-10 h-10"><div class="absolute inset-0 bg-[#10b981] rounded-full blur-[8px] opacity-40"></div><div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#10b981] rounded-full z-10"><span class="text-[#10b981] text-[13px]">🛡️</span></div></div>`, iconSize: [40, 40] }); }, [L]);
  const createUserLocationIcon = useMemo(() => { if (!L) return () => null; return () => L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-8 h-8"><div class="absolute inset-0 bg-[#38bdf8] rounded-full blur-[6px] opacity-70 animate-ping"></div><div class="relative flex items-center justify-center w-5 h-5 bg-[#0ea5e9] border-[2px] border-white rounded-full shadow-lg z-10"></div></div>`, iconSize: [32, 32] }); }, [L]);

  const BLOCK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#14b8a6', '#0ea5e9'];
  const getVillageColor = (feature: any) => { const props = feature?.properties || {}; const nameStr = String(props.own_villag || props.name_th || props.name || props.zone_name || props.id || ""); const match = nameStr.match(/\d+/); if (match) { const num = parseInt(match[0], 10); if (num >= 1 && num <= BLOCK_COLORS.length) return BLOCK_COLORS[num - 1]; } return BLOCK_COLORS[nameStr.length % BLOCK_COLORS.length]; };
  const getBlockStyle = (feature: any) => ({ fillColor: getVillageColor(feature), weight: 1.5, color: 'rgba(255, 255, 255, 0.3)', fillOpacity: 0.12, dashArray: '3, 3' });
  const styleBoluang = { color: '#0ea5e9', weight: 3, fill: false, interactive: true }; 
  const styleParcel = { color: '#4ade80', fillColor: '#4ade80', weight: 1, fillOpacity: 0.2 }; 
  const styleLandslide = (feature: any) => { const risk = String(feature.properties?.risk || feature.properties?.Risk || ''); let color = '#facc15'; let opacity = 0.3; if (risk.includes('สูง') || risk.includes('High')) { color = '#ef4444'; opacity = 0.6; } else if (risk.includes('ปานกลาง') || risk.includes('Moderate')) { color = '#f97316'; opacity = 0.4; } return { color: color, fillColor: color, weight: 0, fillOpacity: opacity }; };

  const getRainCircleStyle = (rainSum: number) => {
    let radius = 8 + (rainSum * 1.5); if (radius > 35) radius = 35; 
    let color = '#38bdf8'; let fillColor = '#7dd3fc'; 
    if (rainSum === 0) { color = '#94a3b8'; fillColor = '#cbd5e1'; radius = 7; } 
    else if (rainSum > 5 && rainSum <= 20) { color = '#10b981'; fillColor = '#34d399'; } 
    else if (rainSum > 20 && rainSum <= 50) { color = '#facc15'; fillColor = '#fde047'; } 
    else if (rainSum > 50) { color = '#ef4444'; fillColor = '#f87171'; }
    return { radius, color, fillColor, fillOpacity: 0.5, weight: 2.5 };
  };

  return (
    <main className="relative w-screen h-screen bg-[#0b132b] font-sans text-white overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: transparent !important; cursor: crosshair !important; }
        .leaflet-top.leaflet-left { top: 90px !important; left: 10px !important; }
        @media (min-width: 768px) { .leaflet-top.leaflet-left { top: 90px !important; left: 370px !important; } }
        .leaflet-div-icon { background: transparent !important; border: none !important; }
        .popup-custom .leaflet-popup-content-wrapper { background-color: #0f172a !important; color: #e2e8f0 !important; border: 1px solid #1e293b !important; border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0,0,0,0.5) !important; padding: 0 !important; overflow: hidden; }
        .popup-custom .leaflet-popup-tip { background-color: #0f172a !important; border-top: 1px solid #1e293b !important; border-left: 1px solid #1e293b !important; }
        .popup-custom .leaflet-popup-content { margin: 0 !important; width: 280px !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 5px; }
      `}} />

      {/* 🖥️ Top Bar Header */}
      <header className="absolute top-0 left-0 right-0 h-[72px] bg-[#0b132b]/95 border-b border-[#1e293b] backdrop-blur-xl z-[80] flex items-center justify-between px-4 md:px-6 pointer-events-auto shadow-md">
        <div className="flex items-center space-x-4 md:space-x-6">
          <button onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)} className="md:hidden p-2 bg-[#1e293b] rounded-lg text-gray-300 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>

          <div className="flex items-center space-x-3 md:space-x-4">
            <div className="relative flex-shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-full shadow-[0_0_15px_rgba(56,189,248,0.4)] flex items-center justify-center bg-[#e5e7eb] p-[1.5px]">
              <img src="/Logogis3.png" alt="โลโก้เทศบาล" className="w-full h-full object-fill rounded-full" />
            </div>
            <div className="flex flex-col justify-center ml-2">
              <div className="hidden md:block">
                <h1 className="text-sm font-bold text-white">ระบบสารสนเทศทางภูมิศาสตร์เพื่อบริหารจัดการด้านสาธารณภัย</h1>
                <p className="text-xs text-blue-400">เทศบาลตำบลบ่อหลวง จ.เชียงใหม่ <span className="ml-2 text-gray-500 font-mono text-[10px] border border-gray-700 px-1 rounded">PUBLIC OPEN DATA</span></p>
              </div>
              <div className="block md:hidden">
                <h1 className="text-[13px] font-bold text-white leading-tight">ระบบ GIS boluang</h1>
              </div>
            </div>

            <div className="hidden lg:flex items-center space-x-6 border-l border-[#1e293b] pl-6">
              <div className="flex flex-col justify-center">
                <span className="text-[10px] text-gray-500 font-bold tracking-widest mb-0.5">สถานะระบบ</span>
                <div className="flex items-center text-[12px] font-mono text-gray-400">
                  <div className="flex items-center space-x-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-ping"></span><span className="text-[#10b981]">ONLINE</span></div>
                </div>
              </div>
              
              <div className="hidden xl:flex flex-1 items-center justify-center px-6">
                <div className="bg-[#0f172a]/60 border border-[#1e293b] rounded-full px-5 py-2 flex items-center space-x-4 shadow-sm backdrop-blur-sm">
                  <div className="flex items-center space-x-2">
                    <span className="text-[20px]">{headerWeather ? getWeatherEmoji(headerWeather.wCode) : '🌤️'}</span>
                    <span className="text-[16px] font-black text-white">{headerWeather ? Math.round(headerWeather.temp) : '--'}°C</span>
                  </div>
                  <div className="w-[1px] h-5 bg-[#1e293b]"></div>
                  <div className="flex flex-col w-[120px]">
                    <div className="flex items-center space-x-2">
                      {mounted ? (
                        <><span className="text-[#38bdf8] font-bold text-[13px] tracking-widest">{currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span><span className="text-gray-400 text-[11px] font-medium">{currentTime.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</span></>
                      ) : (<span className="text-gray-500 text-[11px] animate-pulse">กำลังซิงค์เวลา...</span>)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 md:space-x-3">          
          <button onClick={() => setShowQrModal(true)} className="hidden md:flex items-center bg-gradient-to-r from-blue-600 to-blue-500 border border-blue-400 rounded-full px-3 py-1.5 shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:scale-105 transition-all">
            <span className="text-[12px] font-bold text-white tracking-wide">📱 ติดตั้งแอป (PWA)</span>
          </button>
          <div onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className="flex items-center bg-[#0f172a]/80 border border-[#1e293b] rounded-full px-3 py-1.5 cursor-pointer">
            <span className="text-[11px] font-mono font-medium text-gray-300">GIS Layers</span>
          </div>
        </div>
      </header>      

      {/* 🧠 Sidebar ซ้าย (Data Honesty - สภาพอากาศ/น้ำ) */}
      <aside className={`absolute top-[80px] md:top-24 z-[70] transition-transform duration-500 ease-in-out flex pointer-events-auto ${isLeftPanelOpen ? 'translate-x-0 left-0 md:left-4' : 'translate-x-[-100%] left-0 md:left-4'}`}>
        <div className="w-[300px] md:w-[350px] bg-[#0b132b]/95 border border-[#1e293b] rounded-r-2xl md:rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] p-4 md:p-5 backdrop-blur-xl max-h-[calc(100vh-100px)] overflow-y-auto custom-scrollbar">
            
            <div className="mb-4 bg-[#0f172a] border border-[#1e293b] rounded-2xl p-4 cursor-pointer" onClick={() => window.open('/weather', '_blank')}>
              <h3 className="text-[15px] font-extrabold text-[#38bdf8]">ระบบตรวจสอบสภาพอากาศ</h3>
              <p className="text-[11px] text-gray-400 mt-1">อุณหภูมิและปริมาณฝน Micro-climate เฉพาะบ่อหลวง</p>
            </div>
            
            <div className="mb-4 bg-[#0f172a] border border-[#1e293b] rounded-2xl p-4 cursor-pointer" onClick={() => window.open('/flood', '_blank')}>
              <h3 className="text-[15px] font-extrabold text-[#60a5fa]">ระบบเฝ้าระวังน้ำท่วม</h3>
              <p className="text-[11px] text-gray-400 mt-1">ติดตามระดับน้ำลำห้วย แจ้งเตือนน้ำป่าไหลหลาก</p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[11px] text-[#38bdf8] font-bold">พยากรณ์และปริมาณฝน</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="พยากรณ์อากาศรายพื้นที่" source="ข้อมูล: Open-Meteo & TMD" active={tmdWeather} onClick={() => setTmdWeather(!tmdWeather)} dotColor="#38bdf8" apiStatus={apiStatus.tmd} />
                  <CustomToggleBox label="ฝนสะสม 24 ชม." source="สถานีตรวจวัดจริง สทนช." active={tmdRain} onClick={() => setTmdRain(!tmdRain)} dotColor="#facc15" apiStatus={apiStatus.tmd} />
                </div>
              </div>

              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[11px] text-gray-400 font-bold">คุณภาพอากาศ (AIR QUALITY)</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="ค่าฝุ่น PM2.5" source="ดาวเทียมวิเคราะห์ Open-Meteo" active={pm25} onClick={() => setPm25(!pm25)} dotColor="#06b6d4" apiStatus={apiStatus.pm25} />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[#1e293b]">
                <div className="flex items-center mb-2">
                  <span className="text-[11px] text-blue-400 font-bold">ข้อมูลแหล่งน้ำ (สทนช.)</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
                </div>
                <div className="space-y-1 bg-[#0f172a] p-3 rounded-xl border border-[#1e293b]">
                  <CustomToggleBox label="ระดับน้ำในพื้นที่" source="เซนเซอร์ สทนช." active={onwrWaterLevel} onClick={() => setOnwrWaterLevel(!onwrWaterLevel)} dotColor="#2563eb" apiStatus={apiStatus.onwrWater} />
                  <CustomToggleBox label="ปริมาณฝน 24 ชม." source="สถานี สทนช." active={onwrRain} onClick={() => setOnwrRain(!onwrRain)} dotColor="#3b82f6" apiStatus={apiStatus.onwrRain} />
                  
                  {/* ปุ่มไปยังหน้า Dashboard ของท่าน */}
                  <div className="flex items-center space-x-3 px-3 py-1.5 rounded-xl border border-[#1e293b] bg-[#0b132b]/50 hover:bg-[#1e293b]/80 transition-colors duration-200 cursor-pointer select-none mb-1 group" onClick={() => window.open('https://flood.nonarkara.org/BoLuang?city=%E0%B8%9A%E0%B9%88%E0%B8%AD%E0%B8%AB%E0%B8%A5%E0%B8%A7%E0%B8%87&tv=1', '_blank')}>
                    <div className="relative w-8 h-4 rounded-full bg-[#1e293b] flex items-center justify-center flex-shrink-0 border border-gray-600 group-hover:border-[#0ea5e9] transition-colors"><svg className="w-2.5 h-2.5 text-gray-400 group-hover:text-[#0ea5e9]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></div>
                    <div className="flex items-center space-x-2 flex-1"><div className="w-2.5 h-2.5 rounded-[3px] shadow-sm bg-[#0ea5e9]"></div><span className="text-[13px] font-medium text-gray-400 group-hover:text-white">สรุปรายงานน้ำท่วม (FloodDash)</span></div>
                  </div>
                </div>
              </div>       
            </div>
        </div>
        <button onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)} className="hidden md:flex absolute -right-[32px] top-6 w-[32px] h-16 bg-[#0b132b]/95 border-y border-r border-[#1e293b] rounded-r-xl items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer z-[80]"><svg className={`w-5 h-5 transform transition-transform duration-300 ${isLeftPanelOpen ? 'rotate-180' : 'rotate-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg></button>
      </aside>

      {/* Sidebar ขวา (Logic Hierarchy - ภัยพิบัติ/แผนที่) */}
      <aside className={`absolute top-[80px] md:top-24 right-0 z-[70] transition-transform duration-500 ease-in-out flex pointer-events-auto`} style={{ transform: isRightPanelOpen ? 'translateX(0)' : (isMobile ? 'translateX(100%)' : 'translateX(360px)') }}>
        <div className="relative md:mr-5 flex w-full md:w-auto">
          <button onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className="hidden md:flex absolute -left-[32px] top-4 w-[32px] h-14 bg-[#0b132b]/95 border-y border-l border-[#1e293b] rounded-l-lg items-center justify-center text-gray-400 hover:text-white transition-colors z-50 cursor-pointer"><svg className={`w-5 h-5 transform transition-transform duration-300 ${isRightPanelOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg></button>
          
          <div className="w-[300px] md:w-[360px] bg-[#0b132b]/95 border border-[#1e293b] rounded-l-2xl md:rounded-xl shadow-2xl p-4 md:p-5 backdrop-blur-xl max-h-[calc(100vh-100px)] overflow-y-auto custom-scrollbar flex flex-col">
            
            <div className="mb-4 bg-[#0f172a] p-1.5 rounded-xl border border-[#1e293b] flex">
              <input type="text" placeholder="ค้นหาหมู่บ้าน, ถนน..." className="w-full bg-transparent text-sm text-white px-3 py-1.5 outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <button className="bg-[#38bdf8] text-[#0b132b] px-3 rounded-lg font-bold"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></button>
            </div>

            <div className="space-y-4 flex-1">
              
              {/* รายงานประชาชน และ Open Data */}
              <div>
                <div className="bg-[#0b132b]/50 border border-[#1e293b] p-4 rounded-xl mb-4">
                  <button onClick={() => setShowScanModal(true)} className="w-full py-3 bg-gradient-to-r from-[#f43f5e] to-[#f59e0b] hover:brightness-110 rounded-xl text-[14px] font-bold text-white shadow-[0_4px_15px_rgba(244,63,94,0.4)] flex items-center justify-center space-x-2 transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 3h6m-3-3v6" /></svg><span>รายงานเหตุ / ปัญหาสิ่งแวดล้อม</span></button>
                </div>
                <button onClick={() => window.open('/admin/dashboard', '_blank')} className="w-full py-2.5 bg-[#0f172a] hover:bg-[#1e293b] border border-[#38bdf8]/50 rounded-xl text-[13px] font-bold text-[#38bdf8] flex items-center justify-center space-x-2 mb-4"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg><span>สรุปสถิติสถานการณ์ (Dashboard)</span></button>
              </div>

              <div className="border-t border-[#1e293b] pt-4">
                  <div className="flex items-center mb-2"><span className="text-[11px] text-gray-400 font-bold">CITIZEN REPORTS</span><div className="flex-1 border-t border-[#1e293b] ml-3"></div></div>
                  <CustomToggleBox label="จุดแจ้งเหตุจากประชาชน" source="ระบบรับแจ้งเหตุ" active={citizenReport} onClick={() => setCitizenReport(!citizenReport)} dotColor="#ef4444" />
              </div>

              {/* ⚠️ การจัด Logic แจ้งเตือนภัย (Hazard Logic) */}
              <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 p-3 rounded-xl mb-4">
                <div className="flex items-center mb-2">
                  <span className="text-[11px] text-[#fca5a5] font-bold tracking-widest">🚨 ภัยพิบัติ (HAZARDS)</span>
                  <div className="flex-1 border-t border-[#ef4444]/30 ml-3"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="จุดความร้อน/ไฟป่า" source="ดาวเทียม GISTDA" active={hotspot} onClick={() => setHotspot(!hotspot)} dotColor="#ea580c" />
                  <CustomToggleBox label="พื้นที่เสี่ยงดินถล่ม" source="ข้อมูลอ้างอิง: กรมทรัพยากรฯ" active={showLandslide} onClick={() => setShowLandslide(!showLandslide)} dotColor="#ef4444" />
                  <CustomToggleBox label="รอยเลื่อนแผ่นดินไหว" source="ข้อมูลอ้างอิง: กรมทรัพยากรธรณี" active={earthquakeLayer} onClick={() => setEarthquakeLayer(!earthquakeLayer)} dotColor="#c084fc" />
                </div>
              </div>

              {/* แผนที่และขอบเขตพื้นที่ (BASEMAP) */}
              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[11px] text-[#10b981] font-bold">แผนที่พื้นฐาน (BASEMAP)</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-3"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="จุดปลอดภัย / ศูนย์พักพิง" source="ข้อมูลเทศบาล" active={showSafeZone} onClick={() => setShowSafeZone(!showSafeZone)} dotColor="#10b981" />
                  <CustomToggleBox label="แผนที่ดาวเทียม" source="Google Maps" active={satelliteLayer} onClick={() => setSatelliteLayer(!satelliteLayer)} dotColor="#10b981" />
                  <CustomToggleBox label="ขอบเขตตำบลบ่อหลวง" active={showBoluang} onClick={() => setShowBoluang(!showBoluang)} dotColor="#38bdf8" />
                  <CustomToggleBox label="โซน 13 หมู่บ้าน" active={showBlock} onClick={() => setShowBlock(!showBlock)} dotColor="#fcd34d" />
                  
                  {/* ปุ่มที่ดินของท่านยังอยู่เหมือนเดิม */}
                  <div className="relative mt-2 pt-2 border-t border-[#1e293b]/50">
                     <CustomToggleBox label="แปลงที่ดินรายบุคคล" active={showParcel} onClick={() => setShowParcel(!showParcel)} dotColor="#4ade80" />
                     <span className="absolute right-3 top-4 text-[8px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">🔒 เจ้าหน้าที่</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 🛡️ บอร์ดความโปร่งใสของข้อมูล (Data Honesty Board) */}
            <div className="mt-6 p-3 bg-[#0f172a]/80 border border-[#1e293b] rounded-xl text-center shadow-inner">
                <p className="text-[10px] text-gray-500 font-mono leading-relaxed">
                    <b>ความโปร่งใสของข้อมูล (Data Honesty):</b><br/>ข้อมูลภัยพิบัติถูกดึงจาก API ของหน่วยงานรัฐแบบ Real-time ข้อมูลพื้นที่เสี่ยงเป็นเพียงการอ้างอิงทางภูมิศาสตร์ ไม่ใช่การทำนายล่วงหน้า
                </p>
            </div>

          </div>
        </div>
      </aside>

      {/* ควบคุมปุ่มแผนที่ */}
      <div className={`absolute top-[110px] z-[1000] flex flex-col space-y-2 transition-all duration-500 ease-in-out pointer-events-auto ${isLeftPanelOpen ? 'left-[315px] md:left-[390px]' : 'left-[15px] md:left-[50px]'}`}>
          <button onClick={(e) => { e.stopPropagation(); handleLocateMe(); }} className="w-[36px] h-[36px] bg-[#111827]/95 border border-[#334155] rounded-xl shadow-[0_4px_15px_rgba(0,0,0,0.5)] flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#1f2937] transition-all"><svg className="w-5 h-5 text-[#38bdf8]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v2m0 12v2m8-8h-2M6 12H4m14 0a6 6 0 11-12 0 6 6 0 0112 0z" /><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></svg></button>
          <div className="flex flex-col bg-[#111827]/95 border border-[#334155] rounded-xl shadow-[0_4px_15px_rgba(0,0,0,0.5)] overflow-hidden">
            <button onClick={(e) => { e.stopPropagation(); mapRef?.zoomIn(); }} className="w-[36px] h-[36px] flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#1f2937]"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v12m-6-6h12" /></svg></button>
            <div className="h-[1px] w-[20px] mx-auto bg-[#334155]"></div>
            <button onClick={(e) => { e.stopPropagation(); mapRef?.zoomOut(); }} className="w-[36px] h-[36px] flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#1f2937]"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg></button>
          </div>
      </div>

      <div className="absolute inset-0 z-0 bg-[#0b132b] overflow-hidden">
        <MapContainer center={[18.1633, 98.3744]} zoom={11} maxZoom={20} zoomControl={false} attributionControl={false} preferCanvas={true} className="w-full h-full z-0" ref={setMapRef}>
          {!satelliteLayer && <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={20} />}
          {satelliteLayer && <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} />}
          
          {userLocation && (<Marker position={[userLocation.lat, userLocation.lng]} icon={createUserLocationIcon()}><Popup className="popup-custom"><div className="p-3 bg-[#0f172a] text-center min-w-[180px]"><div className="text-[#38bdf8] font-bold text-[15px] mb-2 border-b border-[#1e293b] pb-2">📍 ตำแหน่งของคุณ</div><div className="text-gray-300 text-[13px] font-mono">Lat: {userLocation.lat.toFixed(6)}</div><div className="text-gray-300 text-[13px] font-mono">Lng: {userLocation.lng.toFixed(6)}</div></div></Popup></Marker>)}
          {showSafeZone && safeZonesData.map((sz, i) => (<Marker key={`safezone-${i}`} position={[sz.lat, sz.lng]} icon={createSafeZoneIcon()}><Popup className="popup-custom"><div className="p-3 bg-[#0f172a] min-w-[150px]"><div className="text-[#10b981] font-bold text-[14px] mb-1">🛡️ จุดปลอดภัย</div><div className="text-white text-[13px] font-semibold">{sz.name}</div></div></Popup></Marker>))}
          {showBoluang && geoBoluang && <GeoJSON data={geoBoluang} style={styleBoluang} />}
          {showBlock && geoBlock && <GeoJSON data={geoBlock} style={getBlockStyle} />}
          {showParcel && geoParcel && <GeoJSON data={geoParcel} style={styleParcel} />}
          {showLandslide && geoLandslide && <GeoJSON data={geoLandslide} style={styleLandslide} />}

          {tmdWeather && localWeatherData.map((prov, i) => (
              <Marker key={`prov-wx-${i}`} position={[prov.lat, prov.lng]} icon={createTmdIcon(prov.wCode)}>
                <Popup className="popup-custom">
                  <div>
                    <div className="bg-[#38bdf8] px-4 py-3 font-bold text-[#0f172a] text-[15px]">☁️ พยากรณ์อากาศ</div>
                    <div className="p-4 bg-[#0f172a]">
                      <div className="font-bold text-white mb-2">{prov.name}</div>
                      <div className="text-[13px] text-gray-300 space-y-1 mb-2"><div>อุณหภูมิ: <span className="text-[#38bdf8] font-bold">{prov.tempMin.toFixed(1)}° – {prov.tempMax.toFixed(2)}°C</span></div><div>สภาพ: {getWmoWeatherDesc(prov.wCode)}</div></div>
                      <div className="text-[10px] text-gray-500 font-mono border-t border-[#1e293b] pt-2 mt-2">แหล่งที่มา: TMD API</div>
                    </div>
                  </div>
                </Popup>
              </Marker>
          ))}

          {tmdRain && localWeatherData.map((prov, i) => {
              const style = getRainCircleStyle(prov.rainSum);
              return (
                <CircleMarker key={`rain-prov-${i}`} center={[prov.lat, prov.lng]} radius={style.radius} pathOptions={{ color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }}>
                  <Popup className="popup-custom">
                    <div>
                      <div className="bg-[#fcd34d] px-4 py-3 font-bold text-[#0f172a] text-[15px]">🌧️ ฝนสะสม 24 ชม.</div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="font-bold text-white mb-2">{prov.name}</div>
                        <div className="text-[15px] font-bold text-[#fcd34d] mb-2">{prov.rainSum.toFixed(1)} มม.</div>
                        <div className="text-[10px] text-gray-500 font-mono border-t border-[#1e293b] pt-2 mt-2">แหล่งที่มา: TMD API</div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
          })}

          {/* 🛡️ MAP POPUPS: แสดงแหล่งที่มาอย่างโปร่งใส */}
          {onwrRain && onwrRainData.map((station: any, i: number) => {
              const lat = parseFloat(station?.station?.tele_station_lat || station?.lat);
              const lng = parseFloat(station?.station?.tele_station_long || station?.lng);
              if (isNaN(lat) || isNaN(lng)) return null;
              const rainVal = parseFloat(station?.rain_24h) || 0;
              const style = getRainCircleStyle(rainVal);
              return (
                <CircleMarker key={`onwr-${i}`} center={[lat, lng]} radius={style.radius} pathOptions={style}>
                  <Popup className="popup-custom">
                    <div>
                      <div className="bg-[#3b82f6] px-4 py-2 font-bold text-white text-[14px]">🌧️ ปริมาณฝน 24 ชม.</div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="text-[13px] font-bold text-white mb-2">สถานี: {station?.station?.tele_station_name?.th || 'ไม่ทราบชื่อ'}</div>
                        <div className="text-[16px] text-[#3b82f6] font-bold mb-4">{rainVal.toFixed(1)} มม.</div>
                        <div className="text-[10px] text-gray-500 font-mono border-t border-[#1e293b] pt-2">
                          แหล่งที่มา: <b>สถานีตรวจวัดจริง สทนช.</b><br/>อัปเดต: สด (Real-time)
                        </div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
          })}

          {onwrWaterLevel && onwrWaterLevelData.map((station: any, i: number) => {
              const lat = parseFloat(station?.station?.tele_station_lat || station?.lat);
              const lng = parseFloat(station?.station?.tele_station_long || station?.lng);
              if (isNaN(lat) || isNaN(lng)) return null;
              const waterLevel = parseFloat(station?.waterlevel || station?.water_level || station?.waterlevel_msl || 0);
              return (
                <Marker key={`water-${i}`} position={[lat, lng]} icon={createWaterLevelIcon()}>
                  <Popup className="popup-custom">
                    <div>
                      <div className="bg-[#2563eb] px-4 py-2 font-bold text-white text-[14px]">🌊 ระดับน้ำ สทนช.</div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="text-[13px] font-bold text-white mb-2">สถานี: {station?.station?.tele_station_name?.th || 'ไม่ทราบชื่อ'}</div>
                        <div className="text-[16px] text-[#60a5fa] font-bold mb-4">{waterLevel.toFixed(2)} ม.รทก.</div>
                        <div className="text-[10px] text-gray-500 font-mono border-t border-[#1e293b] pt-2">แหล่งที่มา: เซนเซอร์วัดจริง สทนช.</div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
          })}

          {pm25 && localAirData.map((station, i) => {
              const { aqi, text, color } = getAirQualityDetails(station.pm25Val);
              return (
                <Marker key={`pm25-${i}`} position={[station.lat, station.lng]} icon={createPm25Icon(station.pm25Val)}>
                  <Popup className="popup-custom">
                    <div>
                      <div style={{ backgroundColor: color }} className="px-4 py-2 font-bold text-[#0f172a] text-[14px]">🌫️ ค่าฝุ่น PM2.5</div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="text-[13px] font-bold text-white mb-2">{station.name}</div>
                        <div className="text-[16px] font-bold mb-2" style={{ color: color }}>{station.pm25Val.toFixed(1)} µg/m³ (AQI: {aqi})</div>
                        <div className="text-[10px] text-gray-500 font-mono border-t border-[#1e293b] pt-2 mt-2">แหล่งที่มา: ดาวเทียม Open-Meteo</div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
          })}

          {citizenReport && disasterReports.map((report) => (
              <Marker key={`rep-${report.id}`} position={[report.latitude, report.longitude]} icon={createReportIcon()}>
                <Popup className="popup-custom">
                  <div>
                    <div className="bg-[#ef4444] px-4 py-2 font-bold text-white text-[14px]">🚨 แจ้งเหตุ: {report.risk_type}</div>
                    <div className="p-4 bg-[#0f172a]">
                      <div className="text-[12px] text-gray-300 mb-2">ความรุนแรง: <span className="bg-[#ef4444] px-1 rounded">{report.severity_level}</span></div>
                      <div className="text-[12px] text-white mb-4">{report.description}</div>
                      <div className="text-[10px] text-gray-500 font-mono border-t border-[#1e293b] pt-2 mt-2">แหล่งที่มา: ประชาชนในพื้นที่</div>
                    </div>
                  </div>
                </Popup>
              </Marker>
          ))}

          {hotspot && geoHotspot && geoHotspot.features && geoHotspot.features.map((feature: any, i: number) => {
              const geom = feature.geometry; if (!geom || geom.type !== 'Point') return null;
              const props = feature.properties || {};
              return (
                <Marker key={`hotspot-${i}`} position={[geom.coordinates[1], geom.coordinates[0]]} icon={createHotspotIcon()}>
                  <Popup className="popup-custom">
                    <div>
                      <div className="bg-[#ea580c] px-4 py-2 font-bold text-white text-[14px]">🔥 จุดความร้อน</div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="text-[13px] text-white mb-2">พื้นที่: {props.AREA_TYPE || props.area_type || 'ไม่ระบุ'}</div>
                        <div className="text-[10px] text-gray-500 font-mono border-t border-[#1e293b] pt-2 mt-2">แหล่งที่มา: ดาวเทียม GISTDA</div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
          })}

          {earthquakeLayer && geoEarthquake && geoEarthquake.features && geoEarthquake.features.map((feature: any, i: number) => {
              const geom = feature.geometry; if (!geom || geom.type !== 'Point') return null;
              const props = feature.properties || {};
              return (
                <Marker key={`quake-${i}`} position={[geom.coordinates[1], geom.coordinates[0]]} icon={createQuakeIcon()}>
                  <Popup className="popup-custom">
                    <div>
                      <div className="bg-[#c084fc] px-4 py-2 font-bold text-white text-[14px]">〰️ รอยเลื่อนแผ่นดินไหว</div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="text-[13px] font-bold text-[#c084fc] mb-2">{props.FAULT_NAME || props.area || 'ไม่ระบุ'}</div>
                        <div className="text-[12px] text-white mb-2">ความเสี่ยง: {props.RISK_LEVEL || 'ไม่ระบุ'}</div>
                        <div className="text-[10px] text-gray-500 font-mono border-t border-[#1e293b] pt-2 mt-2">แหล่งที่มา: กรมทรัพยากรธรณี</div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
          })}
        </MapContainer>
      </div>
      
      {/* Modal QR Code การติดตั้ง */}
      {showQrModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050b14]/80 backdrop-blur-md px-4 pointer-events-auto" onClick={() => setShowQrModal(false)}>
          <div className="bg-[#0b132b] border border-[#1e293b] rounded-3xl p-6 md:p-8 shadow-[0_0_50px_rgba(37,99,235,0.2)] max-w-sm w-full relative flex flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowQrModal(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-[#1e293b] rounded-full text-gray-400 hover:text-white hover:bg-red-500 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30"><svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg></div>
            <h3 className="text-xl font-bold text-white mb-2">ติดตั้งแอปลงมือถือ</h3>
            <p className="text-[13px] text-gray-400 mb-5 leading-relaxed">สแกนคิวอาร์โค้ดด้านล่าง เพื่อเปิดระบบในสมาร์ทโฟน</p>
            <div className="bg-white p-3 rounded-2xl shadow-inner mb-5 w-[180px] h-[180px] flex items-center justify-center"><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://boluang-disaster-gis.vercel.app/" alt="QR Code" className="w-full h-full object-contain" /></div>
            <button onClick={() => setShowQrModal(false)} className="w-full bg-[#1e293b] hover:bg-[#334155] text-white py-3 rounded-xl font-bold transition-colors border border-[#334155]">ปิดหน้าต่าง</button>
          </div>
        </div>
      )}
    </main>
  );
}
