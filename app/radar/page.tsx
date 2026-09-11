'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// โหลด Leaflet แบบ Dynamic (เพื่อไม่ให้พังใน Next.js)
const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then((mod) => mod.GeoJSON), { ssr: false });

export default function RadarPage() {
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [radarData, setRadarData] = useState<any>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const mapRef = useRef<any>(null);
  
  // ตำแหน่งศูนย์กลางบ่อหลวง
  const center = { lat: 18.1633, lng: 98.3744 };

  // 1. โหลดเส้นขอบเขตบ่อหลวง
  useEffect(() => {
    fetch('/geojson/boluang.json')
      .then(res => res.json())
      .then(data => setGeoBoluang(data))
      .catch(err => console.error("Error loading boundaries", err));
  }, []);

  // 2. โหลดข้อมูลภาพเรดาร์จาก RainViewer API
  useEffect(() => {
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(res => res.json())
      .then(data => {
        // ใช้ภาพ past (อดีต) 3 เฟรม และ nowcast (คาดการณ์ล่วงหน้า)
        const combinedFrames = [...(data.radar.past || []), ...(data.radar.nowcast || [])];
        setRadarData({
          host: data.host,
          frames: combinedFrames
        });
        // เริ่มเล่นจากเฟรมปัจจุบัน (อดีตล่าสุด)
        setCurrentFrameIndex(data.radar.past.length - 1);
      });
  }, []);

  // 3. ระบบเล่นภาพเคลื่อนไหว (Animation Loop)
  useEffect(() => {
    let interval: any;
    if (isPlaying && radarData?.frames?.length > 0) {
      interval = setInterval(() => {
        setCurrentFrameIndex((prevIndex) => {
          const nextIndex = prevIndex + 1;
          return nextIndex >= radarData.frames.length ? 0 : nextIndex; // วนลูป
        });
      }, 1000); // เปลี่ยนภาพทุกๆ 1 วินาที
    }
    return () => clearInterval(interval);
  }, [isPlaying, radarData]);

  // สไตล์เส้นขอบเขต
  const boundaryStyle = { color: '#ffffff', weight: 2, fill: false, opacity: 0.8, dashArray: '5,5' };

  // URL ภาพเรดาร์ที่กำลังแสดงอยู่
  const activeFrame = radarData?.frames[currentFrameIndex];
  const radarUrl = activeFrame ? `${radarData.host}${activeFrame.path}/256/{z}/{x}/{y}/4/1_1.png` : '';

  return (
    <div className="relative w-screen h-screen bg-[#0b132b] overflow-hidden font-sans text-white">
      
      {/* 🚀 Header */}
      <header className="absolute top-0 left-0 right-0 h-16 bg-[#0b132b]/90 border-b border-[#1e293b] backdrop-blur-md z-[1000] flex items-center justify-between px-4 shadow-md pointer-events-auto">
        <div className="flex items-center space-x-3">
          <button onClick={() => window.close()} className="p-2 bg-[#1e293b] hover:bg-rose-500 rounded-lg text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div>
            <h1 className="text-[16px] font-bold tracking-wide">เรดาร์และปริมาณฝน (Nowcast)</h1>
            <p className="text-[11px] text-[#38bdf8]">เทศบาลตำบลบ่อหลวง จ.เชียงใหม่</p>
          </div>
        </div>
      </header>

      {/* 🗺️ แผนที่หลัก */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={[center.lat, center.lng]} zoom={12} maxZoom={16} zoomControl={false} attributionControl={false} className="w-full h-full">
          {/* แผนที่ดาวเทียม */}
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          
          {/* เส้นขอบเขตบ่อหลวง */}
          {geoBoluang && <GeoJSON data={geoBoluang} style={boundaryStyle} />}
          
          {/* 🌧️ Layer เรดาร์ฝน (เปลี่ยนภาพตาม State) */}
          {radarUrl && <TileLayer key={radarUrl} url={radarUrl} opacity={0.6} zIndex={100} />}
        </MapContainer>
      </div>

      {/* 🎛️ แผงควบคุมด้านล่าง (Timeline) */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-[#0f172a]/95 border border-[#1e293b] rounded-2xl p-4 shadow-2xl z-[1000] w-[90%] max-w-md backdrop-blur-md pointer-events-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-bold text-white flex items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
            Radar Composite (Nowcasting)
          </span>
          <span className="text-[12px] text-[#38bdf8] font-mono bg-[#38bdf8]/10 px-2 py-0.5 rounded border border-[#38bdf8]/30">
            {activeFrame ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH') : '--:--'}
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-center shadow-lg flex-shrink-0"
          >
            {isPlaying ? (
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" /></svg>
            ) : (
              <svg className="w-5 h-5 text-white ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
            )}
          </button>
          
          <div className="flex-1">
            <input 
              type="range" 
              min="0" 
              max={(radarData?.frames?.length || 1) - 1} 
              value={currentFrameIndex}
              onChange={(e) => {
                setIsPlaying(false); // หยุดเล่นเมื่อผู้ใช้เลื่อนเอง
                setCurrentFrameIndex(parseInt(e.target.value));
              }}
              className="w-full accent-blue-500"
            />
          </div>
        </div>
      </div>

    </div>
  );
}
