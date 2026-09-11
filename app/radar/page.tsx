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
  
  // State สำหรับแผงควบคุม UI
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(true);
  const [mapStyle, setMapStyle] = useState<'light' | 'terrain' | 'satellite' | 'dark'>('dark');
  const [showRadar, setShowRadar] = useState(true);
  const [showBoluang, setShowBoluang] = useState(true);
  const [showBlock, setShowBlock] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.7);

  const center = { lat: 18.1633, lng: 98.3744 };

  useEffect(() => {
    fetch('/geojson/boluang.json').then(res => res.json()).then(data => setGeoBoluang(data));
    fetch('/geojson/block.json').then(res => res.json()).then(data => setGeoBlock(data));
  }, []);

  useEffect(() => {
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

  const activeFrame = radarData?.frames[currentFrameIndex];
  // Scheme 4 = สีคล้ายเรดาร์กรมอุตุฯ
  const radarUrl = (showRadar && activeFrame) ? `${radarData.host}${activeFrame.path}/256/{z}/{x}/{y}/4/1_1.png` : '';
  const isNowcast = currentFrameIndex >= (radarData?.pastCount || 0);

  // ฟังก์ชันเลือก Basemap
  const renderBasemap = () => {
    switch (mapStyle) {
      case 'light': return <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />;
      case 'terrain': return <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" />;
      case 'satellite': return <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />;
      case 'dark': return <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />;
    }
  };

  return (
    <div className="relative w-screen h-screen bg-[#111827] overflow-hidden font-sans text-white flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: #111827 !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
      `}} />

      {/* 🚀 Header */}
      <header className="h-[60px] bg-[#1f2937]/95 border-b border-[#374151] z-[1000] flex items-center justify-between px-4 shadow-md shrink-0">
        <div className="flex items-center space-x-3">
          <button onClick={() => { if(window.history.length > 1) window.close(); else window.location.href = '/'; }} className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-rose-500 rounded text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div>
            <h1 className="text-[14px] font-bold tracking-wide flex items-center text-white">เรดาร์และปริมาณฝน (Nowcast)</h1>
            <p className="text-[10px] text-[#38bdf8]">เทศบาลตำบลบ่อหลวง จ.เชียงใหม่</p>
          </div>
        </div>
      </header>

      <div className="relative flex-1">
        {/* 🗺️ แผนที่หลัก */}
        <div className="absolute inset-0 z-0">
          <MapContainer center={[center.lat, center.lng]} zoom={12} maxZoom={16} zoomControl={false} attributionControl={false} className="w-full h-full">
            {renderBasemap()}
            {showBoluang && geoBoluang && <GeoJSON data={geoBoluang} style={{ color: mapStyle==='light' ? '#3b82f6' : '#ffffff', weight: 2.5, fill: false, opacity: 0.9, dashArray: '6,6' }} />}
            {showBlock && geoBlock && <GeoJSON data={geoBlock} style={{ color: mapStyle==='light' ? '#f59e0b' : '#fcd34d', weight: 1.5, fill: false, opacity: 0.6, dashArray: '3,3' }} />}
            {radarUrl && <TileLayer key={`${radarUrl}-${radarOpacity}`} url={radarUrl} opacity={radarOpacity} zIndex={100} />}
          </MapContainer>
        </div>

        {/* 🎛️ แผงจัดการชั้นข้อมูล (สไตล์ CLPP) */}
        {isLayerMenuOpen ? (
          <div className="absolute top-4 left-4 z-[1000] w-[260px] bg-[#1f2937]/95 backdrop-blur-md border border-[#374151] rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-[#374151]/50 px-4 py-3 flex items-center justify-between border-b border-[#374151]">
              <h3 className="text-[13px] font-bold text-white tracking-wide">จัดการชั้นข้อมูล</h3>
              <button onClick={() => setIsLayerMenuOpen(false)} className="text-gray-400 hover:text-white">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-3">
              {/* ปุ่มเลือก Basemap 4 แบบ */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { id: 'light', name: 'Light', bg: 'bg-[#f3f4f6]' },
                  { id: 'terrain', name: 'Terrain', bg: 'bg-[url("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/12/1841/3196")]' },
                  { id: 'satellite', name: 'Satellite', bg: 'bg-[url("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1841/3196")]' },
                  { id: 'dark', name: 'Dark', bg: 'bg-[#111827]' }
                ].map((b) => (
                  <button key={b.id} onClick={() => setMapStyle(b.id as any)} className="flex flex-col items-center group">
                    <div className={`w-full h-10 rounded-lg border-2 ${mapStyle === b.id ? 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'border-[#374151] group-hover:border-gray-400'} ${b.bg} bg-cover bg-center transition-all`}></div>
                    <span className={`text-[10px] mt-1.5 font-bold ${mapStyle === b.id ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>{b.name}</span>
                  </button>
                ))}
              </div>

              <div className="border-t border-[#374151] my-3"></div>

              {/* Checkboxes */}
              <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center space-x-3">
                    <input type="checkbox" checked={showRadar} onChange={(e) => setShowRadar(e.target.checked)} className="w-4 h-4 rounded border-gray-500 text-blue-500 focus:ring-0 bg-[#111827] accent-blue-500" />
                    <span className="text-[12px] font-medium text-gray-200 group-hover:text-white transition-colors">เรดาร์คอมโพสิต</span>
                  </div>
                </label>
                
                {/* แถบปรับความโปร่งแสง (จะโชว์เมื่อเปิดเรดาร์) */}
                {showRadar && (
                  <div className="pl-7 pr-1 pb-2 pt-1">
                    <input type="range" min="0" max="1" step="0.1" value={radarOpacity} onChange={(e) => setRadarOpacity(parseFloat(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500" title={`ความโปร่งแสง ${Math.round(radarOpacity*100)}%`} />
                  </div>
                )}

                <div className="border-t border-[#374151]/50 my-2 pt-2"></div>

                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center space-x-3">
                    <input type="checkbox" checked={showBoluang} onChange={(e) => setShowBoluang(e.target.checked)} className="w-4 h-4 rounded border-gray-500 text-blue-500 focus:ring-0 bg-[#111827] accent-blue-500" />
                    <span className="text-[12px] font-medium text-gray-200 group-hover:text-white transition-colors">ขอบเขตตำบลบ่อหลวง</span>
                  </div>
                </label>

                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center space-x-3">
                    <input type="checkbox" checked={showBlock} onChange={(e) => setShowBlock(e.target.checked)} className="w-4 h-4 rounded border-gray-500 text-blue-500 focus:ring-0 bg-[#111827] accent-blue-500" />
                    <span className="text-[12px] font-medium text-gray-200 group-hover:text-white transition-colors">โซนหมู่บ้านย่อย (13 หมู่)</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setIsLayerMenuOpen(true)} className="absolute top-4 left-4 z-[1000] bg-[#1f2937]/90 p-2.5 rounded-xl border border-[#374151] text-white hover:bg-blue-600 transition-colors shadow-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        )}

        {/* 📊 Legend แถบสี (ซ้ายล่าง) */}
        <div className="absolute bottom-6 left-4 z-[1000] w-[130px] bg-[#1f2937]/95 backdrop-blur-md border border-[#374151] p-3 rounded-xl shadow-xl pointer-events-none">
          <div className="flex justify-between items-center border-b border-[#374151] pb-1.5 mb-2">
            <h3 className="text-[10px] font-bold text-gray-300">Radar<br/>dBZ</h3>
            <h3 className="text-[10px] font-bold text-gray-300 text-right">ฝน<br/>mm/hr</h3>
          </div>
          <div className="flex flex-col space-y-[2px]">
            {[
              { d: '66.5', m: '636', c: '#ff00ff' },
              { d: '64.0', m: '445', c: '#cc00cc' },
              { d: '61.5', m: '311', c: '#990099' },
              { d: '59.0', m: '217', c: '#660066' },
              { d: '56.5', m: '152', c: '#ff0000' },
              { d: '54.0', m: '106', c: '#cc0000' },
              { d: '51.5', m: '74.6', c: '#990000' },
              { d: '49.0', m: '52.2', c: '#ff6600' },
              { d: '46.5', m: '36.5', c: '#ff9900' },
              { d: '44.0', m: '25.6', c: '#ffcc00' },
              { d: '41.5', m: '17.9', c: '#ffff00' },
              { d: '39.0', m: '12.5', c: '#ccff00' },
              { d: '36.5', m: '8.76', c: '#99ff00' },
              { d: '34.0', m: '6.13', c: '#66ff00' },
              { d: '31.5', m: '4.29', c: '#33cc33' },
              { d: '29.0', m: '3.00', c: '#009900' },
              { d: '26.5', m: '2.10', c: '#006600' },
              { d: '24.0', m: '1.47', c: '#00ffcc' },
              { d: '21.5', m: '1.03', c: '#00ccff' },
              { d: '19.0', m: '0.72', c: '#0099ff' },
              { d: '16.5', m: '0.50', c: '#0066ff' },
            ].map((item, i) => (
              <div key={i} className="flex items-center text-[9px] font-mono justify-between">
                <span className="text-gray-400 w-6 text-right pr-1">{item.d}</span>
                <div className="w-4 h-3 flex-shrink-0" style={{ backgroundColor: item.c }}></div>
                <span className="text-gray-400 w-8 text-left pl-1">{item.m}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 🎛️ แผงควบคุมเวลา (Timeline Player) - ตรงกลางด้านล่าง */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[95%] max-w-[650px] z-[1000] pointer-events-auto">
          <div className="bg-[#1f2937]/95 border border-[#374151] rounded-xl p-3 shadow-2xl backdrop-blur-xl">
            
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#374151]/50">
              <div className="flex items-center space-x-2">
                <span className="text-[12px] font-bold text-white">Radar Composite</span>
                <span className={`text-[10px] font-bold ml-1 ${isNowcast ? 'text-orange-400' : 'text-blue-400'}`}>
                  ({isNowcast ? 'Nowcasting ล่วงหน้า' : 'ข้อมูลย้อนหลัง'})
                </span>
              </div>
              
              <div className="text-white font-mono font-bold text-[12px] bg-[#111827] px-2.5 py-1 rounded border border-[#374151]">
                {activeFrame ? new Date(activeFrame.time * 1000).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'} น.
              </div>
            </div>
            
            <div className="flex items-center space-x-4 px-1">
              <button onClick={() => { setIsPlaying(!isPlaying); if(!isPlaying && currentFrameIndex >= radarData?.frames?.length - 1) setCurrentFrameIndex(0); }} className="text-gray-400 hover:text-white transition-colors shrink-0">
                {isPlaying ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 9v6m4-6v6" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                )}
              </button>
              
              <div className="flex-1 relative flex items-center h-5">
                <input 
                  type="range" min="0" max={(radarData?.frames?.length || 1) - 1} value={currentFrameIndex}
                  onChange={(e) => { setIsPlaying(false); setCurrentFrameIndex(parseInt(e.target.value)); }}
                  className="w-full h-1.5 bg-[#374151] rounded-lg appearance-none cursor-pointer accent-blue-500 z-10"
                />
                {radarData && (
                  <div 
                    className="absolute h-3 w-1 bg-white z-0 rounded" 
                    style={{ left: `${((radarData.pastCount - 1) / (radarData.frames.length - 1)) * 100}%` }}
                  ></div>
                )}
              </div>

              <div className="text-[10px] text-gray-400 font-mono shrink-0">
                <span className="text-blue-400">ปัจจุบัน (T=0)</span> เฟรม {currentFrameIndex + 1}/{radarData?.frames?.length || 0}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
