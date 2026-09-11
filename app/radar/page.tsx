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
  
  const [mapStyle, setMapStyle] = useState<'light' | 'terrain' | 'satellite' | 'dark'>('dark');
  const [showRadar, setShowRadar] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.7);
  const [showBoluang, setShowBoluang] = useState(true);
  const [showBlock, setShowBlock] = useState(false);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(true);
  
  const [clickedLocation, setClickedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [forecastData, setForecastData] = useState<any>(null);
  const [isFetchingForecast, setIsFetchingForecast] = useState(false);

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

  // 🗺️ เปลี่ยนเป็นแผนที่ Google 100% (ไม่มีวันพัง ไม่มีกล่อง Zoom Level Not Supported)
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
    } catch (error) {
      console.error(error);
    } finally {
      setIsFetchingForecast(false);
    }
  };

  const getRainText = (rainMm: number) => {
    if (rainMm <= 0.1) return { text: 'ไม่มีฝน', color: 'text-gray-400', icon: '☀️' };
    if (rainMm <= 2.5) return { text: 'ฝนเล็กน้อย', color: 'text-green-400', icon: '🌦️' };
    if (rainMm <= 10.0) return { text: 'ฝนปานกลาง', color: 'text-yellow-400', icon: '🌧️' };
    return { text: 'ฝนตกหนัก', color: 'text-red-500', icon: '⛈️' };
  };

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const customPinIcon = L ? L.divIcon({ className: 'bg-transparent border-none', html: `<div class="relative flex items-center justify-center w-8 h-8"><div class="absolute inset-0 bg-blue-500 rounded-full blur-[4px] opacity-60 animate-ping"></div><div class="relative flex items-center justify-center w-5 h-5 bg-[#38bdf8] border-2 border-white rounded-full shadow-lg z-10"></div></div>`, iconSize: [32, 32], iconAnchor: [16, 16] }) : null;

  const activeFrame = radarData?.frames[currentFrameIndex];
  const radarUrl = (showRadar && activeFrame) ? `${radarData.host}${activeFrame.path}/256/{z}/{x}/{y}/4/1_1.png` : '';
  const isNowcast = currentFrameIndex >= (radarData?.pastCount || 0);

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
      `}} />

      <header className="h-[50px] bg-[#1A1D24] border-b border-[#2D323B] z-[1000] flex items-center justify-between px-4 shrink-0 shadow-sm">
        <div className="flex items-center space-x-3">
          <button onClick={() => { if(window.history.length > 1) window.close(); else window.location.href = '/'; }} className="text-[#8B94A5] hover:text-white transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
          <h1 className="text-[14px] font-bold tracking-wide text-[#E5E7EB]">เรดาร์และปริมาณฝน (Nowcast) <span className="text-[11px] text-[#4178F3] font-normal ml-2 hidden md:inline">เทศบาลตำบลบ่อหลวง จ.เชียงใหม่</span></h1>
        </div>
      </header>

      <div className="relative flex-1">
        <div className="absolute inset-0 z-0">
          <MapContainer center={[center.lat, center.lng]} zoom={11} maxZoom={20} zoomControl={false} attributionControl={false} className="w-full h-full">
            {/* 🔥 Google Map TileLayer (ตั้งค่าให้รองรับ Dark Mode) */}
            <TileLayer url={getBasemapUrl()} maxZoom={20} className={mapStyle === 'dark' ? 'dark-map' : ''} />
            
            {showBoluang && geoBoluang && <GeoJSON data={geoBoluang} style={{ color: '#E5E7EB', weight: 1.5, fill: false, opacity: 0.8, dashArray: '4,4' }} />}
            {showBlock && geoBlock && <GeoJSON data={geoBlock} style={{ color: '#F59E0B', weight: 1, fill: false, opacity: 0.4 }} />}
            
            {/* 🔥 เรดาร์กันแครช (maxNativeZoom=12 คือคีย์สำคัญ) */}
            {radarUrl && <TileLayer key={activeFrame?.path} url={radarUrl} opacity={radarOpacity} zIndex={100} maxNativeZoom={12} maxZoom={20} />}
            
            <ClickableMap onMapClick={handleMapClick} />
            {clickedLocation && customPinIcon && <Marker position={[clickedLocation.lat, clickedLocation.lng]} icon={customPinIcon} />}
          </MapContainer>
        </div>

        {isLayerMenuOpen && (
          <div className="absolute top-4 left-4 z-[1000] w-[260px] onwr-panel flex flex-col pointer-events-auto">
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
          <button onClick={() => setIsLayerMenuOpen(true)} className="absolute top-4 left-4 z-[1000] p-2 bg-[#232732] border border-[#333946] rounded-lg shadow-md hover:bg-[#2D323B] transition-colors pointer-events-auto text-[#8B94A5] hover:text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
        )}

        {/* 🌟 Popup พยากรณ์อากาศแบบ ONWR */}
        {clickedLocation && (
          <div className="absolute top-4 right-4 z-[1050] w-[320px] onwr-panel flex flex-col pointer-events-auto animate-fade-in shadow-2xl">
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

                  <button onClick={() => setClickedLocation(null)} className="w-full mt-2 py-2.5 bg-[#4178F3] hover:bg-blue-600 text-white rounded-lg text-[13px] font-bold transition-colors shadow-lg">ปิดหน้าต่าง</button>
                </>
              ) : (
                <div className="text-center py-4 text-[#8B94A5] text-[12px]">ไม่สามารถดึงข้อมูลได้</div>
              )}
            </div>
          </div>
        )}

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
    </div>
  );
}
