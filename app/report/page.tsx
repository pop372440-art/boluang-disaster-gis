'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js';

// 🌟 ดึง Hook useMapEvents และ useMap เข้ามา
import { useMapEvents, useMap } from 'react-leaflet';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(mod => mod.Tooltip), { ssr: false });
const ZoomControl = dynamic(() => import('react-leaflet').then(mod => mod.ZoomControl), { ssr: false });

// 📍 กำหนดพิกัด (Lat, Lng) อ้างอิงจาก ศูนย์กลางชุมชน, โรงเรียน, วัด, รพ.สต.
const VILLAGE_COORDS: Record<string, [number, number]> = {
  'บ้านบ่อหลวง': [18.1506, 98.2862],    
  'บ้านบ่อพะแวน': [18.1568, 98.2915],   
  'บ้านบ่อสะแง๋': [18.1408, 98.2915],   
  'บ้านแม่หืด': [18.218961, 98.371501],     
  'บ้านแม่สะนาม': [18.1342, 98.3072],   
  'บ้านกิ่วลม': [18.1378, 98.3445],     
  'บ้านวังกอง': [18.1610, 98.3090],     
  'บ้านขุน': [18.1147, 98.3175],        
  'บ้านนาฟ่อน': [18.1065, 98.3362],     
  'บ้านแม่ลายเหนือ': [18.0935, 98.3540], 
  'บ้านแม่ลาย': [18.0862, 98.3458],     
  'บ้านพุย': [18.0772, 98.3265],        
  'บ้านเตียนอาง': [18.0675, 98.3040],   
};

// 🗺️ คอมโพเนนต์สำหรับควบคุมให้แผนที่บิน (Fly) ไปยังพิกัด
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      // ซูมระดับ 16 ให้เห็นหลังคาบ้านและถนนในชุมชนชัดเจน
      map.flyTo(center, 16, { duration: 1.5, easeLinearity: 0.25 });
    }
  }, [center, map]);
  return null;
}

// 📍 คอมโพเนนต์สำหรับคลิกปักหมุดจุดเกิดเหตุ
function LocationMarker({ position, setPosition }: any) {
  useMapEvents({
    click(e) { setPosition(e.latlng); },
  });
  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const alertIcon = L ? L.divIcon({
    className: 'bg-transparent border-none',
    html: `<div class="flex items-center justify-center w-10 h-10 bg-red-600 border-2 border-white rounded-full shadow-lg animate-bounce"><span class="text-xl">🚨</span></div>`,
    iconSize: [40, 40], iconAnchor: [20, 40]
  }) : null;
  return position && alertIcon ? (
    <Marker position={position} icon={alertIcon}>
      <Tooltip direction="top" offset={[0, -40]} permanent className="font-bold text-red-600">จุดเกิดเหตุ</Tooltip>
    </Marker>
  ) : null;
}

