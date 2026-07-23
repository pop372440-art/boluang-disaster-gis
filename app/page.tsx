'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// 🗺️ โหลด Leaflet แบบ Dynamic
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false });
const ZoomControl = dynamic(() => import('react-leaflet').then(mod => mod.ZoomControl), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });

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

export default function BoLuangDashboard() {
  const [mounted, setMounted] = useState(false);

  // 🎛️ State แผงควบคุม
  const [tmdWeather, setTmdWeather] = useState(true);
  const [tmdRain, setTmdRain] = useState(true);
  const [pm25, setPm25] = useState(true);
  const [windyLayer, setWindyLayer] = useState(true); 
  const [windyType, setWindyType] = useState('rain'); 
  
  const [satelliteLayer, setSatelliteLayer] = useState(false); 
  
  const [showBoluang, setShowBoluang] = useState(true);   // boluang.json
  const [showBlock, setShowBlock] = useState(true);       // block.json
  const [showParcel, setShowParcel] = useState(false);    // parcel.json
  const [landslide, setLandslide] = useState(true);       // boluang_landslide_risk.json

  const [citizenReport, setCitizenReport] = useState(false);
  const [hotspot, setHotspot] = useState(true);
  
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [showWeatherPopup, setShowWeatherPopup] = useState(false);

  // 📡 ข้อมูล API & GeoJSON
  const [realWeatherData, setRealWeatherData] = useState<any>(null);
  const [realAqiData, setRealAqiData] = useState<any>(null);
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [geoParcel, setGeoParcel] = useState<any>(null);
  const [geoLandslideRisk, setGeoLandslideRisk] = useState<any>(null);

  // 🌟 DYNAMIC MAP SYNC
  const [mapRef, setMapRef] = useState<any>(null);
  const [iframeState, setIframeState] = useState({ lat: 18.1633, lng: 98.3744, zoom: 12 });
  const [transform, setTransform] = useState({ x: 0, y: 0 });
  const syncData = useRef({ lat: 18.1633, lng: 98.3744, zoom: 12 });
  const transformRef = useRef({ x: 0, y: 0 });

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
      } catch (e) { console.error(e); }
    };

    loadGeoJSON(`/geojson/boluang.json?v=${ts}`, setGeoBoluang);
    loadGeoJSON(`/geojson/block.json?v=${ts}`, setGeoBlock); 
    loadGeoJSON(`/geojson/parcel.json?v=${ts}`, setGeoParcel);
    loadGeoJSON(`/geojson/boluang_landslide_risk.json?v=${ts}`, setGeoLandslideRisk);
  }, []);

  // 🛡️ จัดฟอร์แมตชื่อหมู่บ้าน
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

  // 🖱️ ผูก Event แบบ Minimalist (ซ่อนสีตอนปกติ สว่างตอน Hover)
  const onEachBlockFeature = (feature: any, layer: any) => {
    const props = feature?.properties || {};
    const rawName = props.own_villag || props.name_th || props.name || props.zone_name || `หมู่ที่ ${props.zone_id || props.id || ''}`;
    const villageName = formatVillageName(rawName);

    // สีตั้งต้นของหมู่บ้านนั้นๆ (ดึงมาเก็บไว้ใช้ตอน Hover)
    const colorIndex = String(rawName).length % BLOCK_COLORS.length;
    const highlightColor = props.fill || BLOCK_COLORS[colorIndex];

    layer.bindTooltip(`
      <div class="px-2.5 py-1 text-[13px] font-bold text-[#1e293b] bg-white/95 border border-[#cbd5e1] rounded shadow-lg">
        📍 ${villageName}
      </div>
    `, { sticky: true, direction: 'auto', className: 'custom-map-tooltip' });

    layer.on({
      mouseover: (e: any) => {
        const targetLayer = e.target;
        // 🌟 ตอนเอาเมาส์ชี้ -> ให้สีสว่างขึ้น และเส้นขอบชัดขึ้น
        targetLayer.setStyle({ 
          weight: 2.5, 
          color: highlightColor, // ใช้สีหมู่บ้านมาเป็นสีเส้นขอบ
          fillOpacity: 0.25      // ให้เห็นสีพื้นหลังจางๆ
        });
      },
      mouseout: (e: any) => {
        const targetLayer = e.target;
        // 🌟 ตอนเอาเมาส์ออก -> กลับไปโปร่งใสแทบ 100% เส้นประบางๆ
        targetLayer.setStyle({ 
          weight: 1, 
          color: 'rgba(255, 255, 255, 0.3)', // เส้นขาวโปร่งแสง
          fillOpacity: 0.02                  // แทบไม่มีสีพื้นหลัง
        });
      }
    });
  };

  // 🧠 กลไกซิงค์ 2 แผนที่
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

  // 📍 Custom Markers
  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const weatherIcon = useMemo(() => {
    if (!L) return null;
    return L.divIcon({
      className: 'bg-transparent border-none',
      html: `<div class="flex items-center justify-center w-12 h-12 bg-black/80 border-[1.5px] border-[#38bdf8] rounded-full shadow-[0_0_15px_rgba(56,189,248,0.5)] backdrop-blur-md cursor-pointer hover:scale-110 transition-transform z-50"><span class="text-[20px]">${realWeatherData?.precipitation > 0 ? '🌧️' : '🌤️'}</span></div>`,
      iconSize: [48, 48], iconAnchor: [24, 24]
    });
  }, [realWeatherData, L]);

  const pm25Icon = useMemo(() => {
    if (!L) return null;
    return L.divIcon({
      className: 'bg-transparent border-none',
      html: `<div class="flex flex-col items-center justify-center w-12 h-14 bg-black/80 border-2 border-[#fbbf24] rounded-xl shadow-[0_0_15px_rgba(251,191,36,0.6)] backdrop-blur-md transition-transform hover:scale-110 z-50"><span class="text-white font-bold text-[16px]">${realAqiData?.pm2_5 || '-'}</span><span class="text-gray-400 text-[9px] mt-0.5">PM2.5</span></div>`,
      iconSize: [48, 56], iconAnchor: [24, 28]
    });
  }, [realAqiData, L]);

  const hotspotIcon = useMemo(() => {
    if (!L) return null;
    return L.divIcon({
      className: 'bg-transparent border-none',
      html: `<div class="flex items-center justify-center w-10 h-10 bg-black/90 border-2 border-[#f97316] rounded-full shadow-[0_0_20px_rgba(249,115,22,0.8)] backdrop-blur-md animate-pulse z-40"><span class="text-[18px]">🔥</span></div>`,
      iconSize: [40, 40], iconAnchor: [20, 20]
    });
  }, [L]);

  // =========================================================================
  // 🎨 STYLES แบบ MINIMALIST
  // =========================================================================
  // ขอบเขตตำบล: ใช้เส้นสีฟ้าทึบ หนานิดนึง เพื่อตีกรอบนอกสุดให้ชัด
  const styleBoluang = { color: '#0ea5e9', weight: 3, fillOpacity: 0 }; 
  const styleParcel = { color: '#4ade80', weight: 1, fillOpacity: 0.2 }; 
  const styleLandslide = (feature: any) => ({ color: feature.properties?.class === 1 ? '#ef4444' : '#f97316', weight: 1, fillOpacity: 0.4 });

  // ขอบเขตหมู่บ้าน 13 สีสัน: ตั้งค่า Default ให้ "ซ่อน" (เห็นแค่เส้นประบางๆ)
  const BLOCK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#14b8a6', '#0ea5e9'];
  const getBlockStyle = (feature: any) => {
    const props = feature?.properties || {};
    const name = props.own_villag || props.name_th || props.name || props.id || "0";
    const colorIndex = String(name).length % BLOCK_COLORS.length;
    return {
      fillColor: props.fill || BLOCK_COLORS[colorIndex], 
      weight: 1,      
      color: 'rgba(255, 255, 255, 0.3)',  // เส้นประสีขาวจางๆ
      fillOpacity: 0.02,                  // โปร่งใส 98%
      dashArray: '5, 5'
    };
  };

  return (
    <main className="relative w-screen h-screen bg-[#111827] font-sans text-white overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: transparent !important; }
        .leaflet-top.leaflet-left { top: 90px !important; left: 360px !important; }
        .leaflet-bar a { background-color: #0f172a !important; color: #fff !important; border: 1px solid #1e293b !important; border-radius: 8px !important; }
        .leaflet-bar a:hover { background-color: #1e293b !important; }
        .leaflet-div-icon { background: transparent !important; border: none !important; }
        /* สไตล์ Tooltip แบบ Minimal สะอาดตา */
        .leaflet-tooltip.custom-map-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
        .leaflet-tooltip-pane .leaflet-tooltip { margin-top: -10px; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
      `}} />

      {/* ========================================================
          🗺️ MAP BACKGROUND & GIS LAYERS
      ======================================================== */}
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
            
            {/* 🌟 ลำดับ Z-Index */}
            {showParcel && geoParcel && <GeoJSON key={`parcel-${JSON.stringify(geoParcel).length}`} data={geoParcel} style={styleParcel} />}
            {landslide && geoLandslideRisk && <GeoJSON key={`landslide-${JSON.stringify(geoLandslideRisk).length}`} data={geoLandslideRisk} style={styleLandslide} />}
            
            {/* ขอบเขต 13 หมู่บ้าน (ซ่อนสีพื้น โชว์ตอน Hover) */}
            {showBlock && geoBlock && <GeoJSON key={`block-${JSON.stringify(geoBlock).length}`} data={geoBlock} style={getBlockStyle} onEachFeature={onEachBlockFeature} />}
            
            {/* ขอบเขตตำบลบ่อหลวง (เส้นหนาชั้นบนสุด) */}
            {showBoluang && geoBoluang && <GeoJSON key={`boluang-${JSON.stringify(geoBoluang).length}`} data={geoBoluang} style={styleBoluang} />}

            {/* Markers ต่างๆ */}
            {mounted && tmdWeather && weatherIcon && <Marker position={[18.1633, 98.3744]} icon={weatherIcon} eventHandlers={{ click: () => setShowWeatherPopup(true) }} />}
            {mounted && pm25 && pm25Icon && <Marker position={[18.1800, 98.3450]} icon={pm25Icon} />}
            {mounted && hotspot && hotspotIcon && <Marker position={[18.1250, 98.3500]} icon={hotspotIcon} />}
          </MapContainer>
        </div>

        <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a8a]/10 to-[#064e3b]/10 mix-blend-screen pointer-events-none z-[15]" />
      </div>

      {/* 🌟 POPUP WEATHER */}
      {showWeatherPopup && realWeatherData && (
        <div className="absolute top-[50%] left-[50%] transform -translate-x-1/2 -translate-y-1/2 z-50 w-72 bg-[#0f172a]/95 border border-[#1e293b] rounded-xl shadow-2xl overflow-hidden backdrop-blur-3xl animate-fade-in-up pointer-events-auto">
          <div className="bg-[#56b6c2] text-black px-4 py-2.5 flex items-center justify-between">
            <span className="font-bold text-[13px]">พยากรณ์อากาศ</span>
            <button onClick={() => setShowWeatherPopup(false)} className="text-black/70 hover:text-black font-bold text-xl">×</button>
          </div>
          <div className="p-5 text-[12px] space-y-3 text-gray-200">
            <p className="font-bold text-[14px] text-white">📍 พื้นที่: ต.บ่อหลวง, อ.ฮอด</p>
            <p>อุณหภูมิ: <span className="font-bold text-white">{realWeatherData.temperature_2m}°C</span></p>
            <p>ความชื้น: {realWeatherData.relative_humidity_2m}%</p>
            <p>ลม: {realWeatherData.wind_speed_10m} km/h</p>
            <p>ฝน: {realWeatherData.precipitation} mm</p>
          </div>
        </div>
      )}

      {/* ========================================================
          📍 HEADER ด้านบนสุด
      ======================================================== */}
      <header className="absolute top-0 left-0 right-0 h-[72px] bg-[#0c1427]/95 border-b border-[#1e293b] backdrop-blur-xl z-40 flex items-center justify-between px-6 pointer-events-auto shadow-md">
        <div className="flex items-center space-x-4">
          <div className="flex space-x-2">
            <div className="w-8 h-8 bg-red-500/20 rounded-full border border-red-500/50 flex items-center justify-center text-[10px] font-bold text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]">BL</div>
            <div className="w-8 h-8 bg-blue-500/20 rounded border border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.3)]"></div>
            <div className="w-8 h-8 bg-green-500/20 rounded border border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.3)]"></div>
          </div>
          <div className="flex flex-col border-l-2 border-gray-600/50 pl-4 ml-2">
            <h1 className="text-[14px] font-bold tracking-wide text-white leading-tight">ระบบสารสนเทศทางภูมิศาสตร์เพื่อ</h1>
            <h2 className="text-[14px] font-bold tracking-wide text-[#38bdf8] leading-tight mt-0.5">การบริหารจัดการสาธารณภัย ต.บ่อหลวง</h2>
          </div>
        </div>
        <div className="hidden md:flex items-center px-4 py-1.5 bg-[#1e293b]/80 border border-gray-600 rounded-full text-[12px] text-gray-300 shadow-inner">
          <span className="mr-2">📍</span> GIS Layers • Bo Luang
        </div>
      </header>

      {/* ========================================================
          📍 แถบข้อมูลแผนที่ด้านล่างซ้าย
      ======================================================== */}
      <div className="absolute bottom-6 left-6 z-40 flex flex-col space-y-2 pointer-events-auto">
        <button className="w-8 h-8 bg-[#0c1427]/90 border border-[#1e293b] rounded-lg flex items-center justify-center text-white hover:bg-[#1e293b] shadow-lg backdrop-blur-md transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
        </button>
        <div className="flex items-center space-x-4 bg-[#0c1427]/90 border border-[#1e293b] rounded-lg px-4 py-2 text-[10px] text-gray-400 shadow-lg backdrop-blur-md">
          <div>Base map: <span className="text-white font-medium">Windy Weather + Dark Matter</span></div>
          <div>CRS: <span className="text-[#38bdf8] font-medium">WGS84</span></div>
          <div className="font-mono text-white bg-[#0f172a] px-2 py-0.5 rounded border border-gray-700">
            {iframeState.lat.toFixed(4)}° N, {iframeState.lng.toFixed(4)}° E
          </div>
        </div>
      </div>

      {/* ========================================================
          📍 แผงควบคุมด้านซ้าย (WEATHER & AIR)
      ======================================================== */}
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
              <CustomToggle label="ปริมาณน้ำฝนสะสม (TMD)" active={tmdRain} onClick={() => setTmdRain(!tmdRain)} dotColor="#06b6d4" />
            </div>
          </div>
          <div>
            <div className="flex items-center mb-4"><div className="flex items-center text-[10px] text-gray-400 tracking-widest font-semibold"><span className="mr-2">≈</span> AIR QUALITY</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
            <div className="pl-1">
              <CustomToggle label="ค่าฝุ่น PM2.5 / AQI" active={pm25} onClick={() => setPm25(!pm25)} dotColor="#0ea5e9" />
            </div>
          </div>
          <div>
            <div className="flex items-center mb-4"><div className="flex items-center text-[10px] text-gray-400 tracking-widest font-semibold"><span className="mr-2">🗺️</span> WINDY WEATHER MAP</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
            <div className="pl-1 mb-4">
              <CustomToggle label="เปิด/ปิดข้อมูลสภาพอากาศ Windy" active={windyLayer} onClick={() => setWindyLayer(!windyLayer)} dotColor="#eab308" />
            </div>
            {windyLayer && (
              <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 mx-1">
                <div className="flex items-center space-x-2 mb-3"><span className="text-[14px]">🌧️</span><span className="text-[12px] font-bold text-white">ข้อมูลสภาพอากาศ Windy</span></div>
                <div className="space-y-2">
                  <div onClick={() => setWindyType('wind')} className={`flex items-center space-x-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none ${windyType === 'wind' ? 'border-[#38bdf8]/40 bg-[#38bdf8]/10' : 'border-gray-700/40 hover:bg-white/5'}`}>
                    <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center ${windyType === 'wind' ? 'border-[#38bdf8]' : 'border-gray-400'}`}>{windyType === 'wind' && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}</div>
                    <span className={`text-[12px] ${windyType === 'wind' ? 'text-white' : 'text-gray-300'}`}>ลม (Wind)</span>
                  </div>
                  <div onClick={() => setWindyType('temp')} className={`flex items-center space-x-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none ${windyType === 'temp' ? 'border-[#38bdf8]/40 bg-[#38bdf8]/10' : 'border-gray-700/40 hover:bg-white/5'}`}>
                    <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center ${windyType === 'temp' ? 'border-[#38bdf8]' : 'border-gray-400'}`}>{windyType === 'temp' && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}</div>
                    <span className={`text-[12px] ${windyType === 'temp' ? 'text-white' : 'text-gray-300'}`}>อุณหภูมิ (Temperature)</span>
                  </div>
                  <div onClick={() => setWindyType('rain')} className={`flex items-center space-x-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none ${windyType === 'rain' ? 'border-[#38bdf8]/40 bg-[#38bdf8]/10' : 'border-gray-700/40 hover:bg-white/5'}`}>
                    <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center ${windyType === 'rain' ? 'border-[#38bdf8]' : 'border-gray-400'}`}>{windyType === 'rain' && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}</div>
                    <span className={`text-[12px] ${windyType === 'rain' ? 'text-white' : 'text-gray-300'}`}>ฝนและฟ้าผ่า (Rain)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ========================================================
          📍 แผงควบคุมด้านขวา (LAYERS)
      ======================================================== */}
      <aside 
        className={`absolute top-24 right-0 z-40 transition-transform duration-500 ease-in-out flex pointer-events-auto ${isRightPanelOpen ? 'translate-x-0' : 'translate-x-[320px]'}`}
      >
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
                <div className="flex items-center space-x-3 mt-2.5 text-[9px] font-medium bg-[#0f172a] border border-[#1e293b] px-2 py-1.5 rounded-md w-fit">
                  <span className="flex items-center text-[#38bdf8]"><span className="w-1.5 h-1.5 bg-[#38bdf8] rounded-full mr-1.5 animate-pulse"></span>Active: 6</span><span className="text-gray-600">|</span><span className="text-gray-300">Zoom: {iframeState.zoom}</span>
                </div>
              </div>
            </div>
            <div className="space-y-5 mt-6">
              
              {/* 🗺️ GIS MAP LAYERS */}
              <div>
                <div className="flex items-center mb-3"><div className="flex items-center text-[10px] text-[#38bdf8] tracking-widest font-semibold"><span className="mr-2">🗺️</span> GIS MAP LAYERS</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
                <div className="space-y-3 pl-1">
                  <CustomToggle label="แผนที่ดาวเทียม (Satellite)" active={satelliteLayer} onClick={() => setSatelliteLayer(!satelliteLayer)} dotColor="#10b981" />
                  <CustomToggle label="ขอบเขตตำบลบ่อหลวง" active={showBoluang} onClick={() => setShowBoluang(!showBoluang)} dotColor="#38bdf8" />
                  <CustomToggle label="ขอบเขต 13 หมู่บ้าน (ชี้เพื่อดูชื่อ)" active={showBlock} onClick={() => setShowBlock(!showBlock)} dotColor="#fcd34d" />
                </div>
              </div>

              {/* 🔒 LAND RECORDS */}
              <div>
                <div className="flex items-center mb-3"><div className="flex items-center text-[10px] text-green-400 tracking-widest font-semibold"><span className="mr-2">🔒</span> LAND RECORDS</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
                <div className="flex items-center justify-between pl-1">
                  <CustomToggle label="แปลงที่ดินรายบุคคล" active={showParcel} onClick={() => setShowParcel(!showParcel)} dotColor="#4ade80" />
                  <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30">Admin Only</span>
                </div>
              </div>

              {/* 📝 REPORT TOOL */}
              <div>
                <div className="flex items-center mb-3"><div className="flex items-center text-[10px] text-[#fb923c] tracking-widest font-semibold"><span className="mr-2 text-transparent">v</span> REPORT TOOL</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
                <div className="px-1"><button className="w-full py-2.5 bg-gradient-to-r from-[#fb923c] to-[#f97316] hover:from-[#f97316] hover:to-[#ea580c] rounded-lg text-[13px] font-medium text-white shadow-[0_4px_15px_rgba(249,115,22,0.3)] flex items-center justify-center space-x-2 transition-all active:scale-95"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg><span>สแกนแจ้งปัญหา (เชื่อม Supabase)</span></button></div>
              </div>

              {/* 🚨 HAZARD & REPORTS */}
              <div>
                <div className="flex items-center mb-4"><div className="flex items-center text-[10px] text-[#f97316] tracking-widest font-semibold"><span className="mr-2">🚨</span> HAZARD & REPORTS</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
                <div className="space-y-4 pl-1">
                  <CustomToggle label="จุดแจ้งปัญหาประชาชน (สีแดง)" active={citizenReport} onClick={() => setCitizenReport(!citizenReport)} dotColor="#ef4444" />
                  <CustomToggle label="จุดเสี่ยงดินถล่ม (สีเหลือง/ส้ม)" active={landslide} onClick={() => setLandslide(!landslide)} dotColor="#eab308" />
                  <CustomToggle label="จุดความร้อน Hotspot (สีส้ม)" active={hotspot} onClick={() => setHotspot(!hotspot)} dotColor="#f97316" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

    </main>
  );
}
