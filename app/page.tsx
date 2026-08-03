'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js'; 

// 🌟 ตั้งค่า Supabase 
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvtjjhvvtaswzhwhowlj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'ใส่_SUPABASE_ANON_KEY_ของคุณตรงนี้';
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

// 💎 UI Component: Toggle แบบ Clean & Fast
const CustomToggleBox = ({ label, active, onClick, dotColor = '#38bdf8', isRadio = false }: any) => (
  <div 
    className="flex items-center space-x-3 px-3 py-1.5 rounded-xl border border-[#1e293b] bg-[#0b132b]/50 hover:bg-[#1e293b]/80 transition-colors duration-200 cursor-pointer select-none mb-1"
    onClick={onClick}
  >
    {isRadio ? (
      <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${active ? 'border-[#38bdf8]' : 'border-gray-500'}`}>
        {active && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}
      </div>
    ) : (
      <div className={`relative w-8 h-4 rounded-full transition-colors duration-300 flex-shrink-0 ${active ? 'bg-[#38bdf8]' : 'bg-[#334155]'}`}>
        <div className={`absolute top-[2px] left-[2px] bg-white rounded-full h-3 w-3 transition-transform duration-300 shadow-sm ${active ? 'translate-x-4' : 'translate-x-0'}`}></div>
      </div>
    )}
    <div className="flex items-center space-x-2 flex-1">
      {!isRadio && <div className="w-2.5 h-2.5 rounded-[3px] shadow-sm" style={{ backgroundColor: dotColor }}></div>}
      <span className={`text-[14px] font-medium transition-colors ${active ? 'text-white' : 'text-gray-400'}`}>{label}</span>
    </div>
  </div>
);

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

// 📍 พิกัดจังหวัดหลักๆ ทั่วประเทศไทย (สำหรับโชว์พยากรณ์อากาศภาพรวม)
const thaiProvinces = [
  { name: 'อ.เมืองเชียงใหม่, เชียงใหม่', lat: 18.7883, lng: 98.9853 },
  { name: 'อ.เมืองเชียงราย, เชียงราย', lat: 19.9070, lng: 99.8325 },
  { name: 'อ.เมืองแม่ฮ่องสอน, แม่ฮ่องสอน', lat: 19.3020, lng: 97.9654 },
  { name: 'อ.เมืองน่าน, น่าน', lat: 18.7756, lng: 100.7730 },
  { name: 'อ.เมืองพิษณุโลก, พิษณุโลก', lat: 16.8211, lng: 100.2659 },
  { name: 'อ.เมืองขอนแก่น, ขอนแก่น', lat: 16.4322, lng: 102.8236 },
  { name: 'อ.เมืองอุดรธานี, อุดรธานี', lat: 17.4138, lng: 102.7872 },
  { name: 'อ.เมืองนครราชสีมา, นครราชสีมา', lat: 14.9799, lng: 102.0978 },
  { name: 'อ.เมืองอุบลราชธานี, อุบลราชธานี', lat: 15.2448, lng: 104.8473 },
  { name: 'กรุงเทพมหานคร', lat: 13.7563, lng: 100.5018 },
  { name: 'อ.เมืองชลบุรี, ชลบุรี', lat: 13.3611, lng: 100.9847 },
  { name: 'อ.เมืองกาญจนบุรี, กาญจนบุรี', lat: 14.0041, lng: 99.5328 },
  { name: 'อ.หัวหิน, ประจวบคีรีขันธ์', lat: 12.5684, lng: 99.9577 },
  { name: 'อ.เมืองสุราษฎร์ธานี, สุราษฎร์ธานี', lat: 9.1342, lng: 99.3334 },
  { name: 'อ.เมืองภูเก็ต, ภูเก็ต', lat: 7.9519, lng: 98.3381 },
  { name: 'อ.หาดใหญ่, สงขลา', lat: 7.0097, lng: 100.4705 }
];

export default function BoLuangDashboard() {
  const [mounted, setMounted] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const coordsRef = useRef<HTMLSpanElement>(null);

  // 🎛️ State แผงควบคุม ซ้าย
  const [tmdWeather, setTmdWeather] = useState(true); // เปิดเป็นค่าเริ่มต้นให้เห็นความว้าวเลย
  const [tmdRain, setTmdRain] = useState(false);
  const [pm25, setPm25] = useState(false);
  const [windyLayer, setWindyLayer] = useState(false); 
  const [windyType, setWindyType] = useState('rain'); 

  // 🎛️ State แผงควบคุม ขวา
  const [satelliteLayer, setSatelliteLayer] = useState(false); 
  const [showBoluang, setShowBoluang] = useState(false);   
  const [showBlock, setShowBlock] = useState(false);        
  const [showParcel, setShowParcel] = useState(false);      
  const [citizenReport, setCitizenReport] = useState(true); 
  const [earthquakeLayer, setEarthquakeLayer] = useState(false);        
  const [hotspot, setHotspot] = useState(false);
  const [showLandslide, setShowLandslide] = useState(false);
  
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [showScanModal, setShowScanModal] = useState(false);

  // 📡 ข้อมูล API & GeoJSON
  const [provincialWeatherData, setProvincialWeatherData] = useState<any[]>([]); // 🌟 เก็บข้อมูลพยากรณ์อากาศระดับจังหวัด
  const [villageRainData, setVillageRainData] = useState<any[]>([]); 
  const [nationalAirData, setNationalAirData] = useState<any[]>([]);
  const [disasterReports, setDisasterReports] = useState<any[]>([]); 
  
  // 👁️ State สำหรับนับจำนวนผู้เข้าชม
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

  const activeLayersCount = [satelliteLayer, showBoluang, showBlock, showParcel, citizenReport, earthquakeLayer, hotspot, showLandslide].filter(Boolean).length;

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

  // 👁️ ฟังก์ชันบันทึกและดึงสถิติคนเข้าชม
  useEffect(() => {
    if (!mounted) return;
    const handleVisitorCount = async () => {
      try {
        let sessionId = sessionStorage.getItem('bl_session_id');
        if (!sessionId) {
          sessionId = Math.random().toString(36).substring(2, 15); 
          sessionStorage.setItem('bl_session_id', sessionId);
          await supabase.from('visitor_logs').insert([{ session_id: sessionId }]);
        }
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

  // 🌟 ดึงข้อมูลพยากรณ์อากาศระดับจังหวัด (TMD API Simulation)
  useEffect(() => {
    if (!tmdWeather) {
      setProvincialWeatherData([]);
      return;
    }
    const fetchProvincialWeather = async () => {
      try {
        const lats = thaiProvinces.map(p => p.lat.toFixed(4)).join(',');
        const lngs = thaiProvinces.map(p => p.lng.toFixed(4)).join(',');
        
        // ใช้ Open-Meteo แทนเพื่อความเสถียร แต่แสดงผลเป็นรูปแบบ TMD
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weathercode&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FBangkok`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (Array.isArray(data)) {
          const formatted = thaiProvinces.map((prov, i) => ({
            ...prov,
            temp: data[i]?.current?.temperature_2m || 0,
            humidity: data[i]?.current?.relative_humidity_2m || 0,
            rain: data[i]?.current?.precipitation || 0,
            wind: (data[i]?.current?.wind_speed_10m / 3.6) || 0, // แปลง km/h เป็น m/s
            wCode: data[i]?.current?.weathercode || 0,
            tempMin: data[i]?.daily?.temperature_2m_min?.[0] || 0,
            tempMax: data[i]?.daily?.temperature_2m_max?.[0] || 0,
          }));
          setProvincialWeatherData(formatted);
        }
      } catch (error) {
        console.error('Error fetching provincial weather:', error);
      }
    };
    fetchProvincialWeather();
  }, [tmdWeather]);

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

  const formatVillageName = (rawName: any) => {
    if (!rawName) return 'พื้นที่หมู่บ้าน';
    const safeName = String(rawName); 
    let cName = safeName.replace(/^(บ้าน|บ\.|หมู่ที่\s*\d+|หมู่\s*\d+)/, '').replace(/\s+/g, '');
    if (cName.includes('บ่อหลวง')) cName = 'บ้านบ่อหลวง';
    else if (cName === 'ขุน' || cName.includes('บ้านขุน')) cName = 'บ้านขุน';
    else cName = `บ้าน${cName}`;
    return cName;
  };

  const villageLabels = useMemo(() => {
    const vMap: Record<string, { sumLat: number, sumLng: number, count: number }> = {};
    if (geoBlock && geoBlock.features) {
      geoBlock.features.forEach((f: any) => {
        const props = f.properties || {};
        let rawName = props.own_villag || props.name_th || props.vil_name || props.name || props.zone_name || `หมู่ที่ ${props.zone_id || props.id || 'ไม่ระบุ'}`;
        let cName = formatVillageName(rawName);
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        const extractCoords = (coords: any[]) => {
          if (!coords) return;
          if (typeof coords[0] === 'number') {
            if (coords[1] < minLat) minLat = coords[1];
            if (coords[1] > maxLat) maxLat = coords[1];
            if (coords[0] < minLng) minLng = coords[0];
            if (coords[0] > maxLng) maxLng = coords[0];
          } else if (Array.isArray(coords)) { coords.forEach(extractCoords); }
        };
        extractCoords(f.geometry?.coordinates);
        if (minLat !== Infinity) {
          if (!vMap[cName]) vMap[cName] = { sumLat: 0, sumLng: 0, count: 0 };
          vMap[cName].sumLat += (minLat + maxLat) / 2;
          vMap[cName].sumLng += (minLng + maxLng) / 2;
          vMap[cName].count += 1;
        }
      });
    }
    return Object.keys(vMap).map(name => ({ name, lat: vMap[name].sumLat / vMap[name].count, lng: vMap[name].sumLng / vMap[name].count }));
  }, [geoBlock]);

  useEffect(() => {
    if (!tmdRain || !villageLabels || villageLabels.length === 0) return;
    const fetchVillageRain = async () => {
      try {
        const lats = villageLabels.map(v => v.lat.toFixed(4)).join(',');
        const lngs = villageLabels.map(v => v.lng.toFixed(4)).join(',');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FBangkok`;
        const res = await fetch(url);
        const data = await res.json();
        if (Array.isArray(data)) {
          const formatted = villageLabels.map((v, i) => ({
            ...v, rainSum: data[i]?.daily?.precipitation_sum?.[0] || 0,
            tempMax: data[i]?.daily?.temperature_2m_max?.[0] || 0, tempMin: data[i]?.daily?.temperature_2m_min?.[0] || 0,
            wCode: data[i]?.daily?.weathercode?.[0] || 0, apiDate: data[i]?.daily?.time?.[0] || new Date().toISOString().split('T')[0]
          }));
          setVillageRainData(formatted);
        }
      } catch (error) { console.error(error); }
    };
    fetchVillageRain();
  }, [tmdRain, villageLabels]);

  const BLOCK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#14b8a6', '#0ea5e9'];
  const getVillageColor = (feature: any) => {
    const props = feature?.properties || {};
    const nameStr = String(props.own_villag || props.name_th || props.name || props.zone_name || props.id || "0");
    const colorIndex = nameStr.length % BLOCK_COLORS.length;
    return props.fill || BLOCK_COLORS[colorIndex];
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
    else if (rainSum > 20 && rainSum <= 50) { color = '#eab308'; fillColor = '#facc15'; } 
    else if (rainSum > 50) { color = '#ef4444'; fillColor = '#f87171'; }
    return { radius, color, fillColor, fillOpacity: 0.7, weight: 2.5 };
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
      setIframeState(prev => ({ ...prev, lat: mapRef.getCenter().lat, lng: mapRef.getCenter().lng })); 
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
  
  // 🌟 สร้างไอคอนพยากรณ์อากาศระดับจังหวัด
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

  return (
    <main className="relative w-screen h-screen bg-[#0b132b] font-sans text-white overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: transparent !important; cursor: crosshair !important; }
        .leaflet-top.leaflet-left { top: 90px !important; left: 370px !important; }
        .leaflet-bar a { background-color: #0f172a !important; color: #fff !important; border: 1px solid #1e293b !important; border-radius: 8px !important; }
        .leaflet-bar a:hover { background-color: #1e293b !important; }
        .leaflet-div-icon { background: transparent !important; border: none !important; }
        .leaflet-tooltip { pointer-events: none !important; }
        
        .leaflet-tooltip.village-hover-tooltip { 
          background-color: #ffffff !important; color: #0f172a !important; border: 1px solid #cbd5e1 !important; 
          font-family: inherit !important; font-size: 14px !important; font-weight: 600 !important; 
          padding: 6px 14px !important; border-radius: 6px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important; 
        }

        /* 🌟 CSS สำหรับ Popup พยากรณ์อากาศ TMD (เหมือนภาพเป๊ะ!) */
        .popup-tmd-weather .leaflet-popup-content-wrapper {
          background-color: #0f172a !important; color: #e2e8f0 !important; border: 1px solid #38bdf8 !important;
          border-radius: 10px !important; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7) !important; padding: 0 !important; overflow: hidden;
        }
        .popup-tmd-weather .leaflet-popup-tip { background-color: #0f172a !important; border-top: 1px solid #38bdf8 !important; border-left: 1px solid #38bdf8 !important; }
        .popup-tmd-weather .leaflet-popup-content { margin: 0 !important; width: 280px !important; }
        .popup-tmd-weather .leaflet-popup-close-button { color: #0f172a !important; font-size: 18px !important; padding-top: 5px !important; padding-right: 10px !important; z-index: 50; }
        .popup-tmd-weather .leaflet-popup-close-button:hover { color: #ffffff !important; background: transparent !important; }

        .popup-report .leaflet-popup-content-wrapper {
          background-color: rgba(15, 23, 42, 0.95) !important; color: #e2e8f0 !important; border: 1px solid #ef4444 !important;
          border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important; padding: 0 !important; overflow: hidden;
        }
        .popup-report .leaflet-popup-tip { background-color: rgba(15, 23, 42, 0.95) !important; border-top: 1px solid #ef4444 !important; border-left: 1px solid #ef4444 !important; }
        .popup-report .leaflet-popup-content { margin: 0 !important; }

        .custom-dark-popup .leaflet-popup-content-wrapper {
          background-color: rgba(15, 23, 42, 0.95) !important; color: #e2e8f0 !important; border: 1px solid #1e293b !important;
          border-radius: 12px !important; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important; backdrop-filter: blur(8px) !important; padding: 0 !important; overflow: hidden;
        }
        .custom-dark-popup .leaflet-popup-tip { background-color: rgba(15, 23, 42, 0.95) !important; }
        .custom-dark-popup .leaflet-popup-content { margin: 0 !important; }
        
        .leaflet-popup-close-button { color: #cbd5e1 !important; font-size: 16px !important; padding-top: 4px !important; padding-right: 8px !important; z-index: 50;}
        .leaflet-popup-close-button:hover { color: #ef4444 !important; background: transparent !important; }

        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 5px; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-api { animation: fadeIn 0.3s ease-out forwards; }
      `}} />

      {/* 🗺️ โครงสร้างแผนที่หลัก */}
      <div className="absolute inset-0 z-0 bg-[#0b132b] overflow-hidden">
        <div 
          className={`absolute pointer-events-none transition-opacity duration-700 ${windyLayer ? 'opacity-100 saturate-150' : 'opacity-0'}`}
          style={{ top: '-100vh', left: '-100vw', width: '300vw', height: '300vh', transform: `translate(${transform.x}px, ${transform.y}px)`, willChange: 'transform', zIndex: 0 }}
        >
          <iframe width="100%" height="100%" frameBorder="0" src={windyMapUrl} />
        </div>

        <div className="absolute inset-0 pointer-events-auto" style={{ zIndex: 10 }}>
          <MapContainer center={[14.8700, 100.9925]} zoom={6} maxZoom={20} zoomControl={false} attributionControl={false} className="w-full h-full" ref={setMapRef}>
            <ZoomControl position="topleft" />
            {!windyLayer && !satelliteLayer && <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={20} />}
            {!windyLayer && satelliteLayer && <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} />}
            
            {showBoluang && geoBoluang && <GeoJSON key="boluang-layer" data={geoBoluang} style={styleBoluang} />}
            {showBlock && geoBlock && <GeoJSON key="block-layer" data={geoBlock} style={getBlockStyle} onEachFeature={onEachBlockFeature} />}
            
            {/* 🌟 หมุดพยากรณ์อากาศระดับจังหวัด (TMD) */}
            {tmdWeather && provincialWeatherData.map((prov, i) => (
              <Marker key={`prov-wx-${i}`} position={[prov.lat, prov.lng]} icon={createTmdIcon(prov.wCode)}>
                <Popup className="popup-tmd-weather">
                  <div>
                    <div className="bg-[#38bdf8] px-4 py-3 font-bold text-[#0f172a] text-[15px] flex items-center shadow-sm">
                      <span className="mr-2 text-[18px]">🌧️</span> พยากรณ์อากาศ
                    </div>
                    <div className="p-4 bg-[#0f172a]">
                      <div className="text-[14px] font-bold text-white mb-3 pb-2 border-b border-[#1e293b]">
                        พื้นที่: {prov.name}
                      </div>
                      <div className="text-[13px] text-gray-300 space-y-2 font-medium mb-4">
                        <div>สภาพอากาศ: <span className="text-white">{getWmoWeatherDesc(prov.wCode)}</span></div>
                        <div>อุณหภูมิ: <span className="text-[#38bdf8] font-bold text-[15px]">{prov.tempMin.toFixed(1)}° – {prov.tempMax.toFixed(2)}°C</span></div>
                        <div>ฝน: <span className="text-white">{prov.rain} มม.</span></div>
                        <div>ความชื้น: <span className="text-white">{prov.humidity}%</span></div>
                        <div>ลม: <span className="text-white">{prov.wind.toFixed(2)} ม./วินาที</span></div>
                      </div>
                      {/* Footer แบบ TMD API */}
                      <div className="text-[10px] text-gray-500 font-mono text-left pt-3 border-t border-[#1e293b]">
                        ข้อมูลจาก TMD API · {new Date().toISOString().split('T')[0]}T00:00:00+07:00
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

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
                      <div className="border-t border-[#1e293b] pt-3 text-[11px] text-gray-500 font-mono text-right">
                        แจ้งเมื่อ: {new Date(report.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} น.
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

          </MapContainer>
        </div>
      </div>

      <header className="absolute top-0 left-0 right-0 h-[72px] bg-[#0b132b]/95 border-b border-[#1e293b] backdrop-blur-xl z-40 flex items-center justify-between px-6 pointer-events-auto shadow-md">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-4">
            <div className="flex space-x-2">
              <div className="w-9 h-9 bg-[#38bdf8]/20 rounded-full border border-[#38bdf8]/50 flex items-center justify-center text-[12px] font-bold text-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.3)]">BL</div>
            </div>
            <div className="flex flex-col border-l-2 border-[#1e293b] pl-4 ml-2">
              <h1 className="text-[15px] font-bold tracking-wide text-white leading-tight">ระบบสารสนเทศทางภูมิศาสตร์เพื่อ</h1>
              <h2 className="text-[15px] font-bold tracking-wide text-[#38bdf8] leading-tight mt-1">การบริหารจัดการสาธารณภัย ต.บ่อหลวง</h2>
            </div>
          </div>

          <div className="hidden md:flex flex-col border-l border-[#1e293b] pl-6 justify-center">
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

        <div className="hidden md:flex items-center bg-[#0f172a]/80 border border-[#1e293b] rounded-full px-4 py-1.5 shadow-sm transition-all hover:bg-[#1e293b] cursor-default">
          <svg className="w-4 h-4 text-[#2dd4bf] mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
          <span className="text-[13px] font-mono font-medium text-gray-300 tracking-wide">
            GIS Layers <span className="text-gray-500 mx-1">·</span> Boluang
          </span>
        </div>
      </header>

      <aside className="absolute top-24 left-4 z-40 w-[350px] bg-[#0b132b]/95 border border-[#1e293b] rounded-2xl shadow-2xl p-5 backdrop-blur-xl pointer-events-auto max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar">
        <div className="mb-4 flex flex-col items-start border-b border-[#1e293b] pb-3">
          <div className="flex items-center space-x-3 mb-2">
            <div className="bg-gradient-to-br from-[#38bdf8] to-[#2563eb] p-2.5 rounded-xl shadow-[0_4px_10px_rgba(37,99,235,0.4)]">
              <span className="text-white text-[20px]">🌧️</span>
            </div>
            <h2 className="text-[22px] font-serif font-bold tracking-wide text-[#7dd3fc]">Weather & Air</h2>
          </div>
          <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">ชั้นข้อมูลด้านซ้ายสำหรับพยากรณ์อากาศกรมอุตุนิยมวิทยาและค่าฝุ่น PM2.5 / AQI</p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center mb-2">
              <span className="text-[14px] mr-2">🌦️</span>
              <span className="text-[11px] text-gray-400 tracking-widest font-bold">WEATHER API</span>
              <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
            </div>
            <div className="space-y-1">
              <CustomToggleBox label="พยากรณ์อากาศกรมอุตุนิยมวิทยา" active={tmdWeather} onClick={() => setTmdWeather(!tmdWeather)} dotColor="#3b82f6" />
              <CustomToggleBox label="ปริมาณน้ำฝนสะสม (TMD)" active={tmdRain} onClick={() => setTmdRain(!tmdRain)} dotColor="#0ea5e9" />
            </div>
          </div>
          {/* ... (เมนูอื่นๆ ยังคงอยู่เหมือนเดิม) ... */}
        </div>
      </aside>
      
      {/* 🌟 แถบ Credit สภาพอากาศ Windy */}
      <div className="absolute bottom-4 right-1/2 translate-x-1/2 z-[60] pointer-events-auto">
        <div className="bg-[#0b132b]/80 backdrop-blur-md border border-[#1e293b] rounded-full px-3 py-1.5 shadow-sm text-[11px] font-mono text-gray-400 flex items-center space-x-1.5">
          <span className="text-[#38bdf8]">💨</span>
          <span>Weather data: Windy.com</span>
        </div>
      </div>
      {/* ... (ลายน้ำ Leaflet) ... */}
    </main>
  );
}