export default function DisasterReportForm() {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(VILLAGE_COORDS['บ้านบ่อหลวง']); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  // 🌟 State ควบคุมการเปิด/ปิดแท็บฟอร์ม
  const [isFormOpen, setIsFormOpen] = useState(true);
  
  const [formData, setFormData] = useState({
    village_name: 'บ้านบ่อหลวง', risk_type: 'ไฟป่า / หมอกควัน',
    severity_level: 3, description: '', reporter_name: '', reporter_role: 'ประชาชนทั่วไป'
  });

  useEffect(() => {
    setMounted(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (loc) => {
          setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          setMapCenter([loc.coords.latitude, loc.coords.longitude]); 
        },
        (err) => console.log("User denied location")
      );
    }
  }, []);

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // เมื่อเปลี่ยนหมู่บ้าน ให้ขยับแผนที่และพับแถบฟอร์มชั่วคราว (ถ้ายูสเซอร์ใช้จอมือถือ)
    if (name === 'village_name' && VILLAGE_COORDS[value]) {
      setMapCenter(VILLAGE_COORDS[value]);
      if (window.innerWidth < 768) setIsFormOpen(false);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!position) return alert("กรุณาคลิกบนแผนที่เพื่อปักหมุดจุดเกิดเหตุก่อนครับ");
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('boluang_disaster_reports').insert([{
        village_name: formData.village_name, risk_type: formData.risk_type, severity_level: formData.severity_level,
        description: formData.description, reporter_name: formData.reporter_name || 'ไม่ประสงค์ออกนาม',
        reporter_role: formData.reporter_role, latitude: position.lat, longitude: position.lng, status: 'รอดำเนินการ'
      }]);
      if (error) throw error;
      setSubmitStatus('success');
      setTimeout(() => { setSubmitStatus('idle'); setFormData({ ...formData, description: '', reporter_name: '' }); setPosition(null); }, 3000);
    } catch (error) { console.error('Error saving data:', error); setSubmitStatus('error'); } 
    finally { setIsSubmitting(false); }
  };

  if (!mounted) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">กำลังโหลด...</div>;

  return (
    <div className="relative w-screen h-screen bg-[#0b1120] font-sans overflow-hidden">
      
      {/* 🗺️ แผนที่เป็นพื้นหลังเต็มจอ */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={mapCenter} zoom={13} zoomControl={false} className="w-full h-full cursor-crosshair">
          <ZoomControl position="topright" />
          {/* 🌟 เปลี่ยนแผนที่เป็นดาวเทียม + เส้นถนน (lyrs=y) แบบชัดแจ๋ว */}
          <TileLayer 
            url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" 
            maxZoom={20} 
            attribution="&copy; Google Maps Satellite" 
          />
          <MapController center={mapCenter} />
          <LocationMarker position={position} setPosition={setPosition} />
        </MapContainer>
      </div>

      {/* 🌟 กล่องฟอร์มแบบ Sidebar ชิดซ้าย (เลื่อนเข้า-ออกได้) */}
      <aside 
        className={`absolute top-0 left-0 h-full z-40 transition-transform duration-500 ease-in-out flex pointer-events-none ${
          isFormOpen ? 'translate-x-0' : '-translate-x-full'
        } w-[95vw] sm:w-[420px]`}
      >
        {/* ตัวกล่องเนื้อหาฟอร์ม */}
        <div className="w-full h-full bg-white/95 backdrop-blur-xl shadow-[4px_0_25px_rgba(0,0,0,0.5)] flex flex-col pointer-events-auto border-r border-gray-200 z-20">
          
          {/* Header */}
          <div className="bg-red-600 p-5 text-white shadow-md flex-shrink-0">
            <div className="flex items-center space-x-3">
              <span className="text-2xl bg-white/20 p-2 rounded-xl">🚨</span>
              <div>
                <h1 className="text-lg font-bold tracking-wide">รายงานจุดเสี่ยงภัย</h1>
                <p className="text-xs text-red-100 mt-0.5">ระบบแจ้งเหตุสาธารณภัย ต.บ่อหลวง</p>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-5 overflow-y-auto custom-scrollbar flex-1 pb-20">
            <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] p-3 rounded-lg flex items-start space-x-2 mb-5">
              <span className="text-base">📍</span>
              <p>กรุณากรอกข้อมูล และ <b>"คลิกบนแผนที่ดาวเทียม"</b> เพื่อปักหมุดพิกัดจุดเกิดเหตุ</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-gray-700 mb-1 flex items-center"><span className="text-red-500 mr-1.5">📌</span> 1. พื้นที่หมู่บ้านที่พบเหตุ</label>
                <select name="village_name" value={formData.village_name} onChange={handleChange} className="w-full border border-gray-300 rounded-lg p-2.5 text-[13px] bg-gray-50 focus:ring-2 focus:ring-red-500 outline-none">
                  {Object.keys(VILLAGE_COORDS).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-[12px] font-bold text-gray-700 mb-1 flex items-center"><span className="text-orange-500 mr-1.5">🔥</span> 2. ประเภทของสาธารณภัย <span className="text-red-500 ml-1">*</span></label>
                <select name="risk_type" value={formData.risk_type} onChange={handleChange} className="w-full border border-gray-300 rounded-lg p-2.5 text-[13px] bg-gray-50 focus:ring-2 focus:ring-red-500 outline-none">
                  <option value="ไฟป่า / หมอกควัน">ไฟป่า / หมอกควัน</option>
                  <option value="ดินโคลนถล่ม / ดินสไลด์">ดินโคลนถล่ม / ดินสไลด์</option>
                  <option value="น้ำป่าไหลหลาก / น้ำท่วม">น้ำป่าไหลหลาก / น้ำท่วม</option>
                  <option value="ต้นไม้ล้มขวางทาง / ภัยแล้ง">ต้นไม้ล้มขวางทาง / ภัยแล้ง</option>
                  <option value="อื่นๆ">อื่นๆ</option>
                </select>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <label className="block text-[12px] font-bold text-gray-700 mb-2 flex items-center"><span className="text-yellow-500 mr-1.5">⚠️</span> 3. ระดับความรุนแรง <span className="text-red-500 ml-1">*</span></label>
                <div className="flex justify-between space-x-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level} type="button" onClick={() => setFormData(p => ({ ...p, severity_level: level }))}
                      className={`flex-1 py-2 rounded-lg font-bold text-[14px] border-2 transition-all ${
                        formData.severity_level === level ? (level > 3 ? 'bg-red-600 border-red-600 text-white shadow-md' : 'bg-orange-500 border-orange-500 text-white shadow-md') : 'bg-white border-gray-200 text-gray-500 hover:border-orange-300'
                      }`}
                    >{level}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-bold text-gray-700 mb-1 flex items-center"><span className="text-blue-500 mr-1.5">📝</span> 4. รายละเอียดและข้อเสนอแนะ <span className="text-red-500 ml-1">*</span></label>
                <textarea name="description" required rows={3} value={formData.description} onChange={handleChange} placeholder="ระบุรายละเอียดเพิ่มเติม..." className="w-full border border-gray-300 rounded-lg p-2.5 text-[13px] bg-gray-50 focus:ring-2 focus:ring-red-500 outline-none resize-none"></textarea>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">ชื่อผู้แจ้ง (ไม่บังคับ)</label>
                  <input type="text" name="reporter_name" value={formData.reporter_name} onChange={handleChange} placeholder="ระบุชื่อ..." className="w-full border border-gray-300 rounded-lg p-2.5 text-[12px] bg-gray-50 outline-none focus:border-red-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">สถานะผู้แจ้ง</label>
                  <select name="reporter_role" value={formData.reporter_role} onChange={handleChange} className="w-full border border-gray-300 rounded-lg p-2.5 text-[12px] bg-gray-50 outline-none focus:border-red-500">
                    <option value="ประชาชนทั่วไป">ประชาชนทั่วไป</option>
                    <option value="ผู้นำชุมชน">ผู้นำชุมชน / ผู้ใหญ่บ้าน</option>
                    <option value="ชรบ. / อปพร.">ชรบ. / อปพร.</option>
                    <option value="เจ้าหน้าที่ อบต.">เจ้าหน้าที่ อบต.</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 mt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[12px] font-semibold text-gray-500">พิกัดบนแผนที่</span>
                  <span className={`text-[12px] font-bold px-3 py-1 rounded-full ${position ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600 animate-pulse'}`}>{position ? 'พร้อมส่งข้อมูล' : 'รอการปักหมุด'}</span>
                </div>
                <button type="submit" disabled={isSubmitting} className={`w-full py-3.5 rounded-xl font-bold text-[14px] text-white shadow-lg transition-all flex justify-center items-center space-x-2 ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 hover:-translate-y-1'}`}>
                  {isSubmitting ? <span>กำลังส่งข้อมูล...</span> : <><span>แจ้งจุดเสี่ยงภัย / ส่งพิกัด</span></>}
                </button>
                {submitStatus === 'success' && <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-700 text-center text-[13px] font-bold rounded-lg animate-fade-in">✅ ส่งข้อมูลแจ้งจุดเสี่ยงภัยสำเร็จ</div>}
              </div>
            </form>
          </div>
        </div>

        {/* 🌟 ปุ่มแท็บสำหรับกดยุบ/ขยาย */}
        <button
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="absolute top-1/2 -right-[32px] transform -translate-y-1/2 w-[32px] h-[72px] bg-white border-y border-r border-gray-300 rounded-r-xl shadow-[4px_0_15px_rgba(0,0,0,0.15)] flex items-center justify-center text-gray-600 hover:text-red-600 hover:bg-gray-50 transition-colors pointer-events-auto z-10 cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isFormOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            )}
          </svg>
        </button>
      </aside>

      {/* คำแนะนำที่ลอยอยู่ด้านล่าง (จะหายไปเมื่อปักหมุดแล้ว) */}
      {!position && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[400] pointer-events-none">
          <div className="bg-gray-900/80 backdrop-blur-md text-white px-5 py-3 rounded-full shadow-2xl flex items-center space-x-2 animate-bounce border border-gray-700">
            <span className="text-xl">👆</span>
            <span className="text-[13px] font-bold tracking-wide">เลื่อนแผนที่ดาวเทียมแล้วแตะเพื่อปักหมุด</span>
          </div>
        </div>
      )}
    </div>
  );
}
