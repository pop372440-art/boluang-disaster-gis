'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { useMapEvents } from 'react-leaflet';
import { createClient } from '@supabase/supabase-js';

// 🌟 ตั้งค่า Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then((mod) => mod.GeoJSON), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false });

const ClickableMap = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
};

const mockProvincialRainData = [
  { id: 1, prov: 'ตราด', acc: 9.4, avg: 0.3, area: 8, peak: '11:30' },
  { id: 2, prov: 'ระยอง', acc: 6.8, avg: 0.2, area: 4, peak: '11:30' },
  { id: 3, prov: 'ตรัง', acc: 6.0, avg: 0.6, area: 18, peak: '11:45' },
  { id: 4, prov: 'กระบี่', acc: 5.6, avg: 0.2, area: 3, peak: '11:30' },
  { id: 5, prov: 'สตูล', acc: 5.3, avg: 1.8, area: 66, peak: '11:30' },
  { id: 6, prov: 'พัทลุง', acc: 4.3, avg: 0.1, area: 5, peak: '11:30' },
  { id: 7, prov: 'พังงา', acc: 3.4, avg: 0.2, area: 7, peak: '12:30' },
  { id: 8, prov: 'สงขลา', acc: 3.2, avg: 0.1, area: 1, peak: '13:45' },
  { id: 9, prov: 'แม่ฮ่องสอน', acc: 3.1, avg: 0.1, area: 2, peak: '12:45' },
  { id: 10, prov: 'นครสวรรค์', acc: 2.9, avg: 0.1, area: 3, peak: '11:30' },
  { id: 11, prov: 'ยะลา', acc: 2.5, avg: 0.6, area: 21, peak: '11:30' },
  { id: 12, prov: 'ระนอง', acc: 2.4, avg: 0.7, area: 26, peak: '13:00' },
  { id: 13, prov: 'ชุมพร', acc: 2.2, avg: 0.4, area: 8, peak: '13:00' },
  { id: 14, prov: 'ราชบุรี', acc: 2.2, avg: 0.2, area: 5, peak: '11:30' },
  { id: 15, prov: 'เพชรบุรี', acc: 1.9, avg: 0.1, area: 2, peak: '12:00' },
  { id: 16, prov: 'สุรินทร์', acc: 1.6, avg: 0.0, area: 1, peak: '11:30' },
  { id: 17, prov: 'เชียงใหม่', acc: 1.4, avg: 0.0, area: 0, peak: '11:30' },
  { id: 18, prov: 'ประจวบคีรีขันธ์', acc: 1.4, avg: 0.1, area: 1, peak: '11:30' },
];

