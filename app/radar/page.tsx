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
  const [radarOpacity, setRadarOpacity] = useState(0.7);
  const [showBoluang, setShowBoluang] = useState(true);
  const [showBlock, setShowBlock] = useState(false);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(true); // เปิด/ปิดแผงจัดการ
  
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
      }, 1200); 
    }
    return () => clearInterval(interval);
  }, [isPlaying, radarData]);

  // 🗺️ ฟังก์ชันเลือก BaseMap
  const getBasemapUrl = () => {
    switch (mapStyle) {
      case 'light': return "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
      case 'terrain': return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
      case 'satellite': return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      case 'dark': default: return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    }
  };

  const activeFrame = radarData?.frames[currentFrameIndex];
  // color scheme 4 = TITAN, 1_1 = smooth
  const radarUrl = (showRadar && activeFrame) ? `${radarData.host}${activeFrame.path}/256/{z}/{x}/{y}/4/1_1.png` : '';
  const isNowcast = currentFrameIndex >= (radarData?.pastCount || 0);

  return (
    <div className="relative w-screen h-screen bg-[#111827] overflow-hidden font-sans text-white flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: #111827 !important; }
        input[type="range"]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; background: #3b82f6; border-radius: 50%; cursor: pointer; }
      `}} />

      {/* 🚀 Header */}
      <header className="h-[60px] bg-[#1f2937]/95 border-b border-[#374151] backdrop-blur-md z-[1000] flex items-center justify-between px-4 shrink-0 shadow-sm">
        <div className="flex items-center space-x-3">
          <button onClick={() => { if(window.history.length > 1) window.close(); else window.location.href = '/'; }} className="w-8 h-8 flex items-center justify-center bg-[#374151] hover:bg-rose-500 rounded text-gray-300 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div>
            <h1 className="text-[14px] md:text-[15px] font-bold tracking-wide text-gray-100">เรดาร์และปริมาณฝน (Nowcast)</h1>
            <p className="text-[10px] text-[#38bdf8]">เทศบาลตำบลบ่อหลวง จ.เชียงใหม่</p>
          </div>
        </div>
      </header>

      <div className="relative flex-1">
        {/* 🗺️ แผนที่หลัก */}
        <div className="absolute inset-0 z-0">
          <MapContainer center={[center.lat, center.lng]} zoom={11} maxZoom={16} zoomControl={false} attributionControl={false} className="w-full h-full">
            <TileLayer url={getBasemapUrl()} />
            
            {showBoluang && geoBoluang && <GeoJSON data={geoBoluang} style={{ color: '#ffffff', weight: 2.5, fill: false, opacity: 0.9, dashArray: '6,6' }} />}
            {showBlock && geoBlock && <GeoJSON data={geoBlock} style={{ color: '#facc15', weight: 1.5, fill: false, opacity: 0.5 }} />}
            
            {radarUrl && <TileLayer key={`${radarUrl}-${radarOpacity}`} url={radarUrl} opacity={radarOpacity} zIndex={100} />}
          </MapContainer>
        </div>

        {/* 🎛️ แผงจัดการชั้นข้อมูล (ถอดแบบจากภาพ a0dde7) */}
        {isLayerMenuOpen && (
          <div className="absolute top-4 left-4 z-[1000] w-[260px] bg-[#1f2937]/95 backdrop-blur-md border border-[#374151] rounded-xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col">
            <div className="px-4 py-3 border-b border-[#374151] flex justify-between items-center bg-[#111827]/50">
              <h3 className="text-[13px] font-bold text-gray-200">จัดการชั้นข้อมูล</h3>
              <button onClick={() => setIsLayerMenuOpen(false)} className="text-gray-400 hover:text-white"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Basemap Selector */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'light', name: 'Light', img: 'https://a.basemaps.cartocdn.com/light_all/12/3196/1841.png' },
                  { id: 'terrain', name: 'Terrain', img: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/12/1841/3196' },
                  { id: 'satellite', name: 'Satellite', img: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1841/3196' },
                  { id: 'dark', name: 'Dark', img: 'https://a.basemaps.cartocdn.com/dark_all/12/3196/1841.png' }
                ].map(bg => (
                  <div 
                    key={bg.id} 
                    onClick={() => setMapStyle(bg.id as any)} 
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border cursor-pointer transition-all ${mapStyle === bg.id ? 'bg-[#374151] border-blue-500' : 'border-transparent hover:bg-[#374151]/50'}`}
                  >
                    <img src={bg.img} alt={bg.name} className="w-full h-8 object-cover rounded shadow-sm mb-1.5 opacity-80" />
                    <span className="text-[10px] font-medium text-gray-300">{bg.name}</span>
                  </div>
                ))}
              </div>

              {/* Layer Toggles */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" checked={showRadar} onChange={(e) => setShowRadar(e.target.checked)} className="w-4 h-4 rounded bg-[#374151] border-gray-600 text-blue-500 focus:ring-0 focus:ring-offset-0" />
                    <span className="text-[13px] text-gray-300">เรดาร์คอมโพสิต</span>
                  </label>
                  <svg className="w-4 h-4 text-gray-500 cursor-pointer hover:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                
                {/* ความโปร่งแสงเรดาร์ (ถ้าเปิดอยู่) */}
                {showRadar && (
                  <div className="pl-7 pr-6">
                    <input type="range" min="0" max="1" step="0.1" value={radarOpacity} onChange={(e) => setRadarOpacity(parseFloat(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer" />
                  </div>
                )}

                <div className="border-t border-[#374151] pt-3"></div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" checked={showBoluang} onChange={(e) => setShowBoluang(e.target.checked)} className="w-4 h-4 rounded bg-[#374151] border-gray-600 text-blue-500 focus:ring-0 focus:ring-offset-0" />
                    <span className="text-[13px] text-gray-300">ขอบเขตตำบลบ่อหลวง</span>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" checked={showBlock} onChange={(e) => setShowBlock(e.target.checked)} className="w-4 h-4 rounded bg-[#374151] border-gray-600 text-blue-500 focus:ring-0 focus:ring-offset-0" />
                    <span className="text-[13px] text-gray-300">โซนหมู่บ้าน</span>
                  </label>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ปุ่มเปิดเมนูถ้าถูกปิดไป */}
        {!isLayerMenuOpen && (
          <button onClick={() => setIsLayerMenuOpen(true)} className="absolute top-4 left-4 z-[1000] p-2 bg-[#1f2937]/90 border border-[#374151] rounded-lg shadow-md hover:bg-[#374151] transition-colors pointer-events-auto text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        )}

        {/* 📊 Legend แถบสี (ซ้ายล่าง) */}
        <div className="absolute bottom-[100px] md:bottom-6 left-4 z-[1000] pointer-events-auto">
          <div className="bg-[#1f2937]/90 backdrop-blur-md border border-[#374151] px-3 py-3 rounded-xl shadow-xl w-[160px]">
            <h3 className="text-[11px] font-bold text-gray-400 mb-2 text-center border-b border-[#374151] pb-2">Radar Composite<br/><span className="text-[9px] font-normal">dBZ / mm/hr</span></h3>
            <div className="flex flex-col space-y-1.5 mt-2">
              {[
                { c: '#990099', t: 'ตกหนักมาก' },
                { c: '#FF0000', t: 'ตกหนัก' },
                { c: '#FFCC00', t: 'ปานกลาง' },
                { c: '#33CC33', t: 'ตกเล็กน้อย' },
                { c: '#00FFFF', t: 'ละอองฝน' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                  <div className="w-3 h-3 rounded-sm mr-2 shadow-sm" style={{ backgroundColor: item.c }}></div>
                  <span className="text-gray-300 flex-1 text-right">{item.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 🎛️ แผงควบคุมเวลา (Timeline Player) - ตรงกลางด้านล่าง */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-[500px] z-[1000] pointer-events-auto">
          <div className="bg-[#1f2937]/95 border border-[#374151] rounded-2xl py-3 px-4 shadow-[0_10px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            
            <div className="flex items-center justify-between mb-3 border-b border-[#374151] pb-2">
              <div className="flex items-center space-x-2">
                <span className="text-[13px] font-bold text-gray-200">TMD Radar Composite</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isNowcast ? 'text-blue-400' : 'text-gray-400'}`}>
                  ({isNowcast ? 'Nowcasting' : 'Past'})
                </span>
              </div>
              
              <div className="text-gray-300 font-mono font-bold text-[13px]">
                {activeFrame ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'} น.
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button onClick={() => { setIsPlaying(!isPlaying); if(!isPlaying && currentFrameIndex >= radarData?.frames?.length - 1) setCurrentFrameIndex(0); }} className="text-gray-300 hover:text-white shrink-0">
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" /></svg>
                ) : (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              
              <div className="flex-1 relative flex items-center h-4">
                <input 
                  type="range" min="0" max={(radarData?.frames?.length || 1) - 1} value={currentFrameIndex}
                  onChange={(e) => { setIsPlaying(false); setCurrentFrameIndex(parseInt(e.target.value)); }}
                  className="w-full h-1 bg-[#374151] rounded appearance-none cursor-pointer absolute z-10"
                />
                {radarData && (
                  <div 
                    className="absolute h-2 w-0.5 bg-blue-500 z-0" 
                    style={{ left: `${((radarData.pastCount - 1) / (radarData.frames.length - 1)) * 100}%` }}
                  ></div>
                )}
              </div>
              
              <div className="text-[10px] text-blue-500 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30">
                GIF
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
