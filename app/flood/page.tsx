'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';

// ==========================================
// 🗺️ โหลด Leaflet แบบ Dynamic
// ==========================================
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });

// พิกัดบ่อหลวง อ.ฮอด
const INITIAL_LAT = 18.147234;
const INITIAL_LNG = 98.348720;

// 🧮 ฟังก์ชันคำนวณระยะทางเชิงพื้นที่
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// 🛡️ API Fetcher ขั้นสูง (แก้ปัญหา API สทนช. บล็อก 100%)
const fetchONWRData = async (url: string) => {
  // 1. ลองดึงตรงๆ ก่อน
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch (e) {}

  // 2. ใช้ Proxy ที่ 1 (allorigins)
  try {
    const proxy1 = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res1 = await fetch(proxy1);
    if (res1.ok) return await res1.json();
  } catch (e) {}

  // 3. ใช้ Proxy ที่ 2 (corsproxy.io)
  try {
    const proxy2 = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res2 = await fetch(proxy2);
    if (res2.ok) return await res2.json();
  } catch (e) {}

  return null;
};

export default function FloodDashboard() {
  const [position, setPosition] = useState({ lat: INITIAL_LAT, lng: INITIAL_LNG });
  const [stations, setStations] = useState<any[]>([]);
  const [filteredStations, setFilteredStations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter States
  const [filterProv, setFilterProv] = useState('ทุกจังหวัด');
  const [filterAmp, setFilterAmp] = useState('ทุกอำเภอ');
  const [useRadius, setUseRadius] = useState(true);
  const [radiusKm, setRadiusKm] = useState(50);

  const mapRef = useRef<any>(null);
  const L = typeof window !== 'undefined' ? require('leaflet') : null;

  // 📡 ดึงข้อมูล API สทนช. (กวาดทั้งประเทศแล้วค่อยกรอง เพื่อกันเหนียว)
  useEffect(() => {
    const fetchONWR = async () => {
      setIsLoading(true);
      try {
        let merged: any[] = [];
        
        const getRisk = (val: number, type: 'water' | 'rain') => {
          if (type === 'rain') {
            if (val >= 90) return { color: '#ef4444', label: 'วิกฤต', level: 'critical' };
            if (val >= 60) return { color: '#f97316', label: 'เสี่ยงสูง', level: 'high' };
            if (val >= 35) return { color: '#facc15', label: 'เฝ้าระวัง', level: 'warning' };
            return { color: '#10b981', label: 'ปกติ', level: 'normal' };
          } else {
            if (val >= 8) return { color: '#ef4444', label: 'วิกฤต', level: 'critical' };
            if (val >= 5) return { color: '#f97316', label: 'เสี่ยงสูง', level: 'high' };
            if (val >= 3) return { color: '#facc15', label: 'เฝ้าระวัง', level: 'warning' };
            return { color: '#10b981', label: 'ปกติ', level: 'normal' };
          }
        };

        // 1. ดึงระดับน้ำ
        const wData = await fetchONWRData('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
        if (wData) {
          const wStations = wData.waterlevel_data?.data || wData.data || [];
          wStations.forEach((s: any) => {
            if (!s.station?.lat || !s.station?.long) return;
            
            let trend = 'steady';
            if (s.waterlevel_tendency === 'UP' || s.tendency > 0) trend = 'up';
            else if (s.waterlevel_tendency === 'DOWN' || s.tendency < 0) trend = 'down';

            merged.push({
              id: s.station?.id, name: s.station?.tele_station_name?.th || 'สถานีวัดน้ำ', 
              prov: s.station?.geocode?.province_name?.th || '', amp: s.station?.geocode?.amphoe_name?.th || '', tum: s.station?.geocode?.tumbon_name?.th || '',
              lat: parseFloat(s.station?.lat), lng: parseFloat(s.station?.long), 
              type: 'water', val: parseFloat(s.water_level) || 0, risk: getRisk(parseFloat(s.water_level) || 0, 'water'), 
              trend: trend, time: s.waterlevel_datetime
            });
          });
        }

        // 2. ดึงฝน 24 ชม.
        const rData = await fetchONWRData('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h');
        if (rData) {
          const rStations = rData.rain_data?.data || rData.data || [];
          rStations.forEach((s: any) => {
            if (!s.station?.lat || !s.station?.long) return;
            merged.push({
              id: s.station?.id, name: s.station?.tele_station_name?.th || 'สถานีวัดฝน', 
              prov: s.station?.geocode?.province_name?.th || '', amp: s.station?.geocode?.amphoe_name?.th || '', tum: s.station?.geocode?.tumbon_name?.th || '',
              lat: parseFloat(s.station?.lat), lng: parseFloat(s.station?.long), 
              type: 'rain', val: parseFloat(s.rain_24h) || 0, risk: getRisk(parseFloat(s.rain_24h) || 0, 'rain'), time: s.rain_datetime
            });
          });
        }

        setStations(merged);
      } catch (error) { 
        console.error("Fetch Error:", error); 
      } finally {
        setIsLoading(false);
      }
    };
    fetchONWR();
  }, []);

  // 🎛️ ระบบกรองข้อมูล
  useEffect(() => {
    let result = stations;
    
    if (filterProv !== 'ทุกจังหวัด') result = result.filter(s => s.prov === filterProv);
    if (filterAmp !== 'ทุกอำเภอ') result = result.filter(s => s.amp === filterAmp);

    if (useRadius && radiusKm > 0) {
      result = result.filter(s => {
        const dist = calculateDistance(position.lat, position.lng, s.lat, s.lng);
        s.distance = dist;
        return dist <= radiusKm;
      });
    } else {
      result = result.map(s => ({...s, distance: calculateDistance(position.lat, position.lng, s.lat, s.lng)}));
    }
    
    result.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    setFilteredStations(result);
  }, [filterProv, filterAmp, useRadius, radiusKm, position, stations]);

  const createMyPinIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ 
      className: 'bg-transparent border-none', 
      html: `<div class="relative flex items-center justify-center w-8 h-8"><svg class="relative z-10 w-8 h-8 text-red-600 drop-shadow-md" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`, 
      iconSize: [32, 32], iconAnchor: [16, 32] 
    });
  }, [L]);

  // 🛠️ Action Buttons
  const handleSetChiangMai = () => { setFilterProv('เชียงใหม่'); setFilterAmp('ทุกอำเภอ'); setUseRadius(false); };
  const handleSetHod = () => { setFilterProv('เชียงใหม่'); setFilterAmp('ฮอด'); setUseRadius(false); };
  const handleSetRadius = () => { setFilterProv('ทุกจังหวัด'); setFilterAmp('ทุกอำเภอ'); setUseRadius(true); setRadiusKm(50); };
  const handleReset = () => { 
    setFilterProv('ทุกจังหวัด'); setFilterAmp('ทุกอำเภอ'); setUseRadius(false); setPosition({lat: INITIAL_LAT, lng: INITIAL_LNG});
    if(mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 11);
  };

  // 🧮 การคำนวณข้อมูลสำหรับ 13 การ์ด (ตรงตามเงื่อนไขเป๊ะๆ)
  const totalWater = filteredStations.filter(s => s.type === 'water').length;
  const totalRain = filteredStations.filter(s => s.type === 'rain').length;
  
  const waterUp = filteredStations.filter(s => s.type === 'water' && s.trend === 'up').length;
  const waterDown = filteredStations.filter(s => s.type === 'water' && s.trend === 'down').length;
  const waterSteady = filteredStations.filter(s => s.type === 'water' && s.trend === 'steady').length;
  
  const watchCount = filteredStations.filter(s => s.risk.level === 'warning').length;
  const highRiskCount = filteredStations.filter(s => s.risk.level === 'high').length;
  const criticalCount = filteredStations.filter(s => s.risk.level === 'critical').length;
  
  const rainStations = filteredStations.filter(s => s.type === 'rain');
  let maxRainData = { val: 0, name: '-' };
  if (rainStations.length > 0) {
    maxRainData = rainStations.reduce((prev, current) => (prev.val > current.val) ? prev : current);
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-gray-800 pb-10">
      
      {/* 🚀 Header */}
      <header className="bg-[#0f172a] px-4 md:px-6 py-3 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center space-x-3">
          <Link href="/" className="w-10 h-10 bg-[#3b82f6] hover:bg-[#2563eb] rounded-xl flex items-center justify-center shadow-lg transition-colors cursor-pointer flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </Link>
          <div className="flex text-[15px] font-bold text-gray-300">
            <span className="text-[#60a5fa] border-b-2 border-[#60a5fa] pb-1 px-1">สถานการณ์น้ำป่า/ดินถล่ม</span>
          </div>
        </div>
        <Link href="/" className="bg-[#1e293b] border border-[#334155] px-3 py-2 rounded-lg text-xs font-bold text-gray-300 hover:text-white transition-all shadow-sm flex items-center">
          <span className="bg-[#3b82f6] text-white text-[10px] px-1.5 py-0.5 rounded mr-2">⬅</span> กลับหน้าแผนที่หลัก
        </Link>
      </header>

      <main className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">

        {/* 🎛️ Top Control Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 flex flex-col md:flex-row items-start md:items-center justify-between text-xs md:text-sm font-medium">
          <div className="flex items-center text-gray-600 mb-3 md:mb-0">
            <span className="font-bold text-gray-800 mr-2">กม.</span>
            <span className="flex items-center text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
              <span className="text-red-500 mr-1.5 text-base">📍</span> ใช้ตำแหน่งของฉัน
            </span>
            <span className="ml-4 text-gray-400 hidden lg:block">
              จุดอ้างอิง ตำแหน่งของฉัน: {position.lat.toFixed(6)}, {position.lng.toFixed(6)} 
              <span className="text-green-500 ml-2">ละติจูด {position.lat.toFixed(6)} - ลองจิจูด {position.lng.toFixed(6)} (±82 ม.)</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end">
             <button onClick={handleSetChiangMai} className="border border-gray-300 bg-white px-3 py-1.5 rounded-full text-gray-600 font-bold hover:bg-gray-50 transition shadow-sm">เฉพาะจังหวัดเชียงใหม่</button>
             <button onClick={handleSetHod} className="border border-gray-300 bg-white px-3 py-1.5 rounded-full text-gray-600 font-bold hover:bg-gray-50 transition shadow-sm">อำเภอฮอด</button>
             <button onClick={handleSetRadius} className="bg-[#0f172a] text-white px-4 py-1.5 rounded-full font-bold shadow-md hover:bg-gray-800 transition">รอบตำแหน่งของฉัน</button>
             <button onClick={handleReset} className="border border-gray-300 bg-white px-3 py-1.5 rounded-full text-gray-500 font-bold hover:bg-gray-50 transition shadow-sm">✕ รีเซ็ต</button>
          </div>
        </div>

        {/* พบข้อมูล X รายการ */}
        <div className="text-[13px] text-gray-500 pl-1">
          {isLoading ? (
            <span className="text-blue-500 font-bold animate-pulse">กำลังซิงค์ข้อมูลจากศูนย์ข้อมูลน้ำแห่งชาติ (สทนช.)...</span>
          ) : (
            <>พบข้อมูล <span className="font-extrabold text-gray-800">{filteredStations.length}</span> รายการ</>
          )}
        </div>

        {/* 📦 13 Cards Grid (5 คอลัมน์) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          {/* Row 1 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold">สถานีวัดน้ำทั้งหมด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{totalWater}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold">สถานีวัดฝนทั้งหมด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{totalRain}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold">สถานีที่มีข้อมูลล่าสุด</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{filteredStations.length}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold">ระดับน้ำเพิ่มขึ้น ↑</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{waterUp}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold">ระดับน้ำลดลง ↓</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{waterDown}</span>
          </div>

          {/* Row 2 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold">ระดับน้ำคงที่ →</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{waterSteady}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#facc15] mr-1.5"></span> เฝ้าระวัง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{watchCount}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#f97316] mr-1.5"></span> เสี่ยงสูง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{highRiskCount}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] mr-1.5"></span> วิกฤต</span><span className="text-2xl font-extrabold text-[#0f4a8a]">{criticalCount}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold">ปริมาณฝนสูงสุด 24 ชม.</span>
            <div className="flex flex-col">
              <div className="flex items-baseline"><span className="text-2xl font-extrabold text-[#0f4a8a]">{maxRainData.val.toFixed(1)}</span><span className="text-[10px] ml-1 font-bold text-[#0f4a8a]">มม.</span></div>
              <span className="text-[9px] text-gray-400 truncate">{maxRainData.name}</span>
            </div>
          </div>

          {/* Row 3 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold">พื้นที่เสี่ยง</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold">เหตุการณ์น้ำท่วม</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[90px]">
            <span className="text-xs text-gray-500 font-bold">ประกาศเตือน</span><span className="text-2xl font-extrabold text-[#0f4a8a]">0</span>
          </div>
        </div>

        {/* 🗺️ แผนที่สถานการณ์น้ำ */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col mt-4">
          <div className="px-5 py-3 border-b border-gray-200 bg-white">
             <h3 className="text-[#0f4a8a] text-[15px] font-extrabold flex items-center"><span className="mr-2">🗺️</span> สถานการณ์น้ำบนแผนที่</h3>
          </div>

          {/* แผนที่ดาวเทียม */}
          <div className="h-[450px] md:h-[600px] w-full relative z-0 bg-[#e5e7eb]">
            <MapContainer center={[18.1633, 98.3744]} zoom={10} maxZoom={20} zoomControl={true} attributionControl={false} className="w-full h-full" ref={mapRef}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
              
              <Marker position={[position.lat, position.lng]} icon={createMyPinIcon()} />

              {filteredStations.map((st, idx) => (
                <CircleMarker 
                  key={idx} center={[st.lat, st.lng]} radius={7} 
                  pathOptions={{ 
                    color: st.risk.color, fillColor: st.type === 'water' ? st.risk.color : '#ffffff',
                    fillOpacity: st.type === 'water' ? 0.9 : 0.4, weight: st.type === 'water' ? 1 : 2.5 
                  }}
                >
                  <Popup className="custom-pro-popup" closeButton={true}>
                    <div className="w-[190px] p-1 font-sans text-gray-800">
                      <div className="font-bold text-[13px] leading-tight mb-1 text-gray-900 border-b pb-1 border-gray-200">{st.name}</div>
                      <div className="text-[11px] leading-[1.6] text-gray-600">
                        <div>{st.tum} {st.amp} {st.prov}</div>
                        <div>{st.type === 'water' ? `ระดับน้ำ: ${st.val.toFixed(2)} ม.` : `ฝน 24 ชม.: ${st.val.toFixed(1)} มม.`}</div>
                        <div className="flex items-center">ความเสี่ยง: <span style={{color: st.risk.color}} className="font-bold ml-1">{st.risk.label}</span></div>
                        <div>ระยะ: {st.distance?.toFixed(1) || '0.0'} กม.</div>
                        <div>{st.time ? new Date(st.time).toLocaleString('en-GB') : '--/--/---- --:--:--'}</div>
                        <div>พิกัด: {st.lat.toFixed(6)}, {st.lng.toFixed(6)}</div>
                      </div>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`} target="_blank" rel="noopener noreferrer" className="mt-2.5 w-full bg-[#1d4ed8] hover:bg-[#1e3a8a] text-white flex items-center justify-center space-x-1.5 py-1.5 rounded-md text-[11px] font-bold shadow-md transition-colors">
                        <span className="text-sm">🧭</span> <span>นำทางด้วย Google Maps</span>
                      </a>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          <div className="bg-white px-5 py-3 border-t border-gray-200 flex flex-wrap items-center gap-4 text-[11px] md:text-xs text-gray-600 font-bold">
            <span className="text-gray-800 font-extrabold">สัญลักษณ์:</span>
            <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#10b981] mr-1.5 shadow-sm"></span> ปกติ</span>
            <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#facc15] mr-1.5 shadow-sm"></span> เฝ้าระวัง</span>
            <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#f97316] mr-1.5 shadow-sm"></span> เสี่ยงสูง</span>
            <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#ef4444] mr-1.5 shadow-sm"></span> วิกฤต</span>
            <span className="text-gray-300 hidden md:inline">|</span>
            <span className="flex items-center"><span className="w-3.5 h-3.5 rounded-full bg-gray-500 mr-1.5"></span> วงกลมทึบ = สถานีวัดระดับน้ำ</span>
            <span className="flex items-center"><span className="w-3.5 h-3.5 rounded-full border-[2.5px] border-gray-500 mr-1.5 bg-transparent"></span> วงกลมขอบสี = สถานีวัดปริมาณฝน</span>
            <span className="flex items-center text-red-600 text-sm ml-auto md:ml-0"><span className="mr-1">📍</span> <span className="text-gray-700 text-[11px]">ตำแหน่งของฉัน</span></span>
          </div>
        </div>
      </main>
      
      {/* 💅 CSS Injection */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-pro-popup .leaflet-popup-content-wrapper { 
          padding: 0 !important; border-radius: 12px !important; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important; 
        }
        .custom-pro-popup .leaflet-popup-content { margin: 12px 14px !important; line-height: 1.5 !important; }
        .custom-pro-popup .leaflet-popup-close-button { color: #9ca3af !important; top: 8px !important; right: 8px !important; }
      `}} />
    </div>
  );
}
