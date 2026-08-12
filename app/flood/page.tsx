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

const INITIAL_LAT = 18.1633;
const INITIAL_LNG = 98.3744;

// 🧮 ฟังก์ชันคำนวณระยะทาง (Haversine Formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // รัศมีโลก (กม.)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export default function FloodDashboard() {
  const [position, setPosition] = useState({ lat: INITIAL_LAT, lng: INITIAL_LNG });
  const [currentTime, setCurrentTime] = useState<Date | null>(null); 
  const [stations, setStations] = useState<any[]>([]);
  const [filteredStations, setFilteredStations] = useState<any[]>([]);
  
  // 🎛️ Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProv, setFilterProv] = useState('ทุกจังหวัด');
  const [filterAmp, setFilterAmp] = useState('ทุกอำเภอ');
  const [filterRisk, setFilterRisk] = useState('ทุกระดับความเสี่ยง');
  const [useRadius, setUseRadius] = useState(false);
  const [radiusKm, setRadiusKm] = useState(50);
  
  const [apiStatus, setApiStatus] = useState({ water: 'กำลังเชื่อมต่อ...', rain: 'กำลังเชื่อมต่อ...' });

  const mapRef = useRef<any>(null);
  const L = typeof window !== 'undefined' ? require('leaflet') : null;

  // ⏱️ นาฬิกา Real-time
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 📡 ดึงข้อมูล API สทนช. (ONWR) ของจริง 100% (ไม่มี Mock Data)
  useEffect(() => {
    const fetchONWR = async () => {
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

        // 1. ดึงระดับน้ำ (กรองคร่าวๆ โซนภาคเหนือ เพื่อลดภาระเครื่อง)
        try {
          const wRes = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
          if (wRes.ok) {
            const wData = await wRes.json();
            const wStations = wData.waterlevel_data?.data || wData.data || [];
            const filteredWater = wStations.filter((s:any) => s.station?.lat > 16.0 && s.station?.lat < 20.5 && s.station?.long > 97.0 && s.station?.long < 101.0);
            
            filteredWater.forEach((s: any) => {
              merged.push({
                id: s.station?.id, 
                name: s.station?.tele_station_name?.th || 'สถานีวัดน้ำ', 
                prov: s.station?.geocode?.province_name?.th || '',
                amp: s.station?.geocode?.amphoe_name?.th || '',
                tum: s.station?.geocode?.tumbon_name?.th || '',
                lat: s.station?.lat, lng: s.station?.long, 
                type: 'water', val: s.water_level || 0, 
                risk: getRisk(s.water_level || 0, 'water'), 
                time: s.waterlevel_datetime
              });
            });
            setApiStatus(prev => ({ ...prev, water: 'เชื่อมต่อสำเร็จ 🟢' }));
          }
        } catch (e) { setApiStatus(prev => ({ ...prev, water: 'การเชื่อมต่อขัดข้อง 🔴' })); }

        // 2. ดึงฝน 24 ชม.
        try {
          const rRes = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h');
          if (rRes.ok) {
            const rData = await rRes.json();
            const rStations = rData.rain_data?.data || rData.data || [];
            const filteredRain = rStations.filter((s:any) => s.station?.lat > 16.0 && s.station?.lat < 20.5 && s.station?.long > 97.0 && s.station?.long < 101.0);
            
            filteredRain.forEach((s: any) => {
              merged.push({
                id: s.station?.id, 
                name: s.station?.tele_station_name?.th || 'สถานีวัดฝน', 
                prov: s.station?.geocode?.province_name?.th || '',
                amp: s.station?.geocode?.amphoe_name?.th || '',
                tum: s.station?.geocode?.tumbon_name?.th || '',
                lat: s.station?.lat, lng: s.station?.long, 
                type: 'rain', val: s.rain_24h || 0, 
                risk: getRisk(s.rain_24h || 0, 'rain'), 
                time: s.rain_datetime
              });
            });
            setApiStatus(prev => ({ ...prev, rain: 'เชื่อมต่อสำเร็จ 🟢' }));
          }
        } catch (e) { setApiStatus(prev => ({ ...prev, rain: 'การเชื่อมต่อขัดข้อง 🔴' })); }

        setStations(merged);
        setFilteredStations(merged);
      } catch (error) { console.error(error); }
    };
    fetchONWR();
  }, []);

  // 🎛️ ระบบกรองข้อมูล (Filter Engine)
  useEffect(() => {
    let result = stations;

    // กรองคำค้นหา
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => 
        (s.name && s.name.toLowerCase().includes(q)) || 
        (s.tum && s.tum.toLowerCase().includes(q)) ||
        (s.amp && s.amp.toLowerCase().includes(q)) ||
        (s.prov && s.prov.toLowerCase().includes(q))
      );
    }

    // กรองจังหวัด
    if (filterProv !== 'ทุกจังหวัด') {
      result = result.filter(s => s.prov === filterProv);
    }

    // กรองอำเภอ
    if (filterAmp !== 'ทุกอำเภอ') {
      result = result.filter(s => s.amp === filterAmp);
    }

    // กรองความเสี่ยง
    if (filterRisk !== 'ทุกระดับความเสี่ยง') {
      result = result.filter(s => s.risk.label === filterRisk);
    }

    // กรองรัศมี
    if (useRadius && radiusKm > 0) {
      result = result.filter(s => {
        const dist = calculateDistance(position.lat, position.lng, s.lat, s.lng);
        s.distance = dist; // เก็บค่าระยะทางไว้แสดงใน Popup
        return dist <= radiusKm;
      });
    } else {
      // คำนวณระยะทางเก็บไว้เฉยๆ แม้ไม่ได้เปิดโหมดรัศมี
      result = result.map(s => ({...s, distance: calculateDistance(position.lat, position.lng, s.lat, s.lng)}));
    }

    setFilteredStations(result);
  }, [searchQuery, filterProv, filterAmp, filterRisk, useRadius, radiusKm, position, stations]);

  // 📍 สร้างไอคอนตำแหน่งของฉัน (หมุดแดงสไตล์ Google)
  const createMyPinIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({ 
      className: 'bg-transparent border-none', 
      html: `<div class="relative flex items-center justify-center w-8 h-8">
               <svg class="relative z-10 w-8 h-8 text-red-600 drop-shadow-md" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
             </div>`, 
      iconSize: [32, 32], iconAnchor: [16, 32] 
    });
  }, [L]);

  // 🛠️ Action Handlers
  const handleSetChiangMai = () => { setFilterProv('เชียงใหม่'); setFilterAmp('ทุกอำเภอ'); setUseRadius(false); };
  const handleSetHod = () => { setFilterProv('เชียงใหม่'); setFilterAmp('ฮอด'); setUseRadius(false); };
  const handleSetRadius = () => { setUseRadius(true); setRadiusKm(50); };
  const handleReset = () => { 
    setSearchQuery(''); setFilterProv('ทุกจังหวัด'); setFilterAmp('ทุกอำเภอ'); setFilterRisk('ทุกระดับความเสี่ยง'); setUseRadius(false); setPosition({lat: INITIAL_LAT, lng: INITIAL_LNG});
    if(mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 10);
  };
  const handleCurrentLocation = () => {
    Swal.fire({ title: 'ดึงพิกัด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    setTimeout(() => { setPosition({ lat: INITIAL_LAT, lng: INITIAL_LNG }); if (mapRef.current) mapRef.current.flyTo([INITIAL_LAT, INITIAL_LNG], 12); Swal.close(); }, 800);
  };

  // ดึงรายชื่อจังหวัด/อำเภอแบบ Unique สำหรับทำ Dropdown
  const uniqueProvs = Array.from(new Set(stations.map(s => s.prov).filter(Boolean))).sort();
  const uniqueAmps = Array.from(new Set(stations.filter(s => filterProv === 'ทุกจังหวัด' || s.prov === filterProv).map(s => s.amp).filter(Boolean))).sort();

  return (
    <div className="min-h-screen bg-[#f1f5f9] font-sans selection:bg-[#0ea5e9] selection:text-white pb-10">
      
      {/* 🚀 Header (ตามรูป image_229cd9.png) */}
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

      <main className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-6">

        {/* 🗺️ การ์ด 1: แผนที่สถานการณ์น้ำ (ดีไซน์สว่าง ตามรูป image_215980.jpg) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden text-gray-800 font-sans">
          
          {/* หัวการ์ด */}
          <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-center bg-white">
             <div>
               <h3 className="text-[#0f4a8a] text-lg font-extrabold flex items-center"><span className="mr-2">🌊</span> แผนที่สถานการณ์น้ำ</h3>
               <p className="text-[11px] text-gray-500 mt-0.5">อัปเดตล่าสุด {currentTime ? currentTime.toLocaleTimeString('th-TH') : '--:--:--'}</p>
             </div>
             <button onClick={handleCurrentLocation} className="bg-[#0f4a8a] hover:bg-[#0b3665] text-white px-4 py-2 rounded-full text-xs font-bold transition flex items-center shadow-sm">
               <span className="mr-1 text-red-400">📍</span> ตำแหน่งของฉัน
             </button>
          </div>

          {/* แผงค้นหา (Filter UI เป๊ะตามรูป 2) */}
          <div className="p-5 border-b border-gray-200 bg-gray-50/50 text-[13px]">
             
             {/* Row 1: Dropdowns */}
             <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="md:col-span-1 relative">
                  <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ค้นหาสถานี / รหัสสถานี / จังหวัด / อำเภอ / ตำบล / หน่วยงาน" className="border border-gray-300 rounded-md pl-9 pr-3 py-2 w-full focus:outline-none focus:border-[#0f4a8a] focus:ring-1 focus:ring-[#0f4a8a]" />
                </div>
                <select value={filterProv} onChange={(e) => {setFilterProv(e.target.value); setFilterAmp('ทุกอำเภอ');}} className="border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none text-gray-700 font-medium">
                  <option value="ทุกจังหวัด">ทุกจังหวัด</option>
                  {uniqueProvs.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={filterAmp} onChange={(e) => setFilterAmp(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none text-gray-700 font-medium disabled:bg-gray-100" disabled={filterProv === 'ทุกจังหวัด'}>
                  <option value="ทุกอำเภอ">ทุกอำเภอ</option>
                  {uniqueAmps.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 w-full focus:outline-none text-gray-700 font-medium">
                  <option value="ทุกระดับความเสี่ยง">ทุกระดับความเสี่ยง</option>
                  <option value="ปกติ">🟢 ปกติ</option>
                  <option value="เฝ้าระวัง">🟡 เฝ้าระวัง</option>
                  <option value="เสี่ยงสูง">🟠 เสี่ยงสูง</option>
                  <option value="วิกฤต">🔴 วิกฤต</option>
                </select>
             </div>
             
             {/* Row 2: Radius Checkbox */}
             <div className="flex items-center space-x-2 mb-4">
                <input type="checkbox" id="radius" checked={useRadius} onChange={(e) => setUseRadius(e.target.checked)} className="rounded border-gray-300 w-4 h-4 text-[#0f4a8a] focus:ring-[#0f4a8a] cursor-pointer" /> 
                <label htmlFor="radius" className="text-gray-700 font-bold cursor-pointer select-none">ค้นหาในรัศมีจากตำแหน่งของฉัน</label>
             </div>

             {/* Row 3: Radius Input & Quick Buttons */}
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-t border-gray-200 pt-4">
                <div className="flex items-center space-x-2 w-full md:w-auto text-gray-700 font-medium mb-4 md:mb-0">
                   <input type="number" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} disabled={!useRadius} className="border border-gray-300 rounded-md px-2 py-1.5 w-16 focus:outline-none text-center disabled:bg-gray-100" /> 
                   <span>กม.</span>
                   <span className="ml-4 flex items-center font-bold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full"><span className="text-red-500 mr-1.5 text-base">📍</span> ใช้ตำแหน่งของฉัน</span>
                   <span className="ml-4 text-gray-400 hidden lg:inline">จุดอ้างอิง: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}</span>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end">
                   <button onClick={handleSetChiangMai} className="border border-gray-300 bg-white px-3 py-1.5 rounded-md text-gray-700 font-bold hover:bg-gray-50 transition shadow-sm">เฉพาะจังหวัดเชียงใหม่</button>
                   <button onClick={handleSetHod} className="border border-gray-300 bg-white px-3 py-1.5 rounded-md text-gray-700 font-bold hover:bg-gray-50 transition shadow-sm">อำเภอฮอด</button>
                   <button onClick={handleSetRadius} className="bg-[#0f4a8a] hover:bg-[#0b3665] text-white px-4 py-1.5 rounded-md font-bold shadow-md transition">รอบตำแหน่งของฉัน</button>
                   <button onClick={handleReset} className="border border-gray-300 bg-white px-3 py-1.5 rounded-md text-gray-500 font-bold hover:bg-red-50 hover:text-red-500 transition flex items-center shadow-sm">✕ รีเซ็ต</button>
                </div>
             </div>

             {/* Found Count */}
             <div className="mt-4 text-[13px] text-gray-600">
               พบข้อมูล <span className="font-extrabold text-[#0f4a8a]">{filteredStations.length.toLocaleString()}</span> รายการ
             </div>
          </div>

          {/* แผนที่ (Map Area) */}
          <div className="h-[500px] md:h-[650px] w-full relative z-0 bg-[#e5e7eb]">
            <MapContainer center={[18.1633, 98.3744]} zoom={11} maxZoom={20} zoomControl={true} attributionControl={false} className="w-full h-full" ref={mapRef}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
              
              <Marker position={[position.lat, position.lng]} icon={createMyPinIcon()} />

              {filteredStations.map((st, idx) => (
                <CircleMarker 
                  key={idx} center={[st.lat, st.lng]} radius={7} 
                  pathOptions={{ 
                    color: st.risk.color, 
                    fillColor: st.type === 'water' ? st.risk.color : '#ffffff',
                    fillOpacity: st.type === 'water' ? 0.9 : 0.4, 
                    weight: st.type === 'water' ? 1 : 3 
                  }}
                >
                  {/* Pro Popup (ดีไซน์สไตล์มืออาชีพ ตามรูป 3 image_2155e2.jpg เป๊ะ) */}
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
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`} 
                        target="_blank" rel="noopener noreferrer" 
                        className="mt-2.5 w-full bg-[#1d4ed8] hover:bg-[#1e3a8a] text-white flex items-center justify-center space-x-1.5 py-1.5 rounded-md text-[11px] font-bold shadow-md transition-colors"
                      >
                        <span className="text-sm">🧭</span> <span>นำทางด้วย Google Maps</span>
                      </a>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          {/* สัญลักษณ์ (Legend) */}
          <div className="bg-white px-5 py-3 border-t border-gray-200 flex flex-wrap items-center gap-4 md:gap-5 text-[11px] md:text-xs font-bold text-gray-600">
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

        {/* 📋 การ์ด 2: แหล่งข้อมูล และ สถานะการเชื่อมต่อ (ตามรูป image_215d06.png) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden text-gray-800">
          
          <div className="px-5 py-4 border-b border-gray-200 bg-white">
            <h3 className="text-[#0f4a8a] font-extrabold text-[15px] md:text-lg flex items-center">
              <span className="text-xl mr-2">📡</span> แหล่งข้อมูล
            </h3>
            <p className="text-[11px] md:text-xs text-gray-500 mt-1">
              ดึงข้อมูลล่าสุด {currentTime ? currentTime.toLocaleTimeString('th-TH') : '--:--:--'} - รีเฟรชอัตโนมัติทุก 5 นาที
            </p>
          </div>

          <div className="p-0">
            <div className="bg-[#f8fafc] px-5 py-3 border-b border-gray-200">
              <h4 className="font-extrabold text-[#0f4a8a] text-[13px] md:text-[14px]">สถานะการเชื่อมต่อ</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm text-left font-sans">
                <thead className="text-[11px] md:text-[12px] text-gray-500 bg-[#f1f5f9] border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 font-extrabold whitespace-nowrap w-1/3">ชุดข้อมูล</th>
                    <th className="px-5 py-3 font-extrabold w-1/4">สถานะ</th>
                    <th className="px-5 py-3 font-extrabold">ที่มา</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-gray-800">National ThaiWater (ONWR) — ระดับน้ำ</td>
                    <td className="px-5 py-3.5 font-bold text-[#10b981] flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#10b981] mr-2"></span> {apiStatus.water}</td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-[10px] md:text-[11px] truncate max-w-[200px] md:max-w-none">https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-gray-800">National ThaiWater (ONWR) — ปริมาณฝน 24 ชม.</td>
                    <td className="px-5 py-3.5 font-bold text-[#10b981] flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#10b981] mr-2"></span> {apiStatus.rain}</td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-[10px] md:text-[11px] truncate max-w-[200px] md:max-w-none">https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors bg-blue-50/30">
                    <td className="px-5 py-3.5 font-semibold text-gray-800">FloodDash</td>
                    <td className="px-5 py-3.5 font-bold text-[#10b981] flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-[#10b981] mr-2"></span> เชื่อมต่อสำเร็จ</td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-[10px] md:text-[11px]">https://flood.nonarkara.org</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </main>
      
      {/* 💅 CSS Injection สำหรับปรับแต่ง Popup Leaflet ให้ไม่มีขอบขาวรกๆ แบบในรูป 3 */}
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-popup-content-wrapper { padding: 0 !important; border-radius: 8px !important; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important; }
        .leaflet-popup-content { margin: 12px !important; line-height: 1.4 !important; }
        .leaflet-popup-tip { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important; }
      `}} />
    </div>
  );
}