export default function RadarPage() {
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [radarData, setRadarData] = useState<any>(null);
  
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  
  const [mapStyle, setMapStyle] = useState<'light' | 'terrain' | 'satellite' | 'dark'>('dark');
  const [showRadar, setShowRadar] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.7);
  const [showBoluang, setShowBoluang] = useState(true);
  const [showBlock, setShowBlock] = useState(false);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(true);
  const [isTablePanelOpen, setIsTablePanelOpen] = useState(true);
  
  const [clickedLocation, setClickedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [forecastData, setForecastData] = useState<any>(null);
  const [isFetchingForecast, setIsFetchingForecast] = useState(false);
  const [isTopHeaderVisible, setIsTopHeaderVisible] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  
  const [realStats, setRealStats] = useState({
    totalVisits: 0, totalUniqueVisitors: 0, todayVisits: 0, todayUniqueVisitors: 0, isLoading: true
  });
  
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
    if (isStatsModalOpen) {
      const fetchRealStats = async () => {
        setRealStats(prev => ({ ...prev, isLoading: true }));
        try {
          const { data: allLogs, error: allLogsError } = await supabase.from('visitor_logs').select('session_id, visited_at');
          if (allLogsError) throw allLogsError;

          const totalVisits = allLogs.length;
          const uniqueSessions = new Set(allLogs.map(log => log.session_id));
          const totalUniqueVisitors = uniqueSessions.size;

          const today = new Date();
          today.setHours(0, 0, 0, 0); 
          const todayLogs = allLogs.filter(log => new Date(log.visited_at) >= today);
          const todayVisits = todayLogs.length;
          const todayUniqueSessions = new Set(todayLogs.map(log => log.session_id));
          const todayUniqueVisitors = todayUniqueSessions.size;

          setRealStats({ totalVisits, totalUniqueVisitors, todayVisits, todayUniqueVisitors, isLoading: false });
        } catch (error) {
          console.error("Error fetching stats:", error);
          setRealStats(prev => ({ ...prev, isLoading: false }));
        }
      };
      fetchRealStats();
    }
  }, [isStatsModalOpen]);

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
  const displayDate = new Date().toLocaleDateString('en-GB'); 

  // =====================================
  // UI Components
  // =====================================
  const LayerToggle = ({ label, checked, onChange, hasLabelToggle = false, hasConfig = true, isRadioGroup = null }: any) => (
    <div className="flex items-center justify-between group py-1">
      <label className="flex items-center space-x-3 cursor-pointer flex-1">
        <input type="checkbox" checked={checked} onChange={onChange} className="onwr-checkbox" />
        <span className="text-[12px] font-medium text-[#D1D5DB] group-hover:text-white transition-colors truncate">{label}</span>
      </label>
      <div className="flex items-center space-x-2 shrink-0">
        {isRadioGroup && (
          <div className="flex bg-[#111319] rounded border border-[#333946] overflow-hidden">
            <button className="px-2 py-0.5 text-[9px] bg-[#4178F3]/20 text-[#4178F3] font-bold">จุด</button>
            <button className="px-2 py-0.5 text-[9px] text-gray-400 hover:bg-[#2D323B]">Heat</button>
          </div>
        )}
        {hasLabelToggle && (
          <label className="flex items-center space-x-1.5 cursor-pointer bg-[#1A1D24] border border-[#333946] px-1.5 py-0.5 rounded hover:bg-[#2D323B] transition-colors">
            <input type="checkbox" className="w-3 h-3 rounded-sm bg-[#111319] border-gray-600 checked:bg-[#4178F3]" defaultChecked={hasLabelToggle === 'checked'} />
            <span className="text-[9px] text-gray-400">ป้าย</span>
          </label>
        )}
        {hasConfig && (
          <button className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative w-screen h-screen bg-[#111319] overflow-hidden font-sans text-white flex flex-col select-none">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: #111319 !important; cursor: crosshair !important; }
        .dark-map { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%); }
        .onwr-panel { background: #1A1D24; border: 1px solid #333946; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.7); }
        .onwr-checkbox { appearance: none; width: 14px; height: 14px; border: 2px solid #4B5563; border-radius: 4px; background: transparent; cursor: pointer; position: relative; transition: all 0.2s; }
        .onwr-checkbox:checked { background: #4178F3; border-color: #4178F3; }
        .onwr-checkbox:checked::after { content: ''; position: absolute; left: 3.5px; top: 0.5px; width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
        .onwr-slider { -webkit-appearance: none; width: 100%; height: 4px; background: #333946; border-radius: 2px; outline: none; }
        .onwr-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #4178F3; cursor: pointer; border: 2px solid #1A1D24; box-shadow: 0 0 8px rgba(65, 120, 243, 0.8); }
        .onwr-scroll::-webkit-scrollbar { width: 6px; }
        .onwr-scroll::-webkit-scrollbar-track { background: #111319; border-radius: 4px; }
        .onwr-scroll::-webkit-scrollbar-thumb { background: #333946; border-radius: 4px; }
        .onwr-scroll::-webkit-scrollbar-thumb:hover { background: #4B5563; }
      `}} />

      {/* 🚀 Hoverable Top Bar (UPGRADED to 10/10 Dark Glassmorphism) */}
      <div className="absolute top-0 left-0 w-full h-8 z-[1999]" onMouseEnter={() => setIsTopHeaderVisible(true)} />
      <header className={`absolute top-0 left-1/2 transform -translate-x-1/2 w-[98%] max-w-[1200px] h-[76px] bg-[#1A1D24]/90 backdrop-blur-xl rounded-b-2xl z-[2000] flex items-center justify-between px-6 shadow-[0_15px_50px_rgba(0,0,0,0.6)] transition-transform duration-500 ease-in-out border-b border-x border-[#333946] ${isTopHeaderVisible ? 'translate-y-0' : '-translate-y-full'}`} onMouseLeave={() => setIsTopHeaderVisible(false)}>
        
        {/* Left Side: Logo & Titles */}
        <div className="flex items-center space-x-5">
          <div className="flex space-x-2.5">
            <div className="w-11 h-11 bg-[#111319] rounded-full border border-[#333946] flex items-center justify-center p-1.5 shadow-inner"><img src="/Logogis3.png" alt="Logo" className="w-full h-full object-contain opacity-90" /></div>
            <div className="w-11 h-11 bg-[#111319] rounded-full border border-[#333946] flex items-center justify-center p-1.5 shadow-inner"><img src="/Logogis3.png" alt="Logo" className="w-full h-full object-contain opacity-90" /></div>
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-[15px] md:text-[16px] font-extrabold tracking-wide text-[#E5E7EB]">TMD RADAR COMPOSITE <span className="text-[#4178F3] mx-1">•</span> <span className="font-medium text-[#D1D5DB]">NOWCASTING 3 ชั่วโมง</span></h1>
            <p className="text-[11px] text-[#8B94A5] mt-1 font-mono">เทศบาลตำบลบ่อหลวง จ.เชียงใหม่</p>
          </div>
        </div>

        {/* Right Side: Tools & Times */}
        <div className="flex items-center space-x-4 text-sm">
          <div className="hidden lg:flex items-center space-x-3">
            <span className="text-[#8B94A5] font-bold text-[11px] tracking-wider uppercase">อัปเดตข้อมูล</span>
            <div className="flex items-center px-3.5 py-1.5 bg-[#111319] border border-[#333946] text-[#4178F3] rounded-lg font-mono font-bold space-x-2 shadow-inner">
              <span>{displayDate}</span><svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <span className="text-[#8B94A5] font-bold text-[11px] tracking-wider uppercase">เวลา</span>
            <div className="flex items-center px-3.5 py-1.5 bg-[#111319] border border-[#333946] text-[#4178F3] rounded-lg font-mono font-bold space-x-2 shadow-inner min-w-[90px] justify-center">
              <span>{activeFrame ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'} น.</span><svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>

          <div className="w-[1px] h-8 bg-[#333946] mx-1 hidden md:block"></div>

          {/* Action Buttons */}
          <button className="flex items-center px-4 py-2 bg-[#232732] border border-[#333946] text-[#8B94A5] rounded-xl font-bold space-x-2 cursor-not-allowed transition-colors"><span className="w-2 h-2 rounded-full bg-[#4B5563]"></span><span className="text-[12px]">ปัจจุบัน</span></button>
          
          <button onClick={() => setIsStatsModalOpen(true)} className="flex items-center px-4 py-2 bg-[#4178F3]/10 border border-[#4178F3]/30 text-[#4178F3] hover:bg-[#4178F3]/20 hover:border-[#4178F3]/60 rounded-xl font-bold space-x-2 transition-all shadow-[0_0_15px_rgba(65,120,243,0.15)] group">
            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            <span className="text-[12px]">สถิติการใช้งาน</span>
          </button>
          
          <button onClick={() => { if(window.history.length > 1) window.close(); else window.location.href = '/'; }} className="w-10 h-10 flex items-center justify-center bg-[#232732] border border-[#333946] hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 rounded-xl text-[#8B94A5] transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        {/* หูจับ Pull-down */}
        <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-16 h-4 bg-[#1A1D24] rounded-b-xl border-b border-x border-[#333946] flex items-center justify-center cursor-pointer shadow-md">
          <div className="w-5 h-1 bg-[#4B5563] rounded-full"></div>
        </div>
      </header>

      {/* หูจับตอนปิด */}
      {!isTopHeaderVisible && (
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-20 h-4 bg-[#1A1D24]/80 backdrop-blur-md rounded-b-xl border-b border-x border-[#333946] flex items-center justify-center cursor-pointer shadow-[0_4px_15px_rgba(0,0,0,0.5)] z-[1500] hover:bg-[#232732] transition-colors" onMouseEnter={() => setIsTopHeaderVisible(true)}>
          <div className="w-6 h-1 bg-[#8B94A5]/50 rounded-full"></div>
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

        {/* 🎛️ 1. จัดการชั้นข้อมูล */}
        {isLayerMenuOpen && (
          <div className="absolute top-5 left-5 z-[1000] w-[280px] onwr-panel flex flex-col pointer-events-auto">
            <div className="px-5 py-3.5 border-b border-[#333946] flex justify-between items-center bg-[#232732] rounded-t-xl">
              <h3 className="text-[13px] font-bold text-[#E5E7EB] flex items-center"><svg className="w-4 h-4 mr-2 text-[#4178F3]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>จัดการชั้นข้อมูล</h3>
              <button onClick={() => setIsLayerMenuOpen(false)} className="text-[#8B94A5] hover:text-white transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <div className="flex flex-col max-h-[calc(100vh-140px)]">
              <div className="p-4 border-b border-[#333946] bg-[#1A1D24]">
                <div className="grid grid-cols-4 gap-2.5">
                  {[{ id: 'light', name: 'Light', bg: 'bg-[#E5E7EB]' }, { id: 'terrain', name: 'Terrain', bg: 'bg-[#8F9779]' }, { id: 'satellite', name: 'Satellite', bg: 'bg-[#2D4C1E]' }, { id: 'dark', name: 'Dark', bg: 'bg-[#111319]' }].map(bg => (
                    <div key={bg.id} onClick={() => setMapStyle(bg.id as any)} className={`flex flex-col items-center justify-center p-1.5 rounded-xl border cursor-pointer transition-all ${mapStyle === bg.id ? 'bg-[#292E38] border-[#4178F3] shadow-[0_0_10px_rgba(65,120,243,0.2)]' : 'border-[#333946] hover:border-[#4B5563] hover:bg-[#232732]'}`}>
                      <div className={`w-full h-7 ${bg.bg} rounded-md border border-[#333946] mb-1.5 shadow-inner`}></div>
                      <span className={`text-[10px] font-bold tracking-wide ${mapStyle === bg.id ? 'text-[#4178F3]' : 'text-[#8B94A5]'}`}>{bg.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 overflow-y-auto onwr-scroll pr-2 bg-[#1A1D24] rounded-b-xl">
                <LayerToggle label="เรดาร์คอมโพสิต" checked={showRadar} onChange={(e: any) => setShowRadar(e.target.checked)} />
                <LayerToggle label="ประมาณการฝนสะสม 3 ชม. ล่วงหน้า" checked={false} onChange={() => {}} />
                <LayerToggle label="ฝนสถานีรายชั่วโมง" checked={true} onChange={() => {}} isRadioGroup={true} />
                <LayerToggle label="สถานีเรดาร์" checked={true} onChange={() => {}} hasLabelToggle="checked" />
                <div className="border-t border-[#333946] my-3"></div>
                <LayerToggle label="ขอบเขตจังหวัด" checked={true} onChange={() => {}} hasLabelToggle="unchecked" />
                <LayerToggle label="ขอบเขตอำเภอ" checked={false} onChange={() => {}} hasLabelToggle="unchecked" />
                <LayerToggle label="ขอบเขตตำบลบ่อหลวง" checked={showBoluang} onChange={(e: any) => setShowBoluang(e.target.checked)} hasLabelToggle="unchecked" />
                <LayerToggle label="โซนหมู่บ้าน 13 โซน" checked={showBlock} onChange={(e: any) => setShowBlock(e.target.checked)} hasLabelToggle="unchecked" />
              </div>
            </div>
          </div>
        )}

        {!isLayerMenuOpen && (
          <button onClick={() => setIsLayerMenuOpen(true)} className="absolute top-5 left-5 z-[1000] p-2.5 bg-[#1A1D24]/90 backdrop-blur-md border border-[#333946] rounded-xl shadow-lg hover:bg-[#232732] transition-colors pointer-events-auto text-[#E5E7EB]"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg></button>
        )}

        {/* 🎛️ 2. ตารางพยากรณ์รายจังหวัด */}
        {isTablePanelOpen && (
          <div className="absolute top-5 right-16 z-[900] w-[400px] onwr-panel flex flex-col pointer-events-auto hidden xl:flex overflow-hidden">
            <div className="flex border-b border-[#333946] bg-[#111319]">
              <button className="px-5 py-3 text-[12px] font-bold text-[#4178F3] border-b-2 border-[#4178F3] bg-[#1A1D24]">เรดาร์</button>
              <button className="px-5 py-3 text-[12px] font-medium text-[#8B94A5] hover:text-[#E5E7EB] transition-colors">สถานีวัดฝน</button>
              <button className="px-5 py-3 text-[12px] font-medium text-[#8B94A5] hover:text-[#E5E7EB] transition-colors">สถานีเรดาร์</button>
              <button onClick={() => setIsTablePanelOpen(false)} className="ml-auto px-4 text-[#8B94A5] hover:text-[#EF4444] transition-colors"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" /></svg></button>
            </div>
            <div className="p-5 bg-[#1A1D24]">
              <h3 className="text-[14px] font-bold text-[#E5E7EB] mb-4">ประมาณการฝนสะสม 3 ชั่วโมง ล่วงหน้า (รายจังหวัด)</h3>
              <div className="flex items-center space-x-2 text-[12px] mb-4 border-b border-[#333946] pb-4">
                <span className="text-[#8B94A5] mr-2">ระดับพื้นที่</span>
                <button className="px-3 py-1 bg-[#4178F3]/20 text-[#4178F3] border border-[#4178F3]/50 rounded-md font-bold">จังหวัด</button>
                <button className="px-3 py-1 text-[#8B94A5] hover:text-white border border-transparent hover:border-[#333946] rounded-md transition-all">อำเภอ</button>
                <button className="px-3 py-1 text-[#8B94A5] hover:text-white border border-transparent hover:border-[#333946] rounded-md transition-all">ตำบล</button>
              </div>
              <div className="w-full text-[11.5px]">
                <div className="flex font-bold text-[#8B94A5] border-b border-[#333946] pb-2.5 mb-2">
                  <div className="w-10 text-center">ลำดับ</div><div className="flex-1 pl-2">จังหวัด</div><div className="w-16 text-right text-[#4178F3]">สะสม</div><div className="w-14 text-right">เฉลี่ย</div><div className="w-16 text-right">%พื้นที่</div><div className="w-14 text-right pr-3">Peak</div>
                </div>
                <div className="overflow-y-auto h-[350px] onwr-scroll pr-2">
                  {mockProvincialRainData.map((row, index) => (
                    <div key={row.id} className="flex items-center text-[#D1D5DB] py-2.5 border-b border-[#333946]/30 hover:bg-[#232732] cursor-pointer rounded px-1 transition-colors">
                      <div className="w-10 text-center text-[#8B94A5] font-mono">{index + 1}</div><div className="flex-1 font-bold text-[#E5E7EB] pl-1">{row.prov}</div><div className="w-16 text-right font-mono text-white font-bold">{row.acc.toFixed(1)}</div><div className="w-14 text-right font-mono">{row.avg.toFixed(1)}</div><div className="w-16 text-right font-mono">{row.area}%</div><div className="w-14 text-right font-mono pr-2">{row.peak}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 🌟 Popup พยากรณ์อากาศแบบ ONWR */}
        {clickedLocation && (
          <div className="absolute top-20 right-5 z-[1050] w-[340px] onwr-panel flex flex-col pointer-events-auto shadow-[0_15px_50px_rgba(0,0,0,0.8)] animate-fade-in border border-[#4178F3]/30">
            <div className="px-5 py-4 border-b border-[#333946] flex justify-between items-center bg-[#232732] rounded-t-xl">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-[#4178F3]/20 flex items-center justify-center border border-[#4178F3]/50 text-[14px]">📌</div>
                <div>
                  <h3 className="text-[13px] font-bold text-[#E5E7EB] leading-tight">พิกัดที่เลือก</h3>
                  <p className="text-[10px] text-[#4178F3] font-mono mt-0.5">{clickedLocation.lat.toFixed(5)}, {clickedLocation.lng.toFixed(5)}</p>
                </div>
              </div>
              <button onClick={() => setClickedLocation(null)} className="text-[#8B94A5] hover:text-[#EF4444] bg-[#111319] hover:bg-red-500/10 p-1.5 rounded-lg border border-[#333946] hover:border-red-500/30 transition-all"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <div className="p-5 bg-[#1A1D24] rounded-b-xl">
              {isFetchingForecast ? (
                <div className="flex flex-col items-center justify-center py-10"><svg className="animate-spin h-8 w-8 text-[#4178F3] mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><p className="text-[12px] text-[#8B94A5] font-bold tracking-wide animate-pulse">กำลังประมวลผลโมเดล WRF...</p></div>
              ) : forecastData ? (
                <>
                  <div className={`p-4 rounded-xl border ${forecastData.isRaining ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-green-500/10 border-green-500/40'} mb-5 shadow-inner`}>
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-3 h-3 rounded-full ${forecastData.isRaining ? 'bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.8)]' : 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]'} animate-pulse`}></span>
                      <h4 className={`text-[14px] font-bold ${forecastData.isRaining ? 'text-yellow-400' : 'text-green-400'}`}>{forecastData.isRaining ? 'คาดว่าจะมีฝนตก' : 'คาดว่าไม่มีฝน'} <span className="text-[#8B94A5] font-normal text-[12px] ml-1">(3 ชม. ข้างหน้า)</span></h4>
                    </div>
                    <p className="text-[12px] text-[#D1D5DB] mt-2 ml-5">{forecastData.isRaining ? 'ระวัง! สภาพอากาศแปรปรวน ท้องฟ้าครึ้ม' : 'สภาพอากาศปกติ ท้องฟ้าโปร่ง ปลอดภัย'}</p>
                  </div>
                  <h5 className="text-[12px] font-bold text-[#8B94A5] mb-3 flex items-center"><svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>พยากรณ์ล่วงหน้ารายชั่วโมง</h5>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {forecastData.hours.map((h: any, idx: number) => {
                      const rainInfo = getRainText(h.rain);
                      return (
                        <div key={idx} className="bg-[#232732] border border-[#333946] rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
                          <span className="text-[10px] text-[#8B94A5] font-bold mb-1.5 px-2 py-0.5 bg-[#111319] rounded-md">+{idx + 1} ชม.</span>
                          <span className="text-[22px] my-1">{rainInfo.icon}</span>
                          <span className="text-[11px] font-mono text-[#E5E7EB]">{h.time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span>
                          <span className={`text-[11px] font-bold mt-1.5 ${rainInfo.color}`}>{rainInfo.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* 🎛️ 3. แถบเครื่องมือแผนที่ */}
        <div className="absolute bottom-[110px] md:bottom-28 right-5 z-[900] flex flex-col space-y-2 pointer-events-auto">
          <div className="bg-[#1A1D24]/90 backdrop-blur-md border border-[#333946] rounded-xl flex flex-col overflow-hidden shadow-[0_5px_20px_rgba(0,0,0,0.5)]">
            <button onClick={handleGoHome} className="w-11 h-11 flex items-center justify-center text-[#8B94A5] hover:text-white hover:bg-[#2D323B] transition-colors border-b border-[#333946]"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg></button>
            <button onClick={handleZoomIn} className="w-11 h-11 flex items-center justify-center text-[#8B94A5] hover:text-white hover:bg-[#2D323B] transition-colors border-b border-[#333946]"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m-6-6h12" /></svg></button>
            <button onClick={handleZoomOut} className="w-11 h-11 flex items-center justify-center text-[#8B94A5] hover:text-white hover:bg-[#2D323B] transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg></button>
          </div>
        </div>

        {/* 🎛️ 4. แถบ Legend คู่ */}
        <div className="absolute bottom-[110px] md:bottom-8 left-5 z-[900] pointer-events-auto flex items-end space-x-4 hidden md:flex">
          <div className="onwr-panel px-3.5 py-4 w-[140px] bg-[#1A1D24]/95 backdrop-blur-md">
            <div className="text-center mb-5">
              <h3 className="text-[12px] font-bold text-[#E5E7EB]">Radar Composite</h3>
              <p className="text-[9px] text-[#8B94A5] mt-0.5">dBZ / mm/hr</p>
            </div>
            <div className="flex relative pl-1">
              <div className="w-3 rounded-full mr-3.5 border border-[#333946] shadow-sm" style={{ background: 'linear-gradient(to bottom, #990099, #FF0000, #FF6600, #FFCC00, #33CC33, #0099FF, #00FFFF)', height: '190px' }}></div>
              <div className="flex flex-col justify-between h-[190px] text-[10.5px] font-mono text-[#8B94A5] py-0.5">
                <span className="text-[#990099] font-bold">100+</span><span className="text-[#FF0000] font-bold">50.0</span><span className="text-[#FF6600] font-bold">25.0</span><span className="text-[#FFCC00] font-bold">10.0</span><span className="text-[#33CC33]">2.5</span><span className="text-[#0099FF]">1.0</span><span className="text-[#00FFFF]">0.1</span>
              </div>
            </div>
          </div>

          <div className="onwr-panel p-5 w-[280px] bg-[#1A1D24]/95 backdrop-blur-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[13px] font-bold text-[#E5E7EB]">ฝนสถานี 24 ชั่วโมง (มม.)</h3>
              <div className="flex bg-[#111319] rounded border border-[#333946] overflow-hidden">
                <button className="px-2.5 py-0.5 text-[10px] text-gray-400 hover:bg-[#2D323B]">1 ชม.</button>
                <button className="px-2.5 py-0.5 text-[10px] bg-[#4178F3]/20 text-[#4178F3] font-bold">24 ชม.</button>
              </div>
            </div>
            <div className="w-full h-2.5 rounded-full flex overflow-hidden mb-2.5 shadow-inner">
              <div className="h-full w-[15%]" style={{background: '#00FFFF'}}></div><div className="h-full w-[15%]" style={{background: '#0099FF'}}></div><div className="h-full w-[15%]" style={{background: '#33CC33'}}></div><div className="h-full w-[15%]" style={{background: '#FFCC00'}}></div><div className="h-full w-[15%]" style={{background: '#FF6600'}}></div><div className="h-full w-[15%]" style={{background: '#FF0000'}}></div><div className="h-full w-[10%]" style={{background: '#990099'}}></div>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-[#8B94A5] mb-2 px-1">
              <span>0-10</span><span>10-20</span><span>20-35</span><span>35-50</span><span>50-70</span><span>70-90</span><span>≥90</span>
            </div>
            <div className="flex justify-between text-[11px] text-[#D1D5DB] px-1 font-bold mt-1.5 border-t border-[#333946] pt-2">
              <span>น้อย</span><span>ปานกลาง</span><span>หนัก</span><span className="text-[#EF4444]">หนักมาก</span>
            </div>
          </div>
        </div>

        {/* 🎛️ แผงควบคุมเวลา Timeline Player */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-[90%] max-w-[580px] z-[1000] pointer-events-auto">
          <div className="onwr-panel py-3.5 px-6 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-5 bg-[#1A1D24]/95 backdrop-blur-md">
            <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-start">
              <div className="flex flex-col">
                <span className="text-[14px] font-extrabold text-[#E5E7EB] tracking-wide">TMD Radar Composite</span>
                <div className="flex items-center mt-1 space-x-2">
                  <span className={`w-2 h-2 rounded-full ${isNowcast ? 'bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'bg-[#4178F3] shadow-[0_0_8px_rgba(65,120,243,0.8)]'} ${isPlaying ? 'animate-pulse' : ''}`}></span>
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${isNowcast ? 'text-[#F59E0B]' : 'text-[#4178F3]'}`}>{isNowcast ? 'Nowcasting' : 'Past Data'}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center flex-1 w-full space-x-4">
              <button onClick={() => { setIsPlaying(!isPlaying); if(!isPlaying && currentFrameIndex >= radarData?.frames?.length - 1) setCurrentFrameIndex(0); }} className="text-[#E5E7EB] hover:text-[#4178F3] transition-colors focus:outline-none bg-[#232732] p-1.5 rounded-full border border-[#333946]">
                {isPlaying ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <div className="flex-1 relative flex items-center h-8">
                <input type="range" min="0" max={(radarData?.frames?.length || 1) - 1} value={currentFrameIndex} onChange={(e) => { setIsPlaying(false); setCurrentFrameIndex(parseInt(e.target.value)); }} className="w-full onwr-slider z-10 h-[6px]" />
                {radarData && <div className="absolute h-4 w-[2px] bg-[#F59E0B] z-0 rounded-full shadow-[0_0_5px_#F59E0B]" style={{ left: `${((radarData.pastCount - 1) / (radarData.frames.length - 1)) * 100}%` }}></div>}
              </div>
              <div className="text-[#4178F3] font-mono font-bold text-[15px] min-w-[70px] text-right bg-[#111319] px-2 py-1 rounded border border-[#333946]">
                {activeFrame ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 🌟 Modal สถิติจาก Supabase (Real Data) */}
      {isStatsModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white rounded-2xl w-[90%] max-w-[550px] shadow-2xl overflow-hidden flex flex-col animate-fade-in border border-gray-200">
            <div className="px-6 py-5 flex justify-between items-center border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div>
                <h2 className="text-[17px] font-extrabold text-gray-800 tracking-wide">สถิติการใช้งาน</h2>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-[11px] text-gray-500 font-mono bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm">อัปเดต: {new Date().toLocaleTimeString('th-TH')} น.</span>
                <button onClick={() => setIsStatsModalOpen(false)} className="text-gray-400 hover:text-white bg-gray-100 hover:bg-red-500 p-1.5 rounded-lg transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              <div className="flex space-x-6 border-b border-gray-200 mb-6 px-2">
                <button className="text-blue-600 font-bold border-b-[3px] border-blue-600 pb-2.5 text-[14px]">วันนี้</button>
                <button className="text-gray-400 hover:text-gray-600 font-medium pb-2.5 text-[14px]">รายเดือน</button>
                <button className="text-gray-400 hover:text-gray-600 font-medium pb-2.5 text-[14px]">รายปี</button>
                <button className="text-gray-400 hover:text-gray-600 font-medium pb-2.5 text-[14px]">ทั้งหมด</button>
              </div>

              {realStats.isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <svg className="animate-spin h-10 w-10 text-blue-500 mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span className="text-[13px] text-gray-500 font-bold tracking-wide">กำลังเชื่อมต่อฐานข้อมูล Supabase...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-blue-50/80 border border-blue-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-[12px] text-blue-600 font-bold mb-1">ยอดเข้าชมสะสม</p>
                    <p className="text-[26px] font-black text-gray-800">{realStats.totalVisits.toLocaleString()}</p>
                    <p className="text-[11px] text-gray-500 font-medium mt-1">ครั้ง (ทั้งหมด)</p>
                  </div>
                  <div className="bg-emerald-50/80 border border-emerald-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-[12px] text-emerald-600 font-bold mb-1">จำนวนผู้เข้าชมสะสม</p>
                    <p className="text-[26px] font-black text-gray-800">{realStats.totalUniqueVisitors.toLocaleString()}</p>
                    <p className="text-[11px] text-gray-500 font-medium mt-1">คน (ทั้งหมด)</p>
                  </div>
                  <div className="bg-purple-50/80 border border-purple-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-[12px] text-purple-600 font-bold mb-1">ยอดเข้าชมวันนี้</p>
                    <p className="text-[26px] font-black text-gray-800">{realStats.todayVisits.toLocaleString()}</p>
                    <p className="text-[11px] text-gray-500 font-medium mt-1">ครั้ง (วันนี้)</p>
                  </div>
                  <div className="bg-orange-50/80 border border-orange-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-[12px] text-orange-600 font-bold mb-1">จำนวนผู้เข้าชมวันนี้</p>
                    <p className="text-[26px] font-black text-gray-800">{realStats.todayUniqueVisitors.toLocaleString()}</p>
                    <p className="text-[11px] text-gray-500 font-medium mt-1">คน (วันนี้)</p>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-[13px] font-bold text-gray-800">สถิติรายวัน (14 วันล่าสุด)</h4>
                  <div className="flex items-center space-x-3 text-[11px] font-bold text-gray-500">
                    <span className="flex items-center"><span className="w-2.5 h-2.5 bg-blue-500 mr-1.5 rounded-sm"></span> ยอดเข้าชม</span>
                    <span className="flex items-center"><span className="w-2.5 h-2.5 bg-purple-500 mr-1.5 rounded-sm"></span> ผู้เข้าชม</span>
                  </div>
                </div>
                <div className="h-28 flex items-end justify-around border-b border-gray-200 pb-1.5 px-2">
                  <div className="w-8 flex justify-center items-end space-x-1.5"><div className="w-3.5 bg-blue-500 h-[40%] rounded-t-md hover:bg-blue-600 cursor-pointer"></div><div className="w-3.5 bg-purple-500 h-[35%] rounded-t-md hover:bg-purple-600 cursor-pointer"></div></div>
                  <div className="w-8 flex justify-center items-end space-x-1.5"><div className="w-3.5 bg-blue-500 h-[70%] rounded-t-md hover:bg-blue-600 cursor-pointer"></div><div className="w-3.5 bg-purple-500 h-[60%] rounded-t-md hover:bg-purple-600 cursor-pointer"></div></div>
                  <div className="w-8 flex justify-center items-end space-x-1.5"><div className="w-3.5 bg-blue-500 h-[100%] rounded-t-md hover:bg-blue-600 cursor-pointer"></div><div className="w-3.5 bg-purple-500 h-[85%] rounded-t-md hover:bg-purple-600 cursor-pointer"></div></div>
                  <div className="w-8 flex justify-center items-end space-x-1.5"><div className="w-3.5 bg-blue-500 h-[50%] rounded-t-md hover:bg-blue-600 cursor-pointer"></div><div className="w-3.5 bg-purple-500 h-[45%] rounded-t-md hover:bg-purple-600 cursor-pointer"></div></div>
                </div>
                <div className="flex justify-around text-[10px] text-gray-400 mt-2 font-mono px-2">
                  <span>08/09/26</span><span>09/09/26</span><span>10/09/26</span><span className="font-bold text-gray-800">11/09/26</span>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <h4 className="text-[13px] font-bold text-gray-800 mb-3 flex items-center"><svg className="w-4 h-4 mr-1.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>สัดส่วนอุปกรณ์ (Devices)</h4>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden flex mb-3 shadow-inner">
                  <div className="h-full bg-blue-500 w-[60%]"></div><div className="h-full bg-orange-400 w-[10%]"></div><div className="h-full bg-emerald-500 w-[30%]"></div>
                </div>
                <div className="flex justify-between text-[11px] font-bold text-gray-600 px-2">
                  <span className="flex items-center"><span className="w-2.5 h-2.5 bg-blue-500 rounded-full mr-1.5"></span> มือถือ 60%</span>
                  <span className="flex items-center"><span className="w-2.5 h-2.5 bg-orange-400 rounded-full mr-1.5"></span> แท็บเล็ต 10%</span>
                  <span className="flex items-center"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full mr-1.5"></span> เดสก์ท็อป 30%</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
