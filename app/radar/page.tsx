'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then((mod) => mod.GeoJSON), { ssr: false });

export default function RadarPage() {
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [radarData, setRadarData] = useState<any>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'dark'>('satellite');
  const [radarOpacity, setRadarOpacity] = useState(0.6);
  
  const mapRef = useRef<any>(null);
  const center = { lat: 18.1633, lng: 98.3744 };

  useEffect(() => {
    fetch('/geojson/boluang.json')
      .then(res => res.json())
      .then(data => setGeoBoluang(data))
      .catch(err => console.error("Error loading boundaries", err));
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
            setIsPlaying(false); // หยุดเมื่อเล่นจบ
            return prevIndex;
          }
          return nextIndex;
        });
      }, 1200); 
    }
    return () => clearInterval(interval);
  }, [isPlaying, radarData]);

  const activeFrame = radarData?.frames[currentFrameIndex];
  // color scheme 4 = TITAN (สีเหมือนกรมอุตุฯ), 1_1 = smooth & snow
  const radarUrl = activeFrame ? `${radarData.host}${activeFrame.path}/256/{z}/{x}/{y}/4/1_1.png` : '';
  const isNowcast = currentFrameIndex >= (radarData?.pastCount || 0);

  return (
    <div className="relative w-screen h-screen bg-[#0b132b] overflow-hidden font-sans text-white flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: #0b132b !important; }
        .dark-map { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%); }
      `}} />

      {/* 🚀 Header */}
      <header className="h-16 bg-[#0b132b]/95 border-b border-[#1e293b] backdrop-blur-md z-[1000] flex items-center justify-between px-4 shadow-md shrink-0">
        <div className="flex items-center space-x-3">
          <button onClick={() => { if(window.history.length > 1) window.close(); else window.location.href = '/'; }} className="p-2 bg-[#1e293b] hover:bg-rose-500 rounded-lg text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="text-[15px] md:text-[16px] font-bold tracking-wide flex items-center">
              <span className="mr-2">📡</span> เรดาร์และปริมาณฝน (Nowcast)
            </h1>
            <p className="text-[11px] text-[#38bdf8]">ศูนย์ข้อมูล GIS เทศบาลตำบลบ่อหลวง</p>
          </div>
        </div>
      </header>

      <div className="relative flex-1">
        {/* 🗺️ แผนที่หลัก */}
        <div className="absolute inset-0 z-0">
          <MapContainer center={[center.lat, center.lng]} zoom={12} maxZoom={16} zoomControl={false} attributionControl={false} className="w-full h-full">
            {mapStyle === 'satellite' ? (
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            ) : (
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="dark-map" />
            )}
            
            {geoBoluang && <GeoJSON data={geoBoluang} style={{ color: '#ffffff', weight: 2.5, fill: false, opacity: 0.9, dashArray: '6,6' }} />}
            
            {radarUrl && <TileLayer key={`${radarUrl}-${radarOpacity}`} url={radarUrl} opacity={radarOpacity} zIndex={100} />}
          </MapContainer>
        </div>

        {/* 🎛️ แผงจัดการชั้นข้อมูล (ซ้ายบน) */}
        <div className="absolute top-4 left-4 z-[1000] flex flex-col space-y-3 pointer-events-auto w-[220px]">
          <div className="bg-[#0f172a]/90 backdrop-blur-md border border-[#1e293b] p-3.5 rounded-2xl shadow-xl">
            <h3 className="text-[12px] font-bold text-gray-400 mb-3 tracking-widest uppercase">จัดการแผนที่</h3>
            
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => setMapStyle('dark')} className={`flex flex-col items-center justify-center p-2 rounded-xl border ${mapStyle === 'dark' ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-[#1e293b] border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                <div className="w-8 h-8 bg-gray-900 rounded border border-gray-700 mb-1"></div>
                <span className="text-[10px] font-bold">Dark Map</span>
              </button>
              <button onClick={() => setMapStyle('satellite')} className={`flex flex-col items-center justify-center p-2 rounded-xl border ${mapStyle === 'satellite' ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-[#1e293b] border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                <div className="w-8 h-8 bg-[url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1841/3196')] bg-cover rounded border border-gray-700 mb-1"></div>
                <span className="text-[10px] font-bold">Satellite</span>
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-400 font-bold mb-1">
                <span>ความชัดเรดาร์</span>
                <span>{Math.round(radarOpacity * 100)}%</span>
              </div>
              <input type="range" min="0" max="1" step="0.1" value={radarOpacity} onChange={(e) => setRadarOpacity(parseFloat(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>

          {/* 📊 Legend แถบสี (ซ้ายล่าง) */}
          <div className="bg-[#0f172a]/90 backdrop-blur-md border border-[#1e293b] p-3.5 rounded-2xl shadow-xl">
            <h3 className="text-[11px] font-bold text-gray-400 mb-2 tracking-widest text-center">ความรุนแรงฝน (mm/hr)</h3>
            <div className="flex flex-col space-y-1 mt-3">
              {[
                { c: '#990099', t: '100+ (รุนแรงมาก)' },
                { c: '#FF0000', t: '50.0 (ตกหนักมาก)' },
                { c: '#FF6600', t: '25.0 (ตกหนัก)' },
                { c: '#FFCC00', t: '10.0 (ปานกลาง)' },
                { c: '#33CC33', t: '2.5 (ตกเล็กน้อย)' },
                { c: '#0099FF', t: '1.0 (ปรอยๆ)' },
                { c: '#00FFFF', t: '0.1 (ละอองฝน)' },
              ].map((item, i) => (
                <div key={i} className="flex items-center text-[10px] font-mono">
                  <div className="w-4 h-4 rounded-sm mr-2 shadow-sm" style={{ backgroundColor: item.c }}></div>
                  <span className="text-gray-300">{item.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 🎛️ แผงควบคุมเวลา (Timeline Player) - ตรงกลางด้านล่าง */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[95%] max-w-[600px] z-[1000] pointer-events-auto">
          <div className="bg-[#0f172a]/95 border border-[#1e293b] rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            
            <div className="flex items-center justify-between mb-3 border-b border-[#1e293b] pb-3">
              <div className="flex items-center space-x-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-rose-500 animate-pulse' : 'bg-gray-500'}`}></span>
                <span className="text-[14px] font-bold text-white">Radar Composite</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${isNowcast ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-blue-500/20 text-blue-400 border border-blue-500/50'}`}>
                  {isNowcast ? 'พยากรณ์ล่วงหน้า (Nowcast)' : 'ข้อมูลในอดีต (Past)'}
                </span>
              </div>
              
              <div className="text-[#38bdf8] font-mono font-bold text-[15px] bg-[#0b132b] px-3 py-1 rounded-lg border border-[#1e293b] shadow-inner">
                {activeFrame ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'} น.
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button onClick={() => { setIsPlaying(!isPlaying); if(!isPlaying && currentFrameIndex >= radarData?.frames?.length - 1) setCurrentFrameIndex(0); }} className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg hover:scale-105 transition-transform shrink-0 border border-blue-400">
                {isPlaying ? (
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 9v6m4-6v6" /></svg>
                ) : (
                  <svg className="w-5 h-5 text-white ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                )}
              </button>
              
              <div className="flex-1 relative flex items-center">
                <input 
                  type="range" min="0" max={(radarData?.frames?.length || 1) - 1} value={currentFrameIndex}
                  onChange={(e) => { setIsPlaying(false); setCurrentFrameIndex(parseInt(e.target.value)); }}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 z-10"
                />
                {/* ขีดคั่นระหว่างอดีตกับอนาคต */}
                {radarData && (
                  <div 
                    className="absolute h-4 w-1 bg-orange-500 z-0 rounded" 
                    style={{ left: `${((radarData.pastCount - 1) / (radarData.frames.length - 1)) * 100}%` }}
                    title="เวลาปัจจุบัน"
                  ></div>
                )}
              </div>
            </div>

            <div className="flex justify-between mt-2 text-[10px] text-gray-500 font-bold px-14">
              <span>- 2 ชั่วโมง</span>
              <span className="text-orange-400">เวลาปัจจุบัน</span>
              <span>+ 30 นาที</span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
