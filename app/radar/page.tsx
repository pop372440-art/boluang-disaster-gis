'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { useMapEvents } from 'react-leaflet';

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then((mod) => mod.GeoJSON), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false });

const ClickableMap = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
};

export default function RadarPage() {
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [radarData, setRadarData] = useState<any>(null);
  
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  
  // 🎛️ State จัดการชั้นข้อมูล
  const [mapStyle, setMapStyle] = useState<'light' | 'terrain' | 'satellite' | 'dark'>('dark');
  const [showRadar, setShowRadar] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.7);
  const [showBoluang, setShowBoluang] = useState(true);
  const [showBlock, setShowBlock] = useState(false);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(true);
  
  // 📍 State สำหรับระบบ Interactive Popup
  const [clickedLocation, setClickedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [forecastData, setForecastData] = useState<any>(null);
  const [isFetchingForecast, setIsFetchingForecast] = useState(false);

  // 🌟 State สำหรับสถาปัตยกรรมใหม่ (Top Bar & Stats)
  const [isTopHeaderVisible, setIsTopHeaderVisible] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const mapRef = useRef<any>(null);

  const center = { lat: 18.1633, lng: 98.3744 };

  useEffect(() => {
    fetch('/geojson/boluang.json').then(res => res.json()).then(data => setGeoBoluang(data)).catch(() => {});
    fetch('/geojson/block.json').then(res => res.json()).then(data => setGeoBlock(data)).catch(() => {});
    
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(res => res.json())
      .then(data => {
        const combinedFrames = [...(data.radar.past || []), ...(data.radar.nowcast || [])];
        setRadarData({ host: data.host, frames: combinedFrames, pastCount: data.radar.past.length });
        setCurrentFrameIndex(data.radar.past.length - 1);
      }).catch(err => console.error(err));
  }, []);

  useEffect(() => {
    let interval: any;
    if (isPlaying && radarData?.frames?.length > 0) {
      interval = setInterval(() => {
        setCurrentFrameIndex((prevIndex) => {
          const nextIndex = prevIndex + 1;
          if (nextIndex >= radarData.frames.length) { setIsPlaying(false); return prevIndex; }
          return nextIndex;
        });
      }, 1500); 
    }
    return () => clearInterval(interval);
  }, [isPlaying, radarData]);

  const getBasemapUrl = () => {
    switch (mapStyle) {
      case 'light': return "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
      case 'terrain': return "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}";
      case 'satellite': return "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
      case 'dark': default: return "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
    }
  };

  const handleMapClick = async (lat: number, lng: number) => {
    setClickedLocation({ lat, lng });
    setIsFetchingForecast(true);
    setForecastData(null);
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation,weathercode&timezone=Asia%2FBangkok&forecast_days=2`);
      const data = await res.json();
      const now = new Date();
      const currentHourStr = now.toISOString().slice(0, 13) + ":00"; 
      let currentIndex = data.hourly.time.findIndex((t: string) => t.includes(currentHourStr));
      if (currentIndex === -1) currentIndex = 0;

      const next3Hours = [
        { time: new Date(data.hourly.time[currentIndex + 1]), rain: data.hourly.precipitation[currentIndex + 1], code: data.hourly.weathercode[currentIndex + 1] },
        { time: new Date(data.hourly.time[currentIndex + 2]), rain: data.hourly.precipitation[currentIndex + 2], code: data.hourly.weathercode[currentIndex + 2] },
        { time: new Date(data.hourly.time[currentIndex + 3]), rain: data.hourly.precipitation[currentIndex + 3], code: data.hourly.weathercode[currentIndex + 3] }
      ];

      const totalRain = next3Hours.reduce((sum, h) => sum + h.rain, 0);
      setForecastData({ isRaining: totalRain > 0.5, totalRain, hours: next3Hours });
    } catch (error) { console.error(error); } finally { setIsFetchingForecast(false); }
  };

  const getRainText = (rainMm: number) => {
    if (rainMm <= 0.1) return { text: 'ไม่มีฝน', color: 'text-gray-400', icon: '☀️' };
    if (rainMm <= 2.5) return { text: 'ฝนเล็กน้อย', color: 'text-green-400', icon: '🌦️' };
    if (rainMm <= 10.0) return { text: 'ฝนปานกลาง', color: 'text-yellow-400', icon: '🌧️' };
    return { text: 'ฝนตกหนัก', color: 'text-red-500', icon: '⛈️' };
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleGoHome = () => mapRef.current?.flyTo([center.lat, center.lng], 12, { duration: 1.5 });

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const customPinIcon = L ? L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-8 h-8"><div class="absolute inset-0 bg-blue-500 rounded-full blur-[4px] opacity-60 animate-ping"></div><div class="relative flex items-center justify-center w-5 h-5 bg-[#38bdf8] border-2 border-white rounded-full shadow-lg z-10"></div></div>`, iconSize: [32, 32], iconAnchor: [16, 16] }) : null;

  const activeFrame = radarData?.frames[currentFrameIndex];
  const radarUrl = (showRadar && activeFrame) ? `${radarData.host}${activeFrame.path}/256/{z}/{x}/{y}/4/1_1.png` : '';
  const isNowcast = currentFrameIndex >= (radarData?.pastCount || 0);
  const displayDate = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY

  return (
    <div className="relative w-screen h-screen bg-[#111319] overflow-hidden font-sans text-white flex flex-col select-none">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: #111319 !important; cursor: crosshair !important; }
        .dark-map { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%); }
        .onwr-panel { background: #232732; border: 1px solid #333946; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
        .onwr-checkbox { appearance: none; width: 16px; height: 16px; border: 2px solid #4B5563; border-radius: 4px; background: transparent; cursor: pointer; position: relative; }
        .onwr-checkbox:checked { background: #4178F3; border-color: #4178F3; }
        .onwr-checkbox:checked::after { content: ''; position: absolute; left: 4px; top: 1px; width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
        .onwr-slider { -webkit-appearance: none; width: 100%; height: 4px; background: #333946; border-radius: 2px; outline: none; }
        .onwr-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #4178F3; cursor: pointer; box-shadow: 0 0 5px rgba(65, 120, 243, 0.8); }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #4B5563; border-radius: 4px; }
      `}} />

      {/* 🚀 พื้นที่ Trigger สำหรับซ่อน/แสดง Top Bar (อยู่ขอบบนสุดของจอ) */}
      <div 
        className="absolute top-0 left-0 w-full h-8 z-[1999]" 
        onMouseEnter={() => setIsTopHeaderVisible(true)}
      />

      {/* 🌟 THE ONWR ARCHITECTURE: Hoverable Top Bar */}
      <header 
        className={`absolute top-0 left-1/2 transform -translate-x-1/2 w-[98%] max-w-[1200px] h-[70px] bg-white rounded-b-2xl z-[2000] flex items-center justify-between px-6 shadow-2xl transition-transform duration-500 ease-in-out border-b border-x border-gray-200 ${isTopHeaderVisible ? 'translate-y-0' : '-translate-y-full'}`}
        onMouseLeave={() => setIsTopHeaderVisible(false)}
      >
        <div className="flex items-center space-x-4">
          <div className="flex space-x-2">
            {/* โลโก้จำลอง สทนช / กรมอุตุ */}
            <div className="w-10 h-10 bg-blue-50 rounded-full border border-blue-100 flex items-center justify-center p-1.5"><img src="/Logogis3.png" alt="Logo 1" className="w-full h-full object-contain opacity-80" /></div>
            <div className="w-10 h-10 bg-green-50 rounded-full border border-green-100 flex items-center justify-center p-1.5"><img src="/Logogis3.png" alt="Logo 2" className="w-full h-full object-contain opacity-80" /></div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-[16px] font-bold tracking-wide text-[#1E3A8A]">TMD RADAR COMPOSITE - NOWCASTING 3 ชั่วโมง ล่วงหน้า</h1>
            <p className="text-[11px] text-gray-500">เทศบาลตำบลบ่อหลวง จ.เชียงใหม่</p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-sm">
          <span className="text-gray-500 font-bold mr-2 text-[12px]">ข้อมูล ณ วันที่:</span>
          
          {/* วันที่และเวลา */}
          <div className="flex items-center px-3 py-1.5 bg-blue-50 border border-blue-200 text-[#1E3A8A] rounded-lg font-mono font-bold space-x-2 cursor-not-allowed">
            <span>{displayDate}</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
          
          <span className="text-gray-500 font-bold mx-1 text-[12px]">เวลา:</span>
          <div className="flex items-center px-3 py-1.5 bg-blue-50 border border-blue-200 text-[#1E3A8A] rounded-lg font-mono font-bold space-x-2 cursor-not-allowed">
            <span>{activeFrame ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'} น.</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>

          {/* ปุ่มควบคุม (ปัจจุบัน & สถิติ) */}
          <button className="flex items-center px-4 py-1.5 bg-gray-100 border border-gray-200 text-gray-400 rounded-lg font-bold space-x-2 cursor-not-allowed ml-2">
            <span className="w-2 h-2 rounded-full bg-gray-400"></span>
            <span>ปัจจุบัน</span>
          </button>

          <button 
            onClick={() => setIsStatsModalOpen(true)}
            className="flex items-center px-4 py-1.5 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 rounded-lg font-bold space-x-2 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            <span>สถิติ</span>
          </button>
          
          <button onClick={() => { if(window.history.length > 1) window.close(); else window.location.href = '/'; }} className="ml-2 w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-red-500 rounded-full text-gray-500 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        {/* หูจับ Pull-down */}
        <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-16 h-4 bg-white rounded-b-xl border-b border-x border-gray-200 flex items-center justify-center cursor-pointer shadow-md">
          <div className="w-6 h-1 bg-gray-300 rounded-full"></div>
        </div>
      </header>

      {/* ถ้าแผงปิดอยู่ ให้โชว์หูจับให้รู้ว่ามีเมนูซ่อนอยู่ */}
      {!isTopHeaderVisible && (
        <div 
          className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-3 bg-white/50 backdrop-blur-md rounded-b-xl border-b border-x border-white/20 flex items-center justify-center cursor-pointer shadow-md z-[1500] hover:h-4 transition-all"
          onMouseEnter={() => setIsTopHeaderVisible(true)}
        >
          <div className="w-6 h-1 bg-gray-400/50 rounded-full"></div>
        </div>
      )}

      <div className="relative flex-1">
        
        {/* 🗺️ แผนที่หลัก */}
        <div className="absolute inset-0 z-0">
          <MapContainer center={[center.lat, center.lng]} zoom={11} maxZoom={20} zoomControl={false} attributionControl={false} className="w-full h-full" ref={mapRef}>
            <TileLayer url={getBasemapUrl()} maxZoom={20} className={mapStyle === 'dark' ? 'dark-map' : ''} />
            {showBoluang && geoBoluang && <GeoJSON data={geoBoluang} style={{ color: '#E5E7EB', weight: 1.5, fill: false, opacity: 0.8, dashArray: '4,4' }} />}
            {showBlock && geoBlock && <GeoJSON data={geoBlock} style={{ color: '#F59E0B', weight: 1, fill: false, opacity: 0.4 }} />}
            {radarUrl && <TileLayer key={activeFrame?.path} url={radarUrl} opacity={radarOpacity} zIndex={100} maxNativeZoom={12} maxZoom={20} />}
            <ClickableMap onMapClick={handleMapClick} />
            {clickedLocation && customPinIcon && <Marker position={[clickedLocation.lat, clickedLocation.lng]} icon={customPinIcon} />}
          </MapContainer>
        </div>

        {/* 🎛️ แผงจัดการชั้นข้อมูล */}
        {isLayerMenuOpen && (
          <div className="absolute top-8 left-4 z-[1000] w-[260px] onwr-panel flex flex-col pointer-events-auto">
            <div className="px-4 py-3 border-b border-[#333946] flex justify-between items-center bg-[#232732] rounded-t-lg">
              <h3 className="text-[13px] font-bold text-[#E5E7EB]">จัดการชั้นข้อมูล</h3>
              <button onClick={() => setIsLayerMenuOpen(false)} className="text-[#8B94A5] hover:text-white"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-4 space-y-5">
              <div className="grid grid-cols-4 gap-2">
                {[{ id: 'light', name: 'Light', bg: 'bg-[#E5E7EB]' }, { id: 'terrain', name: 'Terrain', bg: 'bg-[#8F9779]' }, { id: 'satellite', name: 'Satellite', bg: 'bg-[#2D4C1E]' }, { id: 'dark', name: 'Dark', bg: 'bg-[#1A1D24]' }].map(bg => (
                  <div key={bg.id} onClick={() => setMapStyle(bg.id as any)} className={`flex flex-col items-center justify-center p-1 rounded-lg border cursor-pointer transition-all ${mapStyle === bg.id ? 'bg-[#292E38] border-[#4178F3]' : 'border-transparent hover:bg-[#292E38]'}`}>
                    <div className={`w-full h-8 ${bg.bg} rounded-md border border-[#333946] mb-1.5 opacity-90`}></div>
                    <span className={`text-[9px] font-bold ${mapStyle === bg.id ? 'text-[#4178F3]' : 'text-[#8B94A5]'}`}>{bg.name}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <div className="flex flex-col space-y-2">
                  <label className="flex items-center space-x-3 cursor-pointer group">
                    <input type="checkbox" checked={showRadar} onChange={(e) => setShowRadar(e.target.checked)} className="onwr-checkbox" />
                    <span className="text-[13px] font-medium text-[#D1D5DB] group-hover:text-white">เรดาร์คอมโพสิต</span>
                  </label>
                  {showRadar && (
                    <div className="pl-7 pr-2 flex items-center space-x-2">
                      <span className="text-[10px] text-gray-500">จาง</span>
                      <input type="range" min="0" max="1" step="0.1" value={radarOpacity} onChange={(e) => setRadarOpacity(parseFloat(e.target.value))} className="onwr-slider flex-1" />
                      <span className="text-[10px] text-gray-500">เข้ม</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-[#333946]"></div>
                <label className="flex items-center space-x-3 cursor-pointer group"><input type="checkbox" checked={showBoluang} onChange={(e) => setShowBoluang(e.target.checked)} className="onwr-checkbox" /><span className="text-[13px] font-medium text-[#D1D5DB] group-hover:text-white">ขอบเขตตำบลบ่อหลวง</span></label>
                <label className="flex items-center space-x-3 cursor-pointer group"><input type="checkbox" checked={showBlock} onChange={(e) => setShowBlock(e.target.checked)} className="onwr-checkbox" /><span className="text-[13px] font-medium text-[#D1D5DB] group-hover:text-white">โซนหมู่บ้าน</span></label>
              </div>
            </div>
          </div>
        )}

        {!isLayerMenuOpen && (
          <button onClick={() => setIsLayerMenuOpen(true)} className="absolute top-8 left-4 z-[1000] p-2 bg-[#232732] border border-[#333946] rounded-lg shadow-md hover:bg-[#2D323B] transition-colors pointer-events-auto text-[#8B94A5] hover:text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
        )}

        {/* 🌟 Popup พยากรณ์อากาศแบบ ONWR */}
        {clickedLocation && (
          <div className="absolute top-16 right-4 z-[1050] w-[320px] onwr-panel flex flex-col pointer-events-auto shadow-2xl">
            <div className="px-4 py-3 border-b border-[#333946] flex justify-between items-center bg-[#1A1D24] rounded-t-lg">
              <div className="flex items-center space-x-2">
                <span className="text-[14px]">📌</span>
                <div>
                  <h3 className="text-[12px] font-bold text-[#E5E7EB] leading-tight">ตำแหน่งของคุณ</h3>
                  <p className="text-[10px] text-[#8B94A5] font-mono">{clickedLocation.lat.toFixed(6)}, {clickedLocation.lng.toFixed(6)}</p>
                </div>
              </div>
              <button onClick={() => setClickedLocation(null)} className="text-[#EF4444] hover:text-red-400 bg-red-500/10 p-1 rounded-md transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <div className="p-4 bg-[#232732] rounded-b-lg">
              {isFetchingForecast ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <svg className="animate-spin h-6 w-6 text-[#4178F3] mb-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <p className="text-[12px] text-[#8B94A5] font-bold animate-pulse">กำลังประมวลผลโมเดล...</p>
                </div>
              ) : forecastData ? (
                <>
                  <div className={`p-3 rounded-lg border ${forecastData.isRaining ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-green-500/10 border-green-500/30'} mb-4`}>
                    <div className="flex items-center space-x-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${forecastData.isRaining ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`}></span>
                      <h4 className={`text-[13px] font-bold ${forecastData.isRaining ? 'text-yellow-400' : 'text-green-400'}`}>{forecastData.isRaining ? 'คาดว่าจะมีฝน' : 'ไม่มีฝน'} (ใน 3 ชม. ข้างหน้า)</h4>
                    </div>
                    <p className="text-[11px] text-[#D1D5DB] mt-1.5 ml-4">{forecastData.isRaining ? 'สภาพอากาศแปรปรวน ท้องฟ้าครึ้ม' : 'สภาพอากาศปกติ ท้องฟ้าโปร่ง'}</p>
                  </div>
                  <h5 className="text-[11px] font-bold text-[#8B94A5] mb-2">พยากรณ์ล่วงหน้า 3 ชั่วโมง</h5>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {forecastData.hours.map((h: any, idx: number) => {
                      const rainInfo = getRainText(h.rain);
                      return (
                        <div key={idx} className="bg-[#1A1D24] border border-[#333946] rounded-lg p-2 flex flex-col items-center justify-center text-center">
                          <span className="text-[10px] text-[#8B94A5] font-bold mb-1">+{idx + 1} ชม.</span>
                          <span className="text-[18px] mb-1">{rainInfo.icon}</span>
                          <span className="text-[10px] font-mono text-[#E5E7EB]">{h.time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span>
                          <span className={`text-[10px] font-bold mt-1 ${rainInfo.color}`}>{rainInfo.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center py-4 text-[#8B94A5] text-[12px]">คลิกพื้นที่เพื่อดูข้อมูล</div>
              )}
            </div>
          </div>
        )}

        {/* 🌟 THE ONWR ARCHITECTURE: Map Controls (Bottom Right) */}
        <div className="absolute bottom-[100px] md:bottom-24 right-4 z-[900] flex flex-col space-y-2 pointer-events-auto">
          <div className="bg-[#1A1D24]/90 backdrop-blur-md border border-[#333946] rounded-xl flex flex-col overflow-hidden shadow-lg">
            <button onClick={handleGoHome} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2D323B] transition-colors border-b border-[#333946]" title="กลับจุดเริ่มต้น">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </button>
            <button onClick={handleZoomIn} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2D323B] transition-colors border-b border-[#333946]" title="ซูมเข้า">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v12m-6-6h12" /></svg>
            </button>
            <button onClick={handleZoomOut} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2D323B] transition-colors" title="ซูมออก">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
            </button>
          </div>
        </div>

        {/* 📊 Legend แถบสี */}
        <div className="absolute bottom-[100px] md:bottom-6 left-4 z-[900] pointer-events-auto hidden md:block">
          <div className="onwr-panel px-3 py-4 w-[130px]">
            <div className="text-center mb-4">
              <h3 className="text-[11px] font-bold text-[#E5E7EB]">Radar Composite</h3>
              <p className="text-[9px] text-[#8B94A5]">dBZ / mm/hr</p>
            </div>
            <div className="flex relative">
              <div className="w-3 rounded-full mr-3 border border-[#333946]" style={{ background: 'linear-gradient(to bottom, #990099, #FF0000, #FF6600, #FFCC00, #33CC33, #0099FF, #00FFFF)', height: '180px' }}></div>
              <div className="flex flex-col justify-between h-[180px] text-[10px] font-mono text-[#8B94A5] py-1">
                <span className="text-[#990099] font-bold">100+</span>
                <span className="text-[#FF0000]">50.0</span>
                <span className="text-[#FF6600]">25.0</span>
                <span className="text-[#FFCC00]">10.0</span>
                <span className="text-[#33CC33]">2.5</span>
                <span className="text-[#0099FF]">1.0</span>
                <span className="text-[#00FFFF]">0.1</span>
              </div>
            </div>
          </div>
        </div>

        {/* 🎛️ แผงควบคุมเวลา Timeline Player */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-[550px] z-[1000] pointer-events-auto">
          <div className="onwr-panel py-3 px-5 flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0 md:space-x-4">
            <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-start">
              <div className="flex flex-col">
                <span className="text-[13px] font-bold text-[#E5E7EB]">TMD Radar Composite</span>
                <div className="flex items-center mt-0.5 space-x-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isNowcast ? 'bg-[#F59E0B]' : 'bg-[#4178F3]'} ${isPlaying ? 'animate-pulse' : ''}`}></span>
                  <span className="text-[10px] font-bold text-[#8B94A5] uppercase tracking-wider">{isNowcast ? 'Nowcasting' : 'Past'}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center flex-1 w-full space-x-3">
              <button onClick={() => { setIsPlaying(!isPlaying); if(!isPlaying && currentFrameIndex >= radarData?.frames?.length - 1) setCurrentFrameIndex(0); }} className="text-[#8B94A5] hover:text-[#4178F3] transition-colors focus:outline-none">
                {isPlaying ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              
              <div className="flex-1 relative flex items-center h-6">
                <input type="range" min="0" max={(radarData?.frames?.length || 1) - 1} value={currentFrameIndex} onChange={(e) => { setIsPlaying(false); setCurrentFrameIndex(parseInt(e.target.value)); }} className="w-full onwr-slider z-10" />
                {radarData && <div className="absolute h-3 w-[2px] bg-[#F59E0B] z-0 rounded-full" style={{ left: `${((radarData.pastCount - 1) / (radarData.frames.length - 1)) * 100}%` }}></div>}
              </div>
              
              <div className="text-[#4178F3] font-mono font-bold text-[14px] min-w-[65px] text-right">
                {activeFrame ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'} น.
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 🌟 THE ONWR ARCHITECTURE: Statistics Modal */}
      {isStatsModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-2xl w-[90%] max-w-[500px] shadow-2xl overflow-hidden flex flex-col animate-fade-in">
            {/* Header */}
            <div className="px-5 py-4 flex justify-between items-center border-b border-gray-100">
              <h2 className="text-[16px] font-bold text-gray-800">สถิติการใช้งาน</h2>
              <div className="flex items-center space-x-4">
                <span className="text-[11px] text-gray-500 font-mono">อัปเดต: {new Date().toLocaleTimeString('th-TH')} น.</span>
                <button onClick={() => setIsStatsModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 flex-1 overflow-y-auto">
              {/* Tabs */}
              <div className="flex space-x-6 border-b border-gray-100 mb-5">
                <button className="text-blue-600 font-bold border-b-2 border-blue-600 pb-2 text-[13px]">วันนี้</button>
                <button className="text-gray-400 hover:text-gray-600 font-medium pb-2 text-[13px]">รายเดือน</button>
                <button className="text-gray-400 hover:text-gray-600 font-medium pb-2 text-[13px]">รายปี</button>
                <button className="text-gray-400 hover:text-gray-600 font-medium pb-2 text-[13px]">ทั้งหมด</button>
              </div>

              {/* 4 Cards */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                  <p className="text-[11px] text-blue-600 font-bold mb-1">ยอดเข้าชมสะสม</p>
                  <p className="text-[20px] font-black text-gray-800">3,193</p>
                  <p className="text-[10px] text-gray-500">ครั้ง (ทั้งหมด)</p>
                </div>
                <div className="bg-green-50/50 border border-green-100 rounded-xl p-3">
                  <p className="text-[11px] text-green-600 font-bold mb-1">จำนวนผู้เข้าชมสะสม</p>
                  <p className="text-[20px] font-black text-gray-800">2,592</p>
                  <p className="text-[10px] text-gray-500">คน (ทั้งหมด)</p>
                </div>
                <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-3">
                  <p className="text-[11px] text-purple-600 font-bold mb-1">ยอดเข้าชมวันนี้</p>
                  <p className="text-[20px] font-black text-gray-800">951</p>
                  <p className="text-[10px] text-gray-500">ครั้ง (วันนี้)</p>
                </div>
                <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-3">
                  <p className="text-[11px] text-orange-600 font-bold mb-1">จำนวนผู้เข้าชมวันนี้</p>
                  <p className="text-[20px] font-black text-gray-800">757</p>
                  <p className="text-[10px] text-gray-500">คน (วันนี้)</p>
                </div>
              </div>

              {/* Mock Bar Chart */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-[12px] font-bold text-gray-800">สถิติรายวัน (14 วันล่าสุด)</h4>
                  <div className="flex items-center space-x-3 text-[10px] text-gray-500">
                    <span className="flex items-center"><span className="w-2 h-2 bg-blue-500 mr-1 rounded-sm"></span> ยอดเข้าชม</span>
                    <span className="flex items-center"><span className="w-2 h-2 bg-purple-500 mr-1 rounded-sm"></span> ผู้เข้าชม</span>
                  </div>
                </div>
                {/* CSS Bar Chart Simulation */}
                <div className="h-24 flex items-end justify-around border-b border-gray-200 pb-1">
                  <div className="w-8 flex justify-center items-end space-x-1"><div className="w-3 bg-blue-500 h-[40%] rounded-t-sm"></div><div className="w-3 bg-purple-500 h-[35%] rounded-t-sm"></div></div>
                  <div className="w-8 flex justify-center items-end space-x-1"><div className="w-3 bg-blue-500 h-[70%] rounded-t-sm"></div><div className="w-3 bg-purple-500 h-[60%] rounded-t-sm"></div></div>
                  <div className="w-8 flex justify-center items-end space-x-1"><div className="w-3 bg-blue-500 h-[100%] rounded-t-sm"></div><div className="w-3 bg-purple-500 h-[85%] rounded-t-sm"></div></div>
                  <div className="w-8 flex justify-center items-end space-x-1"><div className="w-3 bg-blue-500 h-[50%] rounded-t-sm"></div><div className="w-3 bg-purple-500 h-[45%] rounded-t-sm"></div></div>
                </div>
                <div className="flex justify-around text-[9px] text-gray-400 mt-1 font-mono">
                  <span>8/9/69</span><span>9/9/69</span><span>10/9/69</span><span>11/9/69</span>
                </div>
              </div>

              {/* Device Stats */}
              <div>
                <h4 className="text-[12px] font-bold text-gray-800 mb-2">📱 สัดส่วนอุปกรณ์ (Devices)</h4>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex mb-2">
                  <div className="h-full bg-blue-500 w-[60%]"></div>
                  <div className="h-full bg-orange-400 w-[10%]"></div>
                  <div className="h-full bg-emerald-500 w-[30%]"></div>
                </div>
                <div className="flex justify-between text-[10px] text-gray-600">
                  <span className="flex items-center"><span className="w-2 h-2 bg-blue-500 rounded-full mr-1"></span> มือถือ 60%</span>
                  <span className="flex items-center"><span className="w-2 h-2 bg-orange-400 rounded-full mr-1"></span> แท็บเล็ต 10%</span>
                  <span className="flex items-center"><span className="w-2 h-2 bg-emerald-500 rounded-full mr-1"></span> เดสก์ท็อป 30%</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
