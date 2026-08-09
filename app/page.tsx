'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js'; 
import Swal from 'sweetalert2';

// 🌟 ตั้งค่า Supabase 
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvtjjhvvtaswzhwhowlj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dGpqaHZ2dGFzd3pod2hvd2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDA3NjcsImV4cCI6MjA5MjExNjc2N30.Jjqi1LWgxEgpT2nBdjuNyoLxEP_VQcKf3GEbIYKPI8Y';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 🗺️ โหลด Leaflet แบบ Dynamic
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false });
const ZoomControl = dynamic(() => import('react-leaflet').then(mod => mod.ZoomControl), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(mod => mod.Tooltip), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// 💎 UI Component: Toggle อัจฉริยะ 
const CustomToggleBox = ({ label, active, onClick, dotColor = '#38bdf8', isRadio = false }: any) => {
  const [localActive, setLocalActive] = useState(active);
  useEffect(() => { setLocalActive(active); }, [active]);

  const handlePress = () => {
    setLocalActive(!localActive);
    setTimeout(() => { onClick(); }, 50);
  };

  return (
    <div 
      className="flex items-center space-x-3 px-3 py-1.5 rounded-xl border border-[#1e293b] bg-[#0b132b]/50 hover:bg-[#1e293b]/80 transition-colors duration-200 cursor-pointer select-none mb-1"
      onClick={handlePress}
    >
      {isRadio ? (
        <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${localActive ? 'border-[#38bdf8]' : 'border-gray-500'}`}>
          {localActive && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}
        </div>
      ) : (
        <div className={`relative w-8 h-4 rounded-full transition-colors duration-300 flex-shrink-0 ${localActive ? 'bg-[#38bdf8]' : 'bg-[#334155]'}`}>
          <div className={`absolute top-[2px] left-[2px] bg-white rounded-full h-3 w-3 transition-transform duration-300 shadow-sm ${localActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
        </div>
      )}
      <div className="flex items-center space-x-2 flex-1">
        {!isRadio && <div className="w-2.5 h-2.5 rounded-[3px] shadow-sm" style={{ backgroundColor: dotColor }}></div>}
        <span className={`text-[14px] font-medium transition-colors ${localActive ? 'text-white' : 'text-gray-400'}`}>{label}</span>
      </div>
    </div>
  );
};

// 🌤️ ฟังก์ชันสภาพอากาศ
const getWmoWeatherDesc = (code: number) => {
  const codes: Record<number, string> = {
    0: 'ท้องฟ้าแจ่มใส', 1: 'มีเมฆบางส่วน', 2: 'มีเมฆครึ้ม', 3: 'เมฆเป็นส่วนมาก',
    45: 'มีหมอก', 48: 'มีหมอกหนา', 51: 'ฝนปรอยๆ', 61: 'ฝนตกเล็กน้อย', 63: 'ฝนตกปานกลาง', 65: 'ฝนตกหนัก',
    80: 'ฝนตกเป็นหย่อมๆ', 95: 'พายุฝนฟ้าคะนอง'
  };
  return codes[code] || 'สภาพอากาศปกติ';
};
const getWeatherEmoji = (code: number) => {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '☀️';
};

const getAirQualityDetails = (pm25: number) => {
  let aqi = 0; let text = ''; let color = ''; let shadow = '';
  if (pm25 <= 15.0) {
    aqi = Math.round(pm25 * (25/15)); text = 'ดีมาก'; color = '#38bdf8'; shadow = 'rgba(56,189,248,0.5)';
  } else if (pm25 <= 25.0) {
    aqi = Math.round(26 + ((pm25-15.1) * (24/9.9))); text = 'ดี'; color = '#84cc16'; shadow = 'rgba(132,204,22,0.5)'; 
  } else if (pm25 <= 37.5) {
    aqi = Math.round(51 + ((pm25-25.1) * (49/12.4))); text = 'ปานกลาง'; color = '#facc15'; shadow = 'rgba(250,204,21,0.5)';
  } else if (pm25 <= 75.0) {
    aqi = Math.round(101 + ((pm25-37.6) * (99/37.4))); text = 'เริ่มมีผลกระทบ'; color = '#f97316'; shadow = 'rgba(249,115,22,0.5)';
  } else {
    aqi = Math.round(201 + ((pm25-75.1) * (99/250))); text = 'มีผลกระทบ'; color = '#ef4444'; shadow = 'rgba(239,68,68,0.5)';
  }
  if (aqi > 500) aqi = 500;
  return { aqi, text, color, shadow };
};

const thaiProvinces = [
  { name: 'กรุงเทพมหานคร', lat: 13.7563, lng: 100.5018 }, { name: 'สมุทรปราการ', lat: 13.5993, lng: 100.5968 },
  { name: 'นนทบุรี', lat: 13.8591, lng: 100.5217 }, { name: 'ปทุมธานี', lat: 14.0208, lng: 100.5250 },
  { name: 'พระนครศรีอยุธยา', lat: 14.3516, lng: 100.5774 }, { name: 'อ่างทอง', lat: 14.5896, lng: 100.4550 },
  { name: 'ลพบุรี', lat: 14.7995, lng: 100.6534 }, { name: 'สิงห์บุรี', lat: 14.8936, lng: 100.4015 },
  { name: 'ชัยนาท', lat: 15.1852, lng: 100.1251 }, { name: 'สระบุรี', lat: 14.5289, lng: 100.9101 },
  { name: 'ชลบุรี', lat: 13.3611, lng: 100.9847 }, { name: 'ระยอง', lat: 12.6814, lng: 101.2816 },
  { name: 'จันทบุรี', lat: 12.6113, lng: 102.1039 }, { name: 'ตราด', lat: 12.2428, lng: 102.5175 },
  { name: 'ฉะเชิงเทรา', lat: 13.6904, lng: 101.0718 }, { name: 'ปราจีนบุรี', lat: 14.0510, lng: 101.3726 },
  { name: 'นครนายก', lat: 14.2069, lng: 101.2131 }, { name: 'สระแก้ว', lat: 13.8240, lng: 102.0646 },
  { name: 'นครราชสีมา', lat: 14.9799, lng: 102.0978 }, { name: 'บุรีรัมย์', lat: 14.9930, lng: 103.1029 },
  { name: 'สุรินทร์', lat: 14.8818, lng: 103.4936 }, { name: 'ศรีสะเกษ', lat: 15.1186, lng: 104.3220 },
  { name: 'อุบลราชธานี', lat: 15.2448, lng: 104.8473 }, { name: 'ยโสธร', lat: 15.7926, lng: 104.1453 },
  { name: 'ชัยภูมิ', lat: 15.8066, lng: 102.0315 }, { name: 'อำนาจเจริญ', lat: 15.8597, lng: 104.6258 },
  { name: 'บึงกาฬ', lat: 18.3608, lng: 103.6456 }, { name: 'หนองบัวลำภู', lat: 17.2032, lng: 102.4390 },
  { name: 'ขอนแก่น', lat: 16.4322, lng: 102.8236 }, { name: 'อุดรธานี', lat: 17.4138, lng: 102.7872 },
  { name: 'เลย', lat: 17.4860, lng: 101.7223 }, { name: 'หนองคาย', lat: 17.8783, lng: 102.7420 },
  { name: 'มหาสารคาม', lat: 16.1848, lng: 103.3007 }, { name: 'ร้อยเอ็ด', lat: 16.0538, lng: 103.6520 },
  { name: 'กาฬสินธุ์', lat: 16.4328, lng: 103.5061 }, { name: 'สกลนคร', lat: 17.1664, lng: 104.1486 },
  { name: 'นครพนม', lat: 17.4048, lng: 104.7811 }, { name: 'มุกดาหาร', lat: 16.5443, lng: 104.7172 },
  { name: 'เชียงใหม่', lat: 18.7883, lng: 98.9853 }, { name: 'ลำพูน', lat: 18.5745, lng: 99.0087 },
  { name: 'ลำปาง', lat: 18.2888, lng: 99.4925 }, { name: 'อุตรดิตถ์', lat: 17.6201, lng: 100.0993 },
  { name: 'แพร่', lat: 18.1446, lng: 100.1403 }, { name: 'น่าน', lat: 18.7756, lng: 100.7730 },
  { name: 'พะเยา', lat: 19.1666, lng: 99.9022 }, { name: 'เชียงราย', lat: 19.9070, lng: 99.8325 },
  { name: 'แม่ฮ่องสอน', lat: 19.3020, lng: 97.9654 }, { name: 'นครสวรรค์', lat: 15.6987, lng: 100.1221 },
  { name: 'อุทัยธานี', lat: 15.3835, lng: 100.0246 }, { name: 'กำแพงเพชร', lat: 16.4828, lng: 99.5257 },
  { name: 'ตาก', lat: 16.8839, lng: 99.1258 }, { name: 'สุโขทัย', lat: 17.0053, lng: 99.8262 },
  { name: 'พิษณุโลก', lat: 16.8211, lng: 100.2659 }, { name: 'พิจิตร', lat: 16.4419, lng: 100.3488 },
  { name: 'เพชรบูรณ์', lat: 16.4206, lng: 101.1554 }, { name: 'ราชบุรี', lat: 13.5283, lng: 99.8128 },
  { name: 'กาญจนบุรี', lat: 14.0041, lng: 99.5328 }, { name: 'สุพรรณบุรี', lat: 14.4742, lng: 100.1123 },
  { name: 'นครปฐม', lat: 13.8140, lng: 100.0371 }, { name: 'สมุทรสาคร', lat: 13.5475, lng: 100.2736 },
  { name: 'สมุทรสงคราม', lat: 13.4102, lng: 100.0000 }, { name: 'เพชรบุรี', lat: 13.1121, lng: 99.9437 },
  { name: 'ประจวบคีรีขันธ์', lat: 11.8124, lng: 99.7975 }, { name: 'ชุมพร', lat: 10.4955, lng: 99.1777 },
  { name: 'ระนอง', lat: 9.9698, lng: 98.6355 }, { name: 'สุราษฎร์ธานี', lat: 9.1342, lng: 99.3334 },
  { name: 'พังงา', lat: 8.4501, lng: 98.5283 }, { name: 'ภูเก็ต', lat: 7.9519, lng: 98.3381 },
  { name: 'กระบี่', lat: 8.0586, lng: 98.9174 }, { name: 'นครศรีธรรมราช', lat: 8.4304, lng: 99.9631 },
  { name: 'ตรัง', lat: 7.5563, lng: 99.6114 }, { name: 'พัทลุง', lat: 7.6166, lng: 100.0776 },
  { name: 'สตูล', lat: 6.6121, lng: 100.0668 }, { name: 'สงขลา', lat: 7.1897, lng: 100.5954 },
  { name: 'ปัตตานี', lat: 6.8673, lng: 101.2501 }, { name: 'ยะลา', lat: 6.5411, lng: 101.2804 },
  { name: 'นราธิวาส', lat: 6.4255, lng: 101.8253 }
];

export default function BoLuangDashboard() {
  const [mounted, setMounted] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const coordsRef = useRef<HTMLSpanElement>(null);
  
  const [isMobile, setIsMobile] = useState(false);

  // 🎛️ State แผงควบคุม ซ้าย
  const [tmdWeather, setTmdWeather] = useState(false);
  const [tmdRain, setTmdRain] = useState(false);
  const [pm25, setPm25] = useState(false); 
  const [windyLayer, setWindyLayer] = useState(false); 
  const [windyType, setWindyType] = useState('rain'); 

  // 🎛️ State หมวดหมู่: ข้อมูลน้ำ (ThaiWater)
  const [onwrRain, setOnwrRain] = useState(false);
  const [onwrWaterLevel, setOnwrWaterLevel] = useState(false);

  // 🎛️ State แผงควบคุม ขวา
  const [satelliteLayer, setSatelliteLayer] = useState(false); 
  const [showBoluang, setShowBoluang] = useState(false);   
  const [showBlock, setShowBlock] = useState(false);        
  const [showParcel, setShowParcel] = useState(false);      
  const [citizenReport, setCitizenReport] = useState(false); 
  const [earthquakeLayer, setEarthquakeLayer] = useState(false);        
  const [hotspot, setHotspot] = useState(false);
  const [showLandslide, setShowLandslide] = useState(false);
  
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  
  const [showScanModal, setShowScanModal] = useState(false);

  const [provincialWeatherData, setProvincialWeatherData] = useState<any[]>([]); 
  const [nationalAirData, setNationalAirData] = useState<any[]>([]);
  const [disasterReports, setDisasterReports] = useState<any[]>([]); 
  
  // State เก็บข้อมูลจาก ThaiWater
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
  
  const initialCenter = { lat: 14.8700, lng: 100.9925, zoom: 6 };
  const [iframeState, setIframeState] = useState(initialCenter);
  const [transform, setTransform] = useState({ x: 0, y: 0 });
  const [currentZoom, setCurrentZoom] = useState(6);
  const syncData = useRef(initialCenter);

  const activeLayersCount = [satelliteLayer, showBoluang, showBlock, showParcel, citizenReport, earthquakeLayer, hotspot, showLandslide, onwrRain, onwrWaterLevel].filter(Boolean).length;

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

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768; 
      setIsMobile(mobile);
      if (mobile) {
        setIsLeftPanelOpen(false); 
        setIsRightPanelOpen(false); 
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
    if (typeof window !== 'undefined') setQrUrl(window.location.origin + '/report');

    const ts = Date.now(); 
    const loadGeoJSON = async (url: string, setter: any) => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          let data = await res.json();
          if (Array.isArray(data)) data = { type: "FeatureCollection", features: data };
          setter(data);
        }
      } catch (e) { console.error(e); }
    };

    loadGeoJSON(`/geojson/boluang.json?v=${ts}`, setGeoBoluang);
    loadGeoJSON(`/geojson/block.json?v=${ts}`, setGeoBlock); 
    loadGeoJSON(`/geojson/parcel.json?v=${ts}`, setGeoParcel);
    loadGeoJSON(`https://api.sphere.gistda.or.th/services/info/disaster-recurring?lon=98.3744&lat=18.1633&disaster_type=hotspot&key=AF9B1EEFF30042208F1DE95B579E7F90`, setGeoHotspot);
    loadGeoJSON(`/geojson/earthquake.geojson?v=${ts}`, setGeoEarthquake);
    loadGeoJSON(`/geojson/boluang_landslide_risk.json?v=${ts}`, setGeoLandslide);
  }, []);

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
      } catch (error) { console.warn('Error saving visit:', error); }

      try {
        const { count: totalCount } = await supabase.from('visitor_logs').select('*', { count: 'exact', head: true });
        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const { count: todayCount } = await supabase.from('visitor_logs').select('*', { count: 'exact', head: true }).gte('visited_at', today.toISOString());
        
        setVisitStats({ today: todayCount || 0, total: totalCount || 0 });
      } catch (error) { console.error('Error fetching visitor stats:', error); }
    };
    handleVisitorCount();
  }, [mounted]);

  // 🌟 พยากรณ์อากาศ 77 จังหวัด (TMD)
  useEffect(() => {
    if (!tmdWeather && !tmdRain) { setProvincialWeatherData([]); return; }
    const fetchProvincialWeather = async () => {
      try {
        const lats = thaiProvinces.map(p => p.lat.toFixed(4)).join(',');
        const lngs = thaiProvinces.map(p => p.lng.toFixed(4)).join(',');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weathercode&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FBangkok`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (Array.isArray(data)) {
          const formatted = thaiProvinces.map((prov, i) => ({
            ...prov,
            temp: data[i]?.current?.temperature_2m || 0,
            humidity: data[i]?.current?.relative_humidity_2m || 0,
            rain: data[i]?.current?.precipitation || 0, 
            rainSum: data[i]?.daily?.precipitation_sum?.[0] || 0,
            wind: (data[i]?.current?.wind_speed_10m / 3.6) || 0,
            wCode: data[i]?.current?.weathercode || 0,
            tempMin: data[i]?.daily?.temperature_2m_min?.[0] || 0,
            tempMax: data[i]?.daily?.temperature_2m_max?.[0] || 0,
          }));
          setProvincialWeatherData(formatted);
        }
      } catch (error) { console.error('Error fetching provincial weather:', error); }
    };
    fetchProvincialWeather();
  }, [tmdWeather, tmdRain]);

  // 🌟 ข้อมูลฝุ่น PM2.5 77 จังหวัด
  useEffect(() => {
    if (!pm25) { setNationalAirData([]); return; }
    const fetchNationalAir = async () => {
      try {
        const lats = thaiProvinces.map(s => s.lat.toFixed(4)).join(',');
        const lngs = thaiProvinces.map(s => s.lng.toFixed(4)).join(',');
        
        const [aqiRes, wxRes] = await Promise.all([
          fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lngs}&current=pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=Asia%2FBangkok`),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=weathercode&timezone=Asia%2FBangkok`)
        ]);
        const aqiData = await aqiRes.json();
        const wxData = await wxRes.json();
        
        if (Array.isArray(aqiData) && Array.isArray(wxData)) {
          const formatted = thaiProvinces.map((station, i) => ({
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
          setNationalAirData(formatted);
        }
      } catch (error) { console.error('Error fetching national PM2.5:', error); }
    };
    fetchNationalAir();
  }, [pm25]);

  // 🚀 💧 ดึงข้อมูลปริมาณฝน 24 ชม. (ดึงตรงจากหน้าบ้าน ไม่ผ่าน API Proxy เพื่อลดความหน่วง 5 วิ)
  useEffect(() => {
    if (!onwrRain) { setOnwrRainData([]); return; }
    const fetchOnwrRain = async () => {
      try {
        const res = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h');
        const json = await res.json();
        
        // ดักจับโครงสร้างเผื่อ ThaiWater เปลี่ยนแปลง
        let arrData = [];
        if (json && Array.isArray(json.data)) arrData = json.data;
        else if (json && json.data && Array.isArray(json.data.data)) arrData = json.data.data;
        
        setOnwrRainData(arrData);
      } catch (error) {
        console.error('Error fetching ONWR Rain:', error);
      }
    };
    fetchOnwrRain();
  }, [onwrRain]);

  // 🚀 💧 ดึงข้อมูลระดับน้ำ (ดึงตรงจากหน้าบ้าน + ดักจับโครงสร้างลึก)
  useEffect(() => {
    if (!onwrWaterLevel) { setOnwrWaterLevelData([]); return; }
    const fetchOnwrWaterLevel = async () => {
      try {
        const res = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
        const json = await res.json();
        
        // 🛠️ ปัญหาหมุดไม่ขึ้นเกิดจากตรงนี้! โครงสร้างของระดับน้ำมักจะซ้อนกันหลายชั้น
        let arrData = [];
        if (json && Array.isArray(json.data)) {
          arrData = json.data;
        } else if (json && json.data && Array.isArray(json.data.data)) {
          arrData = json.data.data;
        } else if (json && json.data && json.data.waterlevel_data && Array.isArray(json.data.waterlevel_data.data)) {
          // โครงสร้างที่เจอบ่อยที่สุดใน API ระดับน้ำ สทนช.
          arrData = json.data.waterlevel_data.data;
        }
        
        setOnwrWaterLevelData(arrData);
      } catch (error) {
        console.error('Error fetching ONWR Water Level:', error);
      }
    };
    fetchOnwrWaterLevel();
  }, [onwrWaterLevel]);

  // 🌟 ดึงข้อมูลแจ้งเหตุจาก Supabase 
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
      } catch (error) { console.error('Error fetching disaster reports:', error); }
    };
    fetchReports();
  }, [citizenReport]);

  useEffect(() => {
    if (mapRef && (showBoluang || showBlock)) {
      mapRef.flyTo([18.1633, 98.3744], 12, { duration: 2.5, easeLinearity: 0.25 });
    }
  }, [showBoluang, showBlock, mapRef]);

  const BLOCK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#14b8a6', '#0ea5e9'];
  const getVillageColor = (feature: any) => {
    const props = feature?.properties || {};
    const nameStr = String(props.own_villag || props.name_th || props.name || props.zone_name || props.id || "0");
    const colorIndex = nameStr.length % BLOCK_COLORS.length;
    return props.fill || BLOCK_COLORS[colorIndex];
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
        if (targetLayer.bringToFront) targetLayer.bringToFront(); 
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

  const styleBoluang = { color: '#0ea5e9', weight: 3, fillOpacity: 0, interactive: false }; 
  const styleParcel = { color: '#4ade80', fillColor: '#4ade80', weight: 1, fillOpacity: 0.2 }; 
  const styleLandslide = { color: '#ef4444', fillColor: '#ef4444', weight: 1.5, fillOpacity: 0.35, dashArray: '4, 4' };

  useEffect(() => {
    if (!mapRef) return;
    const updateSyncData = () => {
      const center = mapRef.getCenter(); const zoom = mapRef.getZoom();
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
      if (coordsRef.current) {
        coordsRef.current.innerText = `${e.latlng.lat.toFixed(4)}°N ${e.latlng.lng.toFixed(4)}°E`;
      }
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

  const windyMapUrl = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km/h&zoom=${iframeState.zoom}&overlay=${windyType}&product=ecmwf&level=surface&lat=${iframeState.lat}&lon=${iframeState.lng}&detailLat=${iframeState.lat}&detailLon=${iframeState.lng}&marker=false`;

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  
  const createTmdIcon = useMemo(() => {
    if (!L) return () => null;
    return (wCode: number) => {
      const emoji = getWeatherEmoji(wCode);
      const html = `
        <div class="flex items-center justify-center w-[36px] h-[36px] bg-[#0f172a] border-[2px] border-[#38bdf8] rounded-full shadow-[0_0_15px_rgba(56,189,248,0.5)] transition-transform hover:scale-110">
          <span class="text-[18px] drop-shadow-md">${emoji}</span>
        </div>
      `;
      return L.divIcon({ className: 'bg-transparent border-none', html, iconSize: [36, 36], iconAnchor: [18, 18] });
    };
  }, [L]);

  const createPm25Icon = useMemo(() => {
    if (!L) return () => null;
    return (pmVal: number) => {
      const { color, shadow } = getAirQualityDetails(pmVal);
      const html = `
        <div class="relative flex flex-col items-center justify-center w-[48px] h-[48px] bg-[#0f172a]/95 border-[2px] rounded-xl backdrop-blur-md transition-transform hover:scale-110 z-10" style="border-color: ${color}; box-shadow: 0 0 15px ${shadow};">
          <span class="text-white font-bold text-[15px] leading-none mt-1 z-0">${pmVal.toFixed(1)}</span>
          <span class="text-[10px] font-bold mt-1.5 z-0 tracking-widest" style="color: ${color};">PM2.5</span>
        </div>
      `;
      return L.divIcon({ className: 'bg-transparent border-none', html, iconSize: [48, 48], iconAnchor: [24, 24] });
    };
  }, [L]);

  const createReportIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({
      className: 'bg-transparent border-none',
      html: `
        <div class="relative flex items-center justify-center w-10 h-10">
          <div class="absolute inset-0 bg-[#ef4444] rounded-full blur-[8px] opacity-60 animate-pulse"></div>
          <div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#ef4444] rounded-full shadow-[0_0_15px_rgba(239,68,68,0.9)] z-10">
            <span class="text-[#ef4444] text-[14px]">🚨</span>
          </div>
        </div>
      `,
      iconSize: [40, 40], iconAnchor: [20, 20]
    });
  }, [L]);

  const createHotspotIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({
      className: 'bg-transparent border-none',
      html: `
        <div class="relative flex items-center justify-center w-10 h-10">
          <div class="absolute inset-0 bg-[#ea580c] rounded-full blur-[8px] opacity-60"></div>
          <div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#ea580c] rounded-full shadow-[0_0_15px_rgba(234,88,12,0.9)] z-10">
            <span class="text-[#ea580c] text-[14px]">🔥</span>
          </div>
        </div>
      `,
      iconSize: [40, 40], iconAnchor: [20, 20]
    });
  }, [L]);

  const createQuakeIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({
      className: 'bg-transparent border-none',
      html: `
        <div class="relative flex items-center justify-center w-10 h-10">
          <div class="absolute inset-0 bg-[#c084fc] rounded-full blur-[8px] opacity-50"></div>
          <div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#c084fc] rounded-full shadow-[0_0_15px_rgba(192,132,252,0.9)] z-10">
            <span class="text-[#c084fc] text-[14px] font-bold">〰</span>
          </div>
        </div>
      `,
      iconSize: [40, 40], iconAnchor: [20, 20]
    });
  }, [L]);

  // 💧 ไอคอนสำหรับระดับน้ำ (ThaiWater)
  const createWaterLevelIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({
      className: 'bg-transparent border-none',
      html: `
        <div class="relative flex items-center justify-center w-[36px] h-[36px] bg-[#0f172a] border-[2px] border-[#3b82f6] rounded-full shadow-[0_0_15px_rgba(59,130,246,0.6)] transition-transform hover:scale-110">
          <span class="text-[16px] drop-shadow-md">🌊</span>
        </div>
      `,
      iconSize: [36, 36], iconAnchor: [18, 18]
    });
  }, [L]);

  return (
    <main className="relative w-screen h-screen bg-[#0b132b] font-sans text-white overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: transparent !important; cursor: crosshair !important; }
        .leaflet-top.leaflet-left { top: 90px !important; left: 10px !important; }
        @media (min-width: 768px) {
          .leaflet-top.leaflet-left { top: 90px !important; left: 370px !important; }
        }
        .leaflet-bar a { background-color: #0f172a !important; color: #fff !important; border: 1px solid #1e293b !important; border-radius: 8px !important; }
        .leaflet-bar a:hover { background-color: #1e293b !important; }
        .leaflet-div-icon { background: transparent !important; border: none !important; }
        .leaflet-tooltip { pointer-events: none !important; }
        
        .leaflet-tooltip.village-hover-tooltip { 
          background-color: #ffffff !important; color: #0f172a !important; border: 1px solid #cbd5e1 !important; 
          font-family: inherit !important; font-size: 14px !important; font-weight: 600 !important; 
          padding: 6px 14px !important; border-radius: 6px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important; 
        }

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

        /* 💧 Popup สำหรับ ThaiWater */
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

      {isMobile && (isLeftPanelOpen || isRightPanelOpen) && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          onClick={() => { setIsLeftPanelOpen(false); setIsRightPanelOpen(false); }}
        />
      )}

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

      <div className="absolute inset-0 z-0 bg-[#0b132b] overflow-hidden">
        {windyLayer && (
          <div 
            className="absolute pointer-events-none transition-opacity duration-700 opacity-100 saturate-150"
            style={{ top: '-100vh', left: '-100vw', width: '300vw', height: '300vh', transform: `translate(${transform.x}px, ${transform.y}px)`, willChange: 'transform', zIndex: 0 }}
          >
            <iframe width="100%" height="100%" frameBorder="0" src={windyMapUrl} />
          </div>
        )}

        <div className="absolute inset-0 pointer-events-auto" style={{ zIndex: 10 }}>
          <MapContainer center={[14.8700, 100.9925]} zoom={isMobile ? 5 : 6} maxZoom={20} zoomControl={false} attributionControl={false} className="w-full h-full" ref={setMapRef}>
            <ZoomControl position="topleft" />
            {!windyLayer && !satelliteLayer && <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={20} />}
            {!windyLayer && satelliteLayer && <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} />}
            
            {showBoluang && geoBoluang && <GeoJSON key="boluang-layer" data={geoBoluang} style={styleBoluang} />}
            {showBlock && geoBlock && <GeoJSON key="block-layer" data={geoBlock} style={getBlockStyle} onEachFeature={onEachBlockFeature} />}
            {showParcel && geoParcel && <GeoJSON key="parcel-layer" data={geoParcel} style={styleParcel} />}
            
            {showLandslide && geoLandslide && (
              <GeoJSON 
                key="landslide-layer" 
                data={geoLandslide} 
                style={styleLandslide} 
                onEachFeature={(feature: any, layer: any) => {
                  const props = feature.properties || {};
                  const riskLevel = props.risk || props.Risk || props.RISK_LEVEL || 'พื้นที่เสี่ยงดินถล่ม';
                  layer.bindTooltip(`⚠️ ระดับความเสี่ยง: ${riskLevel}`, { sticky: true, direction: 'auto', className: 'village-hover-tooltip' });
                }} 
              />
            )}

            {/* 🌟 หมุดพยากรณ์อากาศ 77 จังหวัด (TMD) */}
            {tmdWeather && provincialWeatherData.map((prov, i) => {
              const areaName = prov.name === 'กรุงเทพมหานคร' ? prov.name : `อ.เมือง${prov.name}, ${prov.name}`;
              return (
                <Marker key={`prov-wx-${i}`} position={[prov.lat, prov.lng]} icon={createTmdIcon(prov.wCode)}>
                  <Popup className="popup-tmd-weather">
                    <div>
                      <div className="bg-[#38bdf8] px-4 py-3 font-bold text-[#0f172a] text-[15px] flex items-center shadow-sm">
                        <span className="mr-2 text-[18px]">☁️</span> พยากรณ์อากาศ
                      </div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="text-[14px] font-bold text-white mb-3 pb-2 border-b border-[#1e293b]">
                          พื้นที่: {areaName}
                        </div>
                        <div className="text-[13px] text-gray-300 space-y-2 font-medium mb-4">
                          <div>สภาพอากาศ: <span className="text-white">{getWmoWeatherDesc(prov.wCode)}</span></div>
                          <div>อุณหภูมิ: <span className="text-[#38bdf8] font-bold text-[15px]">{prov.tempMin.toFixed(1)}° – {prov.tempMax.toFixed(2)}°C</span></div>
                          <div>ฝน: <span className="text-white">{prov.rain} มม.</span></div>
                          <div>ความชื้น: <span className="text-white">{prov.humidity}%</span></div>
                          <div>ลม: <span className="text-white">{prov.wind.toFixed(2)} ม./วินาที</span></div>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono text-left pt-3 border-t border-[#1e293b]">
                          ข้อมูลจาก TMD API · {new Date().toISOString().split('T')[0]}T00:00:00+07:00
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* 🌟 หมุดปริมาณน้ำฝนสะสม 77 จังหวัด (TMD) */}
            {tmdRain && provincialWeatherData.map((prov, i) => {
              const style = getRainCircleStyle(prov.rainSum);
              const areaName = prov.name === 'กรุงเทพมหานคร' ? prov.name : `อ.เมือง${prov.name}, ${prov.name}`;
              return (
                <CircleMarker key={`rain-prov-${i}`} center={[prov.lat, prov.lng]} radius={style.radius} pathOptions={{ color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }}>
                  <Popup className="popup-tmd-rain">
                    <div>
                      <div className="bg-[#fcd34d] px-4 py-3 font-bold text-[#0f172a] text-[15px] flex items-center shadow-sm">
                        <span className="mr-2 text-[18px]">🌧️</span> ปริมาณน้ำฝนสะสม
                      </div>
                      <div className="p-4 bg-[#0f172a]">
                        <div className="text-[14px] font-bold text-white mb-3 pb-2 border-b border-[#1e293b]">
                          พื้นที่: {areaName}
                        </div>
                        <div className="text-[13px] text-gray-300 space-y-2 font-medium mb-4">
                          <div>ฝนสะสม: <span className="text-[#fcd34d] font-bold text-[15px]">{prov.rainSum.toFixed(1)} มม.</span></div>
                          <div>ขนาดจุด: <span className="text-white">{style.radius.toFixed(1)} px</span></div>
                          <div>สภาพอากาศ: <span className="text-white">{getWmoWeatherDesc(prov.wCode)}</span></div>
                          <div>อุณหภูมิ: <span className="text-white">{prov.tempMin.toFixed(2)}° – {prov.tempMax.toFixed(2)}°C</span></div>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono text-left pt-3 border-t border-[#1e293b] leading-relaxed">
                          ข้อมูลจาก TMD API · {new Date().toISOString().split('T')[0]}T00:00:00+07:00<br/>
                          <span className="text-gray-600">- ปรับขนาดจุดตามฝนสะสม</span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {/* 💧 หมุดปริมาณฝน 24 ชม. จากสถานีจริง (ThaiWater ONWR) */}
            {onwrRain && onwrRainData.map((station: any, i: number) => {
              if (!station.station || !station.station.tele_station_lat || !station.station.tele_station_long) return null;
              const lat = parseFloat(station.station.tele_station_lat);
              const lng = parseFloat(station.station.tele_station_long);
              const rainVal = parseFloat(station.rain_24h) || 0;
              const style = getRainCircleStyle(rainVal);
              const stationName = station.station.tele_station_name?.th || station.station.tele_station_name || 'ไม่ทราบชื่อสถานี';
              
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
                          <div>จังหวัด: <span className="text-white">{station.station.province_name?.th || '-'}</span></div>
                          <div>ปริมาณฝน: <span className="text-[#3b82f6] font-bold text-[16px]">{rainVal.toFixed(1)} มม.</span></div>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono text-left pt-3 border-t border-[#1e293b] leading-relaxed">
                          ข้อมูลจาก สทนช. (ThaiWater)<br/>
                          Station ID: {station.station.tele_station_id}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {/* 🚀 💧 แก้ไขปัญหาหมุดระดับน้ำหาย (รองรับการตั้งชื่อ Key ที่หลากหลายของ สทนช.) */}
            {onwrWaterLevel && onwrWaterLevelData.map((station: any, i: number) => {
              if (!station.station || !station.station.tele_station_lat || !station.station.tele_station_long) return null;
              const lat = parseFloat(station.station.tele_station_lat);
              const lng = parseFloat(station.station.tele_station_long);
              
              // 🛠️ สทนช. บางครั้งใช้คำว่า waterlevel, บางครั้งใช้ water_level เราเลยต้องดักจับให้หมด
              const waterLevel = parseFloat(station.waterlevel || station.water_level || station.waterlevel_msl) || 0;
              
              const stationName = station.station.tele_station_name?.th || station.station.tele_station_name || 'ไม่ทราบชื่อสถานี';
              const discharge = station.discharge || station.discharge_rate ? `${station.discharge || station.discharge_rate} ลบ.ม./วินาที` : 'ไม่มีข้อมูล';
              const time = station.waterlevel_datetime || station.water_level_datetime || '-';
              
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
                          <div>ลุ่มน้ำ: <span className="text-white">{station.station.basin?.basin_name?.th || '-'}</span></div>
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

            {/* 🌟 หมุดค่าฝุ่น PM2.5 */}
            {pm25 && nationalAirData.map((station, i) => {
              const { aqi, text, color } = getAirQualityDetails(station.pm25Val);
              const formattedTime = new Date(station.time).toISOString().replace('T', ' ').substring(0, 16);
              const stationId = `TH-${(i + 1).toString().padStart(3, '0')}`;
              
              const areaStr = station.name === 'กรุงเทพมหานคร' 
                ? station.name 
                : (station.name === 'เชียงใหม่' ? `ต.ช้างเผือก อ.เมือง, ${station.name}` : `อ.เมือง, ${station.name}`);
              
              return (
                <Marker key={`national-pm25-${i}`} position={[station.lat, station.lng]} icon={createPm25Icon(station.pm25Val)}>
                  <Popup className="popup-pm25-custom">
                    <div className="flex flex-col">
                      <div style={{ backgroundColor: color }} className="px-4 py-3 font-bold text-[#0f172a] text-[15px] flex items-center shadow-sm rounded-t-lg relative">
                        <span className="mr-2 text-[18px]">🌫️</span> ค่าฝุ่น PM2.5 / AQI
                      </div>
                      
                      <div className="p-4 bg-[#0b132b] text-[14px] text-gray-200 font-medium rounded-b-lg">
                        <div className="font-bold text-white mb-1">สถานี: ศูนย์ราชการจังหวัด{station.name}</div>
                        <div className="font-bold text-white mb-3">พื้นที่: {areaStr}</div>
                        
                        <div className="border-t border-[#1e293b] my-3"></div>

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

            {/* 🌟 แสดงหมุดแจ้งเหตุจาก Supabase บนแผนที่ */}
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

                      <div className="border-t border-[#1e293b] pt-3 mt-3 text-[11px] text-gray-500 font-mono text-right">
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
                          Layer: hotspot.geojson
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

      <header className="absolute top-0 left-0 right-0 h-[72px] bg-[#0b132b]/95 border-b border-[#1e293b] backdrop-blur-xl z-[80] flex items-center justify-between px-4 md:px-6 pointer-events-auto shadow-md">
        <div className="flex items-center space-x-4 md:space-x-6">
          <button onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)} className="md:hidden p-2 bg-[#1e293b] rounded-lg text-gray-300 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>

          <div className="flex items-center space-x-3 md:space-x-4">
            <div className="flex space-x-2">
              <div className="w-8 h-8 md:w-9 md:h-9 bg-[#38bdf8]/20 rounded-full border border-[#38bdf8]/50 flex items-center justify-center text-[11px] md:text-[12px] font-bold text-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.3)]">BL</div>
            </div>
            <div className="flex flex-col border-l-2 border-[#1e293b] pl-3 md:pl-4">
              <h1 className="text-[12px] md:text-[15px] font-bold tracking-wide text-white leading-tight">ระบบสารสนเทศภูมิศาสตร์</h1>
              <h2 className="text-[11px] md:text-[15px] font-bold tracking-wide text-[#38bdf8] leading-tight mt-0.5">ต.บ่อหลวง</h2>
            </div>
          </div>

          <div className="hidden lg:flex flex-col border-l border-[#1e293b] pl-6 justify-center">
            <span className="text-[10px] text-gray-500 font-bold tracking-widest mb-0.5">สถิติผู้เข้าชม</span>
            <div className="flex items-center text-[12px] font-mono text-gray-400">
              <div className="flex items-center space-x-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10b981]"></span>
                </span>
                <span>วันนี้: <span className="text-[#10b981]">{visitStats.today.toLocaleString()}</span></span>
              </div>
              <span className="mx-2 text-gray-600">|</span>
              <div className="flex items-center space-x-1.5">
                <span>รวม: <span className="text-[#38bdf8]">{visitStats.total.toLocaleString()}</span></span>
              </div>
            </div>
          </div>
        </div>

        <div onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className="flex items-center bg-[#0f172a]/80 border border-[#1e293b] rounded-full px-3 py-1.5 md:px-4 md:py-1.5 shadow-sm transition-all hover:bg-[#1e293b] cursor-pointer">
          <svg className="w-4 h-4 text-[#2dd4bf] mr-1.5 md:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
          <span className="text-[11px] md:text-[13px] font-mono font-medium text-gray-300 tracking-wide">
            Layers <span className="hidden md:inline text-gray-500 mx-1">· Boluang</span>
          </span>
        </div>
      </header>

      <aside className={`absolute top-[80px] md:top-24 z-[70] w-[300px] md:w-[350px] bg-[#0b132b]/95 border border-[#1e293b] rounded-r-2xl md:rounded-2xl shadow-2xl p-4 md:p-5 backdrop-blur-xl pointer-events-auto max-h-[calc(100vh-100px)] overflow-y-auto custom-scrollbar transition-transform duration-500 ease-in-out ${isLeftPanelOpen ? 'translate-x-0 left-0 md:left-4' : '-translate-x-full left-0 md:left-4'}`}>
        <div className="mb-4 flex flex-col items-start border-b border-[#1e293b] pb-3 relative">
          <button onClick={() => setIsLeftPanelOpen(false)} className="md:hidden absolute top-0 right-0 text-gray-500 hover:text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          <div className="flex items-center space-x-3 mb-2">
            <div className="bg-gradient-to-br from-[#38bdf8] to-[#2563eb] p-2 rounded-xl shadow-[0_4px_10px_rgba(37,99,235,0.4)]">
              <span className="text-white text-[18px]">🌧️</span>
            </div>
            <h2 className="text-[18px] md:text-[22px] font-serif font-bold tracking-wide text-[#7dd3fc]">Weather & Air</h2>
          </div>
          <p className="text-[11px] md:text-[12px] text-gray-400 mt-1 leading-relaxed pr-6">ชั้นข้อมูลด้านซ้ายสำหรับพยากรณ์อากาศและปริมาณน้ำฝน</p>
        </div>

        <div className="space-y-4">
          
          <div>
            <div className="flex items-center mb-2">
              <span className="text-[13px] mr-2">💧</span>
              <span className="text-[10px] md:text-[11px] text-[#3b82f6] tracking-widest font-bold">HYDRO & FLOOD (สทนช.)</span>
              <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
            </div>
            <div className="space-y-1 bg-[#0f172a] p-3 rounded-xl border border-[#1e293b]">
              <CustomToggleBox label="ระดับน้ำ (ONWR)" active={onwrWaterLevel} onClick={() => setOnwrWaterLevel(!onwrWaterLevel)} dotColor="#2563eb" />
              <CustomToggleBox label="ปริมาณฝน 24 ชม. (ONWR)" active={onwrRain} onClick={() => setOnwrRain(!onwrRain)} dotColor="#3b82f6" />
            </div>
          </div>

          <div>
            <div className="flex items-center mb-2">
              <span className="text-[13px] mr-2">🌦️</span>
              <span className="text-[10px] md:text-[11px] text-gray-400 tracking-widest font-bold">WEATHER API</span>
              <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
            </div>
            <div className="space-y-1">
              <CustomToggleBox label="พยากรณ์อากาศ 77 จ. (TMD)" active={tmdWeather} onClick={() => setTmdWeather(!tmdWeather)} dotColor="#38bdf8" />
              <CustomToggleBox label="ปริมาณฝนสะสม (TMD)" active={tmdRain} onClick={() => setTmdRain(!tmdRain)} dotColor="#facc15" />
            </div>
          </div>

          <div>
            <div className="flex items-center mb-2">
              <span className="text-[13px] mr-2">🌫️</span>
              <span className="text-[10px] md:text-[11px] text-gray-400 tracking-widest font-bold">AIR QUALITY</span>
              <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
            </div>
            <div>
              <CustomToggleBox label="ค่าฝุ่น PM2.5 / AQI" active={pm25} onClick={() => setPm25(!pm25)} dotColor="#06b6d4" />
            </div>
          </div>

          <div>
            <div className="flex items-center mb-2">
              <span className="text-[13px] mr-2">🗺️</span>
              <span className="text-[10px] md:text-[11px] text-gray-400 tracking-widest font-bold">WINDY MAP</span>
              <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
            </div>
            <div className="mb-3">
              <CustomToggleBox label="เปิด/ปิดข้อมูล Windy" active={windyLayer} onClick={() => setWindyLayer(!windyLayer)} dotColor="#facc15" />
            </div>
            {windyLayer && (
              <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-3 md:p-4 shadow-inner">
                <div className="flex items-center space-x-2 mb-3"><span className="text-[13px] font-bold text-gray-200">🌧️ ข้อมูล Windy</span></div>
                <div className="space-y-1">
                  <CustomToggleBox label="ลม (Wind)" active={windyType === 'wind'} onClick={() => setWindyType('wind')} isRadio={true} />
                  <CustomToggleBox label="อุณหภูมิ (Temperature)" active={windyType === 'temp'} onClick={() => setWindyType('temp')} isRadio={true} />
                  <CustomToggleBox label="ฝนและฟ้าผ่า (Rain)" active={windyType === 'rain'} onClick={() => setWindyType('rain')} isRadio={true} />
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 🌟 แถบ Credit */}
      <div className="hidden md:flex absolute bottom-4 left-4 z-[60] flex-wrap gap-2 pointer-events-auto max-w-[60%]">
        <div className="bg-[#0b132b]/80 backdrop-blur-md border border-[#1e293b] rounded-full px-3 py-1.5 shadow-sm text-[11px] font-mono text-gray-400">
          Base map: Windy Weather + Dark Matter
        </div>
        <div className="bg-[#0b132b]/80 backdrop-blur-md border border-[#1e293b] rounded-full px-3 py-1.5 shadow-sm text-[11px] font-mono text-[#38bdf8]">
          <span ref={coordsRef}>14.8700°N 100.9925°E</span>
        </div>
      </div>

      <div className="hidden md:flex absolute bottom-4 right-1/2 translate-x-1/2 z-[60] pointer-events-auto">
        <div className="bg-[#0b132b]/80 backdrop-blur-md border border-[#1e293b] rounded-full px-3 py-1.5 shadow-sm text-[11px] font-mono text-gray-400 flex items-center space-x-1.5">
          <span className="text-[#38bdf8]">💨</span>
          <span>Data: Windy | TMD | ThaiWater ONWR</span>
        </div>
      </div>

      <div className="absolute bottom-0 right-0 z-[60] bg-white/70 backdrop-blur-sm px-2 py-0.5 text-[10px] md:text-[11px] text-gray-800 pointer-events-auto">
        <a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Leaflet</a> | &copy; OSM
      </div>

      {/* 🌟 แผงควบคุม ขวา */}
      <aside className={`absolute top-[80px] md:top-24 right-0 z-[70] transition-transform duration-500 ease-in-out flex pointer-events-auto`} style={{ transform: isRightPanelOpen ? 'translateX(0)' : (isMobile ? 'translateX(100%)' : 'translateX(360px)') }}>
        <div className="relative md:mr-5 flex w-full md:w-auto">
          <button onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className="hidden md:flex absolute -left-[32px] top-4 w-[32px] h-14 bg-[#0b132b]/95 border-y border-l border-[#1e293b] rounded-l-lg items-center justify-center text-gray-400 hover:text-white hover:bg-[#1e293b] transition-colors shadow-[-4px_0_10px_rgba(0,0,0,0.3)] backdrop-blur-md z-50 cursor-pointer">
            <svg className={`w-5 h-5 transform transition-transform duration-300 ${isRightPanelOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
          
          <div className="w-[300px] md:w-[360px] ml-auto bg-[#0b132b]/95 border border-[#1e293b] rounded-l-2xl md:rounded-xl shadow-2xl p-4 md:p-5 backdrop-blur-xl max-h-[calc(100vh-100px)] overflow-y-auto custom-scrollbar">
            
            <div className="mb-4 flex flex-col items-start border-b border-[#1e293b] pb-3 relative">
              <button onClick={() => setIsRightPanelOpen(false)} className="md:hidden absolute top-0 right-0 text-gray-500 hover:text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              
              <div className="flex items-center space-x-3 mb-2">
                <div className="bg-gradient-to-br from-[#2dd4bf] to-[#3b82f6] p-2 rounded-xl shadow-[0_4px_10px_rgba(45,212,191,0.3)]">
                  <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h7" /></svg>
                </div>
                <h2 className="text-[18px] md:text-[22px] font-serif font-bold tracking-wide text-[#7dd3fc]">Layers</h2>
              </div>
              <p className="text-[11px] md:text-[12px] text-gray-400 mt-1 leading-relaxed pr-6">แผงควบคุมชั้นข้อมูลหลักด้านขวา</p>
              
              <div className="flex items-center space-x-3 mt-3">
                <div className="flex items-center px-2 py-1 md:px-3 md:py-1.5 rounded-full border border-[#1e293b] bg-[#0f172a]/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#2dd4bf] mr-1.5 shadow-[0_0_5px_#2dd4bf]"></div>
                  <span className="text-[11px] md:text-[12px] font-bold text-gray-300 tracking-wide">Active: <span className="text-white ml-1">{activeLayersCount}</span></span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[10px] md:text-[11px] text-gray-400 tracking-widest font-bold">REPORT TOOL</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-3"></div>
                </div>
                <div>
                  <button onClick={() => setShowScanModal(true)} className="w-full py-2.5 bg-gradient-to-r from-[#f97316] to-[#ec4899] hover:brightness-110 rounded-xl text-[13px] md:text-[14px] font-bold text-white shadow-[0_4px_15px_rgba(249,115,22,0.3)] flex items-center justify-center space-x-2 transition-all cursor-pointer">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    <span>สแกนแจ้งจุดเสี่ยง/สาธารณภัย</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[10px] md:text-[11px] text-[#38bdf8] tracking-widest font-bold">GIS MAP LAYERS</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-3"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="แผนที่ดาวเทียม (Satellite)" active={satelliteLayer} onClick={() => setSatelliteLayer(!satelliteLayer)} dotColor="#10b981" />
                  <CustomToggleBox label="ขอบเขตตำบลบ่อหลวง" active={showBoluang} onClick={() => setShowBoluang(!showBoluang)} dotColor="#38bdf8" />
                  <CustomToggleBox label="ขอบเขต 13 หมู่บ้าน" active={showBlock} onClick={() => setShowBlock(!showBlock)} dotColor="#fcd34d" />
                  <div className="relative">
                    <CustomToggleBox label="แปลงที่ดินรายบุคคล" active={showParcel} onClick={() => setShowParcel(!showParcel)} dotColor="#4ade80" />
                    <span className="absolute right-3 top-2 text-[8px] md:text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20 pointer-events-none">Admin Only</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[10px] md:text-[11px] text-gray-400 tracking-widest font-bold">CITIZEN REPORTS</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-3"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="จุดแจ้งเหตุประชาชน (สีแดง)" active={citizenReport} onClick={() => setCitizenReport(!citizenReport)} dotColor="#ef4444" />
                </div>
              </div>

              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[10px] md:text-[11px] text-gray-400 tracking-widest font-bold">NATURAL HAZARD</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-3"></div>
                </div>
                <div className="space-y-1">
                  <CustomToggleBox label="จุดเสี่ยงแผ่นดินไหว" active={earthquakeLayer} onClick={() => setEarthquakeLayer(!earthquakeLayer)} dotColor="#c084fc" />
                  <CustomToggleBox label="จุดความร้อน Hotspot" active={hotspot} onClick={() => setHotspot(!hotspot)} dotColor="#ea580c" />
                  <CustomToggleBox label="พื้นที่เสี่ยงดินถล่ม" active={showLandslide} onClick={() => setShowLandslide(!showLandslide)} dotColor="#ef4444" />
                </div>
              </div>

            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
