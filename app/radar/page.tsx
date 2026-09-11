'use client'; 

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then((mod) => mod.GeoJSON), { ssr: false });

export default function RadarPage() {
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [radarData, setRadarData] = useState<any>(null);
  
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  
  // 🎛️ State สำหรับแผงจัดการชั้นข้อมูล
  const [mapStyle, setMapStyle] = useState<'light' | 'terrain' | 'satellite' | 'dark'>('dark');
  const [showRadar, setShowRadar] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.8);
  const [showBoluang, setShowBoluang] = useState(true);
  const [showBlock, setShowBlock] = useState(false);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(true);
  
  const center = { lat: 18.1633, lng: 98.3744 };

  useEffect(() => {
    fetch('/geojson/boluang.json').then(res => res.json()).then(data => setGeoBoluang(data));
    fetch('/geojson/block.json').then(res => res.json()).then(data => setGeoBlock(data));
    
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(res => res.json())
      .then(data => {
        const combinedFrames = [...(data.radar.past || []), ...(data.radar.nowcast || [])];
        setRadarData({ host: data.host, frames: combinedFrames, pastCount: data.radar.past.length });
        setCurrentFrameIndex(data.radar.past.length - 1);
      });
  }, []);

  useEffect(() => {
    let interval: any;
    if (isPlaying && radarData?.frames?.length > 0) {
      interval = setInterval(() => {
        setCurrentFrameIndex((prevIndex) => {
          const nextIndex = prevIndex + 1;
          if (nextIndex >= radarData.frames.length) {
            setIsPlaying(false);
            return prevIndex;
          }
          return nextIndex;
        });
      }, 1000); 
    }
    return () => clearInterval(interval);
  }, [isPlaying, radarData]);

  // 🗺️ เปลี่ยนไปใช้แผนที่ Google Maps (เสถียรที่สุด 100% ซูมลึกได้ไม่มีพัง)
  const getBasemapUrl = () => {
    switch (mapStyle) {
      case 'light': return "https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}"; // Google Street
      case 'terrain': return "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"; // Google Terrain
      case 'satellite': return "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"; // Google Hybrid (ดาวเทียม + ชื่อสถานที่)
      case 'dark': default: return "https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}"; // Google Street (เพื่อเอามาทำโหมดมืด)
    }
  };

  const activeFrame = radarData?.frames[currentFrameIndex];
  const radarUrl = (showRadar && activeFrame) ? `${radarData.host}${activeFrame.path}/256/{z}/{x}/{y}/4/1_1.png` : '';
  const isNowcast = currentFrameIndex >= (radarData?.pastCount || 0);

  return (
    <div className="relative w-screen h-screen bg-[#111319] overflow-hidden font-sans text-white flex flex-col select-none">
      
      {/* 🚀 CSS สำหรับปรับแต่งหน้าตาให้ลื่นและดู Pro */}
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: #111319 !important; }
        .custom-range { -webkit-appearance: none; background: transparent; }
        .custom-range::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: #4178F3; cursor: pointer; border: 3px solid #1E222B; box-shadow: 0 0 10px rgba(65,120,243,0.5); }
        .custom-range::-webkit-slider-runnable-track { width: 100%; height: 6px; cursor: pointer; background: #333946; border-radius: 4px; }
        .custom-range:focus { outline: none; }
        .pro-panel { background: #232732; border: 1px solid #333946; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
        .custom-checkbox { -webkit-appearance: none; width: 16px; height: 16px; border: 1px solid #4B5563; border-radius: 4px; background: #1E222B; cursor: pointer; position: relative; }
        .custom-checkbox:checked { background: #4178F3; border-color: #4178F3; }
        .custom-checkbox:checked::after { content: ''; position: absolute; left: 5px; top: 2px; width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
        
        /* 🔥 คลาสสำคัญสำหรับกลับสี Google Map ให้เป็น Dark Mode แบบเนียนๆ */
        .dark-map { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%); }
      `}} />

      {/* (โค้ด Header คงเดิม) */}
      <header className="h-[50px] bg-[#1A1D24]/95 border-b border-[#2D323B] backdrop-blur-md z-[1000] flex items-center justify-between px-4 shrink-0 shadow-sm">
      {/* ... */}
      </header>

      <div className="relative flex-1">
        
        {/* 🗺️ แผนที่หลัก */}
        <div className="absolute inset-0 z-0">
          <MapContainer center={[center.lat, center.lng]} zoom={12} maxZoom={20} zoomControl={false} attributionControl={false} className="w-full h-full">
            
            {/* 🔥 แก้ไขแท็ก TileLayer ตรงนี้ครับ ให้เพิ่ม maxZoom และ className เข้าไป */}
            <TileLayer 
              url={getBasemapUrl()} 
              maxZoom={20} 
              className={mapStyle === 'dark' ? 'dark-map' : ''} 
            />
            
            {showBoluang && geoBoluang && <GeoJSON data={geoBoluang} style={{ color: '#FFFFFF', weight: 1.5, fill: false, opacity: 0.8, dashArray: '4,4' }} />}
            {showBlock && geoBlock && <GeoJSON data={geoBlock} style={{ color: '#F59E0B', weight: 1, fill: false, opacity: 0.4 }} />}
            {radarUrl && <TileLayer key={`${radarUrl}-${radarOpacity}`} url={radarUrl} opacity={radarOpacity} zIndex={100} />}
          </MapContainer>
        </div>
        
        {/* 🎛️ แผงจัดการชั้นข้อมูล (ซ้ายบน) สไตล์ ONWR */}
        {isLayerMenuOpen && (
          <div className="absolute top-4 left-4 z-[1000] w-[260px] pro-panel flex flex-col">
            <div className="px-4 py-3 border-b border-[#333946] flex justify-between items-center bg-[#1A1D24] rounded-t-[12px]">
              <h3 className="text-[13px] font-bold text-[#E5E7EB]">จัดการชั้นข้อมูล</h3>
              <button onClick={() => setIsLayerMenuOpen(false)} className="text-[#8B94A5] hover:text-white"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <div className="p-4 space-y-5">
              {/* Basemap Selector (ปุ่มแบบรูปภาพ) */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'light', name: 'Light', bg: 'bg-[#E5E7EB]' },
                  { id: 'terrain', name: 'Terrain', bg: 'bg-[#8F9779]' },
                  { id: 'satellite', name: 'Satellite', bg: 'bg-[#2D4C1E]' },
                  { id: 'dark', name: 'Dark', bg: 'bg-[#1A1D24]' }
                ].map(bg => (
                  <div 
                    key={bg.id} 
                    onClick={() => setMapStyle(bg.id as any)} 
                    className={`flex flex-col items-center justify-center p-1 rounded-lg border cursor-pointer transition-all ${mapStyle === bg.id ? 'bg-[#292E38] border-[#4178F3]' : 'border-transparent hover:bg-[#292E38]'}`}
                  >
                    <div className={`w-full h-8 ${bg.bg} rounded-md border border-[#333946] mb-1.5 opacity-90`}></div>
                    <span className={`text-[9px] font-bold ${mapStyle === bg.id ? 'text-[#4178F3]' : 'text-[#8B94A5]'}`}>{bg.name}</span>
                  </div>
                ))}
              </div>

              {/* Layer Toggles */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between group">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" checked={showRadar} onChange={(e) => setShowRadar(e.target.checked)} className="custom-checkbox" />
                    <span className="text-[13px] text-[#D1D5DB] group-hover:text-white transition-colors">เรดาร์คอมโพสิต</span>
                  </label>
                  {/* Slider ควบคุมความโปร่งแสงขนาดจิ๋ว */}
                  {showRadar && (
                    <input type="range" min="0" max="1" step="0.1" value={radarOpacity} onChange={(e) => setRadarOpacity(parseFloat(e.target.value))} className="w-16 h-1 bg-[#333946] rounded-full appearance-none outline-none accent-[#4178F3]" title="ปรับความโปร่งแสง" />
                  )}
                </div>

                <div className="border-t border-[#333946]"></div>

                <div className="flex items-center justify-between group">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" checked={showBoluang} onChange={(e) => setShowBoluang(e.target.checked)} className="custom-checkbox" />
                    <span className="text-[13px] text-[#D1D5DB] group-hover:text-white transition-colors">ขอบเขตตำบลบ่อหลวง</span>
                  </label>
                </div>

                <div className="flex items-center justify-between group">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" checked={showBlock} onChange={(e) => setShowBlock(e.target.checked)} className="custom-checkbox" />
                    <span className="text-[13px] text-[#D1D5DB] group-hover:text-white transition-colors">โซนหมู่บ้าน</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ปุ่มเปิดเมนู */}
        {!isLayerMenuOpen && (
          <button onClick={() => setIsLayerMenuOpen(true)} className="absolute top-4 left-4 z-[1000] p-2 bg-[#232732]/90 border border-[#333946] rounded-lg shadow-md hover:bg-[#2D323B] transition-colors pointer-events-auto text-[#8B94A5] hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        )}

        {/* 📊 Legend แถบสีแนวตั้งแบบ Pro (ซ้ายล่าง) */}
        <div className="absolute bottom-[100px] md:bottom-6 left-4 z-[1000] pointer-events-auto">
          <div className="pro-panel px-3 py-4 w-[140px]">
            <div className="text-center mb-3">
              <h3 className="text-[11px] font-bold text-[#E5E7EB] leading-tight">Radar Composite</h3>
              <p className="text-[9px] text-[#8B94A5] mt-0.5">dBZ / mm/hr</p>
            </div>
            
            <div className="flex relative">
              {/* แถบสี Gradient แนวตั้ง */}
              <div className="w-3 rounded-full mr-3" style={{ background: 'linear-gradient(to bottom, #990099, #FF0000, #FF6600, #FFCC00, #33CC33, #0099FF, #00FFFF)', height: '180px' }}></div>
              
              {/* ตัวเลขกำกับ */}
              <div className="flex flex-col justify-between h-[180px] text-[10px] font-mono text-[#8B94A5] py-1">
                <span>100+ (รุนแรง)</span>
                <span>50.0</span>
                <span>25.0</span>
                <span>10.0</span>
                <span>2.5</span>
                <span>1.0</span>
                <span>0.1 (เบา)</span>
              </div>
            </div>
          </div>
        </div>

        {/* 🎛️ แผงควบคุมเวลา Timeline Player แบบ Pro (ตรงกลางด้านล่าง) */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-[550px] z-[1000] pointer-events-auto">
          <div className="pro-panel py-3 px-5 flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0 md:space-x-4">
            
            {/* ซ้าย: ชื่อและสถานะ */}
            <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-start">
              <div className="flex flex-col">
                <span className="text-[13px] font-bold text-[#E5E7EB]">TMD Radar Composite</span>
                <div className="flex items-center mt-0.5 space-x-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isNowcast ? 'bg-[#F59E0B]' : 'bg-[#4178F3]'} ${isPlaying ? 'animate-pulse' : ''}`}></span>
                  <span className="text-[10px] font-bold text-[#8B94A5] uppercase tracking-wider">
                    {isNowcast ? 'Nowcasting' : 'Past'}
                  </span>
                </div>
              </div>
              <div className="md:hidden text-[#4178F3] font-mono font-bold text-[14px]">
                {activeFrame ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'} น.
              </div>
            </div>
            
            {/* ขวา: ตัวควบคุม Slider */}
            <div className="flex items-center flex-1 w-full space-x-3">
              <button onClick={() => { setIsPlaying(!isPlaying); if(!isPlaying && currentFrameIndex >= radarData?.frames?.length - 1) setCurrentFrameIndex(0); }} className="text-[#8B94A5] hover:text-[#4178F3] transition-colors focus:outline-none">
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              
              <div className="flex-1 relative flex items-center h-6">
                <input 
                  type="range" min="0" max={(radarData?.frames?.length || 1) - 1} value={currentFrameIndex}
                  onChange={(e) => { setIsPlaying(false); setCurrentFrameIndex(parseInt(e.target.value)); }}
                  className="w-full custom-range z-10"
                />
                {/* ขีดเส้นคั่นแบ่งอดีต-อนาคต */}
                {radarData && (
                  <div 
                    className="absolute h-3 w-[2px] bg-[#F59E0B] z-0 rounded-full" 
                    style={{ left: `${((radarData.pastCount - 1) / (radarData.frames.length - 1)) * 100}%` }}
                    title="เวลาปัจจุบัน"
                  ></div>
                )}
              </div>
              
              <div className="hidden md:block text-[#4178F3] font-mono font-bold text-[15px] min-w-[65px] text-right">
                {activeFrame ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'} น.
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
