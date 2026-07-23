'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// 🗺️ โหลด Leaflet แบบ Dynamic
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const WMSTileLayer = dynamic(() => import('react-leaflet').then(mod => mod.WMSTileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false });
const ZoomControl = dynamic(() => import('react-leaflet').then(mod => mod.ZoomControl), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(mod => mod.Tooltip), { ssr: false });

// 💎 UI Component สำหรับสวิตช์เปิดปิด
const CustomToggle = ({ label, active, onClick, dotColor = '#38bdf8' }: any) => (
  <div className="flex items-center space-x-3 cursor-pointer group py-1.5" onClick={onClick}>
    <div className={`relative w-[34px] h-[18px] rounded-full transition-colors duration-300 flex-shrink-0 ${active ? 'bg-[#38bdf8]' : 'bg-[#334155]'}`}>
      <div className={`absolute top-[2px] left-[2px] bg-white rounded-full h-[14px] w-[14px] transition-transform duration-300 shadow-sm ${active ? 'translate-x-[16px]' : 'translate-x-0'}`}></div>
    </div>
    <div className="flex items-center space-x-2 flex-1">
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? dotColor : '#475569' }}></div>
      <span className={`text-[12px] font-medium transition-colors ${active ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>{label}</span>
    </div>
  </div>
);

// 🌤️ แปลงรหัสสภาพอากาศ WMO เป็นภาษาไทย
const getWmoWeatherDesc = (code: number) => {
  const codes: Record<number, string> = {
    0: 'ท้องฟ้าแจ่มใส', 1: 'มีเมฆบางส่วน', 2: 'มีเมฆครึ้ม', 3: 'มีเมฆมาก',
    45: 'มีหมอก', 48: 'มีหมอกหนา', 51: 'ฝนปรอยๆ เบาบาง', 53: 'ฝนปรอยๆ ปานกลาง', 55: 'ฝนปรอยๆ หนัก',
    61: 'ฝนตกเล็กน้อย', 63: 'ฝนตกปานกลาง', 65: 'ฝนตกหนัก',
    80: 'ฝนตกเป็นหย่อมๆ', 81: 'ฝนตกหนักเป็นหย่อมๆ', 82: 'ฝนตกหนักมากเป็นหย่อมๆ',
    95: 'พายุฝนฟ้าคะนอง', 96: 'พายุฝนฟ้าคะนองมีลูกเห็บ', 99: 'พายุฝนฟ้าคะนองรุนแรง'
  };
  return codes[code] || 'สภาพอากาศปกติ';
};

// 📍 ข้อมูลจุดสังเกตการณ์ระดับประเทศ (สถานีหลักจำลองพิกัด)
const nationalStations = [
  { name: 'เชียงใหม่', lat: 18.7883, lng: 98.9853 },
  { name: 'กรุงเทพมหานคร', lat: 13.7563, lng: 100.5018 },
  { name: 'ขอนแก่น', lat: 16.4322, lng: 102.8236 },
  { name: 'สงขลา', lat: 7.1898, lng: 100.5954 },
  { name: 'นครราชสีมา', lat: 14.9799, lng: 102.0978 },
  { name: 'ชลบุรี', lat: 13.3611, lng: 100.9847 },
  { name: 'ภูเก็ต', lat: 7.8804, lng: 98.3922 },
  { name: 'อุบลราชธานี', lat: 15.2448, lng: 104.8473 },
  { name: 'นครสวรรค์', lat: 15.7001, lng: 100.1355 },
  { name: 'เชียงราย', lat: 19.9070, lng: 99.8325 },
  { name: 'ตาก', lat: 16.8839, lng: 99.1258 },
  { name: 'กาญจนบุรี', lat: 14.0041, lng: 99.5316 },
  { name: 'สุราษฎร์ธานี', lat: 9.1332, lng: 99.3195 },
  { name: 'อุดรธานี', lat: 17.4138, lng: 102.7872 }
];

export default function BoLuangDashboard() {
  const [mounted, setMounted] = useState(false);

  // 🎛️ State แผงควบคุม (Weather)
  const [tmdWeather, setTmdWeather] = useState(true);
  const [tmdRainLocal, setTmdRainLocal] = useState(true);
  const [tmdRainNational, setTmdRainNational] = useState(false); // 🌟 State ใหม่ระดับประเทศ
  const [pm25, setPm25] = useState(true);
  const [windyLayer, setWindyLayer] = useState(true); 
  const [windyType, setWindyType] = useState('rain'); 
  
  // 🎛️ State แผงควบคุม (Layers)
  const [satelliteLayer, setSatelliteLayer] = useState(false); 
  const [showThailand, setShowThailand] = useState(false); // 🌟 State ใหม่ ขอบเขตประเทศ
  const [showAmphoe, setShowAmphoe] = useState(false);     // 🌟 State ใหม่ ขอบเขตอำเภอ
  const [showBoluang, setShowBoluang] = useState(true);   
  const [showBlock, setShowBlock] = useState(true);        
  const [showParcel, setShowParcel] = useState(true);      
  const [landslide, setLandslide] = useState(true);        

  const [citizenReport, setCitizenReport] = useState(false);
  const [hotspot, setHotspot] = useState(true);
  
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [showWeatherPopup, setShowWeatherPopup] = useState(false);

  // 📡 ข้อมูล API & GeoJSON
  const [realWeatherData, setRealWeatherData] = useState<any>(null);
  const [realAqiData, setRealAqiData] = useState<any>(null);
  const [villageRainData, setVillageRainData] = useState<any[]>([]); 
  const [nationalRainData, setNationalRainData] = useState<any[]>([]); // 🌟 State เก็บข้อมูลน้ำฝนประเทศ
  const [realHotspots, setRealHotspots] = useState<any[]>([]);
  
  const [geoThailand, setGeoThailand] = useState<any>(null); // 🌟 GeoJSON ประเทศ
  const [geoAmphoe, setGeoAmphoe] = useState<any>(null);     // 🌟 GeoJSON อำเภอ
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [geoParcel, setGeoParcel] = useState<any>(null);
  const [geoLandslideRisk, setGeoLandslideRisk] = useState<any>(null);

  const [mapRef, setMapRef] = useState<any>(null);
  const [iframeState, setIframeState] = useState({ lat: 18.1633, lng: 98.3744, zoom: 12 });
  const [transform, setTransform] = useState({ x: 0, y: 0 });
  const syncData = useRef({ lat: 18.1633, lng: 98.3744, zoom: 12 });

  useEffect(() => {
    setMounted(true);
    const fetchRealtimeData = async () => {
      try {
        const weatherRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=18.1633&longitude=98.3744&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&timezone=Asia%2FBangkok');
        setRealWeatherData((await weatherRes.json()).current);
        const aqiRes = await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=18.1633&longitude=98.3744&current=pm2_5,aqi&timezone=Asia%2FBangkok');
        setRealAqiData((await aqiRes.json()).current);
      } catch (error) { console.error(error); }
    };
    fetchRealtimeData();

    const ts = Date.now(); 
    const loadGeoJSON = async (url: string, setter: any) => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          let data = await res.json();
          if (Array.isArray(data)) data = { type: "FeatureCollection", features: data };
          setter(data);
        }
      } catch (e) { console.error(`Error loading ${url}:`, e); }
    };

    // 🌟 โหลด GeoJSON เพิ่มเติม (ต้องนำไฟล์ .json ไปวางใน public/geojson/)
    loadGeoJSON(`/geojson/thailand.json?v=${ts}`, setGeoThailand);
    loadGeoJSON(`/geojson/amphoe_hod.json?v=${ts}`, setGeoAmphoe);
    
    loadGeoJSON(`/geojson/boluang.json?v=${ts}`, setGeoBoluang);
    loadGeoJSON(`/geojson/block.json?v=${ts}`, setGeoBlock); 
    loadGeoJSON(`/geojson/parcel.json?v=${ts}`, setGeoParcel);
    loadGeoJSON(`/geojson/boluang_landslide_risk.json?v=${ts}`, setGeoLandslideRisk);
  }, []);

  const formatVillageName = (rawName: any) => {
    if (!rawName) return 'พื้นที่หมู่บ้าน';
    const safeName = String(rawName); 
    let cName = safeName.replace(/^(บ้าน|บ\.|หมู่ที่\s*\d+|หมู่\s*\d+)/, '').replace(/\s+/g, '');
    if (cName.includes('บ่อหลวง')) cName = 'บ้านบ่อหลวง';
    else if (cName.includes('พะแวน')) cName = 'บ้านบ่อพะแวน';
    else if (cName.includes('สะแง')) cName = 'บ้านบ่อสะแง๋';
    else if (cName.includes('แม่หืด')) cName = 'บ้านแม่หืด';
    else if (cName.includes('อมขูด')) cName = 'บ้านอมขูด';
    else if (cName.includes('แม่สะนาม')) cName = 'บ้านแม่สะนาม';
    else if (cName.includes('กิ่วลม')) cName = 'บ้านกิ่วลม';
    else if (cName.includes('วังกอง')) cName = 'บ้านวังกอง';
    else if (cName === 'ขุน' || cName.includes('บ้านขุน')) cName = 'บ้านขุน';
    else if (cName.includes('นาฟ่อน')) cName = 'บ้านนาฟ่อน';
    else if (cName.includes('แม่ลายเหนือ')) cName = 'บ้านแม่ลายเหนือ';
    else if (cName.includes('แม่ลาย')) cName = 'บ้านแม่ลาย';
    else if (cName.includes('พุย')) cName = 'บ้านพุย';
    else if (cName.includes('เตียนอาง') || cName.includes('เดียนอาง')) cName = 'บ้านเตียนอาง';
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

  // 🌧️ ดึงข้อมูลฝนระดับหมู่บ้าน (Local)
  useEffect(() => {
    if (!villageLabels || villageLabels.length === 0) return;
    const fetchVillageRain = async () => {
      try {
        const lats = villageLabels.map(v => v.lat.toFixed(4)).join(',');
        const lngs = villageLabels.map(v => v.lng.toFixed(4)).join(',');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FBangkok`;
        const res = await fetch(url);
        const data = await res.json();
        if (Array.isArray(data)) {
          const formatted = villageLabels.map((v, i) => ({
            ...v,
            rainSum: data[i]?.daily?.precipitation_sum?.[0] || 0,
            tempMax: data[i]?.daily?.temperature_2m_max?.[0] || 0,
            tempMin: data[i]?.daily?.temperature_2m_min?.[0] || 0,
            wCode: data[i]?.daily?.weathercode?.[0] || 0,
            apiDate: data[i]?.daily?.time?.[0] || new Date().toISOString().split('T')[0]
          }));
          setVillageRainData(formatted);
        }
      } catch (error) { console.error(error); }
    };
    fetchVillageRain();
  }, [villageLabels]);

  // 🌧️ ดึงข้อมูลฝนระดับประเทศ (National) 🌟
  useEffect(() => {
    const fetchNationalRain = async () => {
      try {
        const lats = nationalStations.map(v => v.lat.toFixed(4)).join(',');
        const lngs = nationalStations.map(v => v.lng.toFixed(4)).join(',');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FBangkok`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (Array.isArray(data)) {
          const formatted = nationalStations.map((v, i) => ({
            ...v,
            rainSum: data[i]?.daily?.precipitation_sum?.[0] || 0,
            tempMax: data[i]?.daily?.temperature_2m_max?.[0] || 0,
            tempMin: data[i]?.daily?.temperature_2m_min?.[0] || 0,
            wCode: data[i]?.daily?.weathercode?.[0] || 0,
            apiDate: data[i]?.daily?.time?.[0] || new Date().toISOString().split('T')[0]
          }));
          setNationalRainData(formatted);
        }
      } catch (error) { console.error(error); }
    };
    fetchNationalRain();
  }, []);

  const getRainCircleStyle = (rainSum: number) => {
    let radius = 8 + (rainSum * 1.5); 
    if (radius > 35) radius = 35; 
    let color = '#38bdf8'; 
    let fillColor = '#7dd3fc'; 
    if (rainSum === 0) { color = '#94a3b8'; fillColor = '#cbd5e1'; radius = 7; } 
    else if (rainSum > 5 && rainSum <= 20) { color = '#10b981'; fillColor = '#34d399'; } 
    else if (rainSum > 20 && rainSum <= 50) { color = '#eab308'; fillColor = '#facc15'; } 
    else if (rainSum > 50) { color = '#ef4444'; fillColor = '#f87171'; }
    return { radius, color, fillColor, fillOpacity: 0.7, weight: 2.5 };
  };

  // =========================================================================
  // 🎨 STYLES สำหรับ GeoJSON
  // =========================================================================
  const styleThailand = { color: '#6366f1', weight: 2, fillOpacity: 0.05, dashArray: '5, 5', interactive: false }; // 🌟 ขอบเขตประเทศ
  const styleAmphoe = { color: '#8b5cf6', weight: 2.5, fillOpacity: 0.08, dashArray: '4, 4', interactive: false };   // 🌟 ขอบเขตอำเภอ
  const styleBoluang = { color: '#0ea5e9', weight: 3, fillOpacity: 0, interactive: false }; 
  const styleLandslide = (feature: any) => ({ color: feature.properties?.class === 1 ? '#ef4444' : '#f97316', fillColor: feature.properties?.class === 1 ? '#ef4444' : '#f97316', weight: 1.5, fillOpacity: 0.5, interactive: true });
  const styleParcel = { color: '#4ade80', fillColor: '#4ade80', weight: 1, fillOpacity: 0.2 }; 
  const BLOCK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#14b8a6', '#0ea5e9'];
  const getBlockStyle = (feature: any) => {
    const props = feature?.properties || {};
    const name = props.own_villag || props.name_th || props.name || props.id || "0";
    const colorIndex = String(name).length % BLOCK_COLORS.length;
    return { fillColor: props.fill || BLOCK_COLORS[colorIndex], weight: 1.5, color: 'rgba(255, 255, 255, 0.3)', fillOpacity: 0.12, dashArray: '3, 3' };
  };

  useEffect(() => {
    if (!mapRef) return;
    const onMove = () => {
      const zoom = mapRef.getZoom();
      if (zoom !== syncData.current.zoom) return;
      const initialPoint = mapRef.project(syncData.current, zoom);
      const currentPoint = mapRef.project(mapRef.getCenter(), zoom);
      setTransform({ x: initialPoint.x - currentPoint.x, y: initialPoint.y - currentPoint.y });
      setIframeState(prev => ({ ...prev, lat: mapRef.getCenter().lat, lng: mapRef.getCenter().lng })); 
    };
    const onZoomEnd = () => {
      const center = mapRef.getCenter(); const zoom = mapRef.getZoom();
      syncData.current = { lat: center.lat, lng: center.lng, zoom: zoom };
      setIframeState({ lat: center.lat, lng: center.lng, zoom: zoom });
      setTransform({ x: 0, y: 0 });
    };
    const onMoveEnd = () => {
      const center = mapRef.getCenter(); const zoom = mapRef.getZoom();
      syncData.current = { lat: center.lat, lng: center.lng, zoom: zoom };
      setIframeState({ lat: center.lat, lng: center.lng, zoom: zoom });
      setTransform({ x: 0, y: 0 });
    };
    mapRef.on('move', onMove); mapRef.on('moveend', onMoveEnd); mapRef.on('zoomend', onZoomEnd);
    return () => { mapRef.off('move', onMove); mapRef.off('moveend', onMoveEnd); mapRef.off('zoomend', onZoomEnd); };
  }, [mapRef]);

  const windyMapUrl = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km/h&zoom=${iframeState.zoom}&overlay=${windyType}&product=ecmwf&level=surface&lat=${iframeState.lat}&lon=${iframeState.lng}&detailLat=${iframeState.lat}&detailLon=${iframeState.lng}&marker=false`;

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const weatherIcon = useMemo(() => {
    if (!L) return null;
    return L.divIcon({
      className: 'bg-transparent border-none',
      html: `<div class="flex items-center justify-center w-12 h-12 bg-black/80 border-[1.5px] border-[#38bdf8] rounded-full shadow-[0_0_15px_rgba(56,189,248,0.5)] backdrop-blur-md cursor-pointer hover:scale-110 transition-transform z-50"><span class="text-[20px]">${realWeatherData?.precipitation > 0 ? '🌧️' : '🌤️'}</span></div>`,
      iconSize: [48, 48], iconAnchor: [24, 24]
    });
  }, [realWeatherData, L]);

  return (
    <main className="relative w-screen h-screen bg-[#111827] font-sans text-white overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: transparent !important; }
        .leaflet-top.leaflet-left { top: 90px !important; left: 360px !important; }
        .leaflet-bar a { background-color: #0f172a !important; color: #fff !important; border: 1px solid #1e293b !important; border-radius: 8px !important; }
        .leaflet-bar a:hover { background-color: #1e293b !important; }
        .leaflet-div-icon { background: transparent !important; border: none !important; }
        
        .leaflet-tooltip.village-hover-tooltip { 
          background-color: #ffffff !important; color: #0f172a !important; border: 1px solid #cbd5e1 !important; 
          font-family: inherit !important; font-size: 13px !important; font-weight: 600 !important; 
          padding: 5px 12px !important; border-radius: 6px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important; 
        }

        .leaflet-tooltip.custom-map-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }

        .leaflet-tooltip.custom-dark-tooltip {
          background-color: rgba(15, 23, 42, 0.95) !important;
          color: #e2e8f0 !important;
          border: 1px solid #1e293b !important;
          font-family: inherit !important;
          padding: 14px 16px !important;
          border-radius: 10px !important;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
          backdrop-filter: blur(4px) !important;
        }
        .leaflet-tooltip.custom-dark-tooltip::before { border-top-color: rgba(15, 23, 42, 0.95) !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
      `}} />

      <div className="absolute inset-0 z-0 bg-[#0b1120] overflow-hidden">
        <div 
          className={`absolute pointer-events-none transition-opacity duration-700 ${windyLayer ? 'opacity-100 saturate-150' : 'opacity-0'}`}
          style={{ top: '-100vh', left: '-100vw', width: '300vw', height: '300vh', transform: `translate(${transform.x}px, ${transform.y}px)`, willChange: 'transform', zIndex: 0 }}
        >
          <iframe width="100%" height="100%" frameBorder="0" src={windyMapUrl} />
        </div>

        <div className="absolute inset-0 pointer-events-auto" style={{ zIndex: 10 }}>
          <MapContainer center={[18.1633, 98.3744]} zoom={12} maxZoom={20} zoomControl={false} className="w-full h-full" ref={setMapRef}>
            <ZoomControl position="topleft" />
            {!windyLayer && !satelliteLayer && <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={20} />}
            {!windyLayer && satelliteLayer && <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} />}
            
            {/* 🌟 แสดงขอบเขตระดับต่างๆ (ประเทศ, อำเภอ, ตำบล, หมู่บ้าน) */}
            {showThailand && geoThailand && <GeoJSON key="thailand-layer" data={geoThailand} style={styleThailand} />}
            {showAmphoe && geoAmphoe && <GeoJSON key="amphoe-layer" data={geoAmphoe} style={styleAmphoe} />}
            {showBoluang && geoBoluang && <GeoJSON key="boluang-layer" data={geoBoluang} style={styleBoluang} />}
            {showBlock && geoBlock && <GeoJSON key="block-layer" data={geoBlock} style={getBlockStyle} onEachFeature={(f, l) => l.bindTooltip(formatVillageName(f.properties?.name_th), { sticky: true, className: 'village-hover-tooltip' })} />}
            
            {landslide && geoLandslideRisk && <GeoJSON key="landslide-layer" data={geoLandslideRisk} style={styleLandslide} />}
            {showParcel && geoParcel && <GeoJSON key="parcel-layer" data={geoParcel} style={styleParcel} />}

            {/* 🌧️ เรนเดอร์จุดน้ำฝนระดับหมู่บ้าน (Local) */}
            {tmdRainLocal && villageRainData.map((station, index) => {
              const style = getRainCircleStyle(station.rainSum);
              return (
                <CircleMarker key={`rain-local-${index}`} center={[station.lat, station.lng]} radius={style.radius} pathOptions={{ color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }}>
                  <Tooltip direction="top" offset={[0, -10]} className="custom-dark-tooltip" sticky>
                    <div className="flex flex-col text-left min-w-[220px]">
                      <div className="font-bold text-white text-[14px] mb-3 border-b border-gray-600 pb-2 flex justify-between"><span>{station.name}</span></div>
                      <div className="space-y-1.5 mb-4 text-[12px] text-gray-300">
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">ฝนสะสม:</span> <span className="text-[#38bdf8] font-bold text-[13px]">{station.rainSum.toFixed(1)} มม.</span></div>
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">ขนาดจุด:</span> <span>{style.radius.toFixed(1)} px</span></div>
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">สภาพอากาศ:</span> <span>{getWmoWeatherDesc(station.wCode)}</span></div>
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">อุณหภูมิ:</span> <span>{station.tempMin.toFixed(2)}°C – {station.tempMax.toFixed(2)}°C</span></div>
                      </div>
                      <div className="text-[10px] text-gray-500 pt-2.5 border-t border-gray-700 leading-relaxed tracking-wide">ข้อมูลจาก Open-Meteo API • {station.apiDate}T00:00:00+07:00<br/>* ปรับขนาดจุดตามฝนสะสม</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {/* 🌧️ เรนเดอร์จุดน้ำฝนระดับประเทศ (National) 🌟 */}
            {tmdRainNational && nationalRainData.map((station, index) => {
              const style = getRainCircleStyle(station.rainSum);
              return (
                <CircleMarker key={`rain-nat-${index}`} center={[station.lat, station.lng]} radius={style.radius} pathOptions={{ color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }}>
                  <Tooltip direction="top" offset={[0, -10]} className="custom-dark-tooltip" sticky>
                    <div className="flex flex-col text-left min-w-[220px]">
                      <div className="font-bold text-white text-[14px] mb-3 border-b border-gray-600 pb-2 flex justify-between"><span>จ.{station.name}</span></div>
                      <div className="space-y-1.5 mb-4 text-[12px] text-gray-300">
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">ฝนสะสม:</span> <span className="text-[#38bdf8] font-bold text-[13px]">{station.rainSum.toFixed(1)} มม.</span></div>
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">สภาพอากาศ:</span> <span>{getWmoWeatherDesc(station.wCode)}</span></div>
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">อุณหภูมิ:</span> <span>{station.tempMin.toFixed(2)}°C – {station.tempMax.toFixed(2)}°C</span></div>
                      </div>
                      <div className="text-[10px] text-gray-500 pt-2.5 border-t border-gray-700 leading-relaxed tracking-wide">ข้อมูลระดับชาติ (National Level)</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {/* 📍 Markers พิกัดจริง */}
            {mounted && tmdWeather && weatherIcon && <Marker position={[18.1633, 98.3744]} icon={weatherIcon} eventHandlers={{ click: () => setShowWeatherPopup(true) }} />}
          </MapContainer>
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a8a]/10 to-[#064e3b]/10 mix-blend-screen pointer-events-none z-[15]" />
      </div>

      {/* HEADER & FOOTER UI */}
      <header className="absolute top-0 left-0 right-0 h-[72px] bg-[#0c1427]/95 border-b border-[#1e293b] backdrop-blur-xl z-40 flex items-center justify-between px-6 pointer-events-auto shadow-md">
        <div className="flex items-center space-x-4">
          <div className="flex space-x-2">
            <div className="w-8 h-8 bg-red-500/20 rounded-full border border-red-500/50 flex items-center justify-center text-[10px] font-bold text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]">BL</div>
          </div>
          <div className="flex flex-col border-l-2 border-gray-600/50 pl-4 ml-2">
            <h1 className="text-[14px] font-bold tracking-wide text-white leading-tight">ระบบสารสนเทศทางภูมิศาสตร์เพื่อ</h1>
            <h2 className="text-[14px] font-bold tracking-wide text-[#38bdf8] leading-tight mt-0.5">การบริหารจัดการสาธารณภัย ต.บ่อหลวง</h2>
          </div>
        </div>
      </header>

      {/* 📍 แผงควบคุมด้านซ้าย (WEATHER & AIR) */}
      <aside className="absolute top-24 left-4 z-40 w-[340px] bg-[#0c1427]/95 border border-[#1e293b] rounded-2xl shadow-2xl p-6 backdrop-blur-xl pointer-events-auto">
        <div className="flex items-center space-x-3 mb-2">
          <div className="bg-[#56b6c2] p-2 rounded-lg">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M17.5 19C19.9853 19 22 16.9853 22 14.5C22 12.1384 20.1837 10.2017 17.8778 10.0153C17.4419 6.62141 14.5492 4 11 4C7.13401 4 4 7.13401 4 11C4 11.238 4.01188 11.4732 4.0349 11.7047C1.7828 12.1812 0 14.1378 0 16.5C0 19.5 2.5 22 5.5 22H17.5V19Z" /></svg>
          </div>
          <h2 className="text-[18px] font-bold tracking-wide text-[#56b6c2]">Weather & Air</h2>
        </div>
        <p className="text-[11px] text-gray-400 mt-2 leading-relaxed mb-6">ชั้นข้อมูลด้านซ้ายสำหรับพยากรณ์อากาศกรมอุตุนิยมวิทยา<br/>และค่าฝุ่น PM2.5 / AQI</p>

        <div className="space-y-6">
          <div>
            <div className="flex items-center mb-4"><div className="flex items-center text-[10px] text-gray-400 tracking-widest font-semibold"><span className="mr-2">☁</span> WEATHER API</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
            <div className="space-y-4 pl-1">
              <CustomToggle label="พยากรณ์อากาศกรมอุตุนิยมวิทยา" active={tmdWeather} onClick={() => setTmdWeather(!tmdWeather)} dotColor="#3b82f6" />
              <CustomToggle label="ปริมาณน้ำฝนสะสม (ระดับหมู่บ้าน)" active={tmdRainLocal} onClick={() => setTmdRainLocal(!tmdRainLocal)} dotColor="#06b6d4" />
              {/* 🌟 ปุ่มเปิด-ปิด น้ำฝนระดับประเทศ */}
              <CustomToggle label="ปริมาณน้ำฝนสะสม (ระดับประเทศ)" active={tmdRainNational} onClick={() => { setTmdRainNational(!tmdRainNational); if(!tmdRainNational) setShowThailand(true); }} dotColor="#6366f1" />
            </div>
          </div>
          <div>
            <div className="flex items-center mb-4"><div className="flex items-center text-[10px] text-gray-400 tracking-widest font-semibold"><span className="mr-2">🗺️</span> WINDY WEATHER MAP</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
            <div className="pl-1 mb-4">
              <CustomToggle label="เปิด/ปิดข้อมูลสภาพอากาศ Windy" active={windyLayer} onClick={() => setWindyLayer(!windyLayer)} dotColor="#eab308" />
            </div>
          </div>
        </div>
      </aside>

      {/* 📍 แผงควบคุมด้านขวา (LAYERS) */}
      <aside className={`absolute top-24 right-0 z-40 transition-transform duration-500 ease-in-out flex pointer-events-auto ${isRightPanelOpen ? 'translate-x-0' : 'translate-x-[320px]'}`}>
        <div className="relative mr-4 flex">
          <button onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className="absolute -left-[30px] top-4 w-[30px] h-12 bg-[#0c1427]/95 border-y border-l border-[#1e293b] rounded-l-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1e293b] transition-colors shadow-[-4px_0_10px_rgba(0,0,0,0.3)] backdrop-blur-md z-50 cursor-pointer">
            <svg className={`w-4 h-4 transform transition-transform duration-300 ${isRightPanelOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
          <div className="w-[320px] bg-[#0c1427]/95 border border-[#1e293b] rounded-xl shadow-2xl p-5 backdrop-blur-xl h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar">
            <div className="flex items-start space-x-3 mb-3">
              <div className="mt-1 text-[#56b6c2]"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" /></svg></div>
              <div className="w-full">
                <h2 className="text-[16px] font-semibold tracking-wide text-white">Layers</h2>
                <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">เปิด/ปิด ขอบเขตความรับผิดชอบและชั้นข้อมูลระดับเทศบาล</p>
              </div>
            </div>
            <div className="space-y-5 mt-6">
              <div>
                <div className="flex items-center mb-3"><div className="flex items-center text-[10px] text-[#38bdf8] tracking-widest font-semibold"><span className="mr-2">🗺️</span> GIS MAP LAYERS</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
                <div className="space-y-3 pl-1">
                  <CustomToggle label="แผนที่ดาวเทียม (Satellite)" active={satelliteLayer} onClick={() => setSatelliteLayer(!satelliteLayer)} dotColor="#10b981" />
                  
                  {/* 🌟 ชุดปุ่มเปิด-ปิด ลำดับขั้นการปกครอง */}
                  <CustomToggle label="ขอบเขตประเทศไทย" active={showThailand} onClick={() => setShowThailand(!showThailand)} dotColor="#6366f1" />
                  <CustomToggle label="ขอบเขตอำเภอฮอด" active={showAmphoe} onClick={() => setShowAmphoe(!showAmphoe)} dotColor="#8b5cf6" />
                  <CustomToggle label="ขอบเขตตำบลบ่อหลวง" active={showBoluang} onClick={() => setShowBoluang(!showBoluang)} dotColor="#38bdf8" />
                  <CustomToggle label="ขอบเขต 13 หมู่บ้าน" active={showBlock} onClick={() => setShowBlock(!showBlock)} dotColor="#fcd34d" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
