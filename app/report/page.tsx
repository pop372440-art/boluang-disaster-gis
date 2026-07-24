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

// 📍 กำหนดพิกัด (Lat, Lng) ของทั้ง 13 หมู่บ้าน (ตัดบ้านอมขูดออกแล้ว)
// *หมายเหตุ: คุณสามารถปรับแก้ตัวเลขพิกัดด้านล่างนี้ให้ตรงกับจุดศูนย์กลางหมู่บ้านจริงๆ ได้เลยครับ
const VILLAGE_COORDS: Record<string, [number, number]> = {
  'บ้านบ่อหลวง': [18.1517, 98.2858],
  'บ้านบ่อพะแวน': [18.1602, 98.2750],
  'บ้านบ่อสะแง๋': [18.1405, 98.2910],
  'บ้านแม่หืด': [18.1850, 98.2600],
  'บ้านแม่สะนาม': [18.1250, 98.3050],
  'บ้านกิ่วลม': [18.1380, 98.3450],
  'บ้านวังกอง': [18.1580, 98.3150],
  'บ้านขุน': [18.1150, 98.3200],
  'บ้านนาฟ่อน': [18.1050, 98.3350],
  'บ้านแม่ลายเหนือ': [18.0950, 98.3550],
  'บ้านแม่ลาย': [18.0850, 98.3450],
  'บ้านพุย': [18.0750, 98.3250],
  'บ้านเตียนอาง': [18.0650, 98.3050],
};

// 🗺️ คอมโพเนนต์สำหรับควบคุมให้แผนที่บิน (Fly) ไปยังพิกัดที่เลือก
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      // สั่งให้แผนที่บินไปที่พิกัดใหม่ พร้อมซูมระดับ 15 (เห็นชัดเจน)
      map.flyTo(center, 15, { duration: 1.5, easeLinearity: 0.25 });
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
  const [mapCenter, setMapCenter] = useState<[number, number]>(VILLAGE_COORDS['บ้านบ่อหลวง']); // 🌟 ค่าเริ่มต้นแผนที่
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
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
          setMapCenter([loc.coords.latitude, loc.coords.longitude]); // ดึงพิกัดคนแจ้งมาเป็นจุดศูนย์กลางครั้งแรก
        },
        (err) => console.log("User denied location")
      );
    }
  }, []);

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // 🌟 ถ้ายูสเซอร์เปลี่ยนชื่อหมู่บ้าน ให้สั่งแผนที่เลื่อนพิกัดตาม
    if (name === 'village_name' && VILLAGE_COORDS[value]) {
      setMapCenter(VILLAGE_COORDS[value]);
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
    <div className="relative w-screen h-screen bg-gray-200 font-sans overflow-hidden">
      
      {/* 🗺️ แผนที่เป็นพื้นหลังเต็มจอ */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={mapCenter} zoom={13} zoomControl={false} className="w-full h-full cursor-crosshair">
          <ZoomControl position="topright" />
          <TileLayer url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" maxZoom={20} attribution="&copy; Google Maps" />
          
          {/* 🌟 ตัวควบคุมการเลื่อนแผนที่อัตโนมัติ */}
          <MapController center={mapCenter} />
          <LocationMarker position={position} setPosition={setPosition} />
        </MapContainer>
      </div>

      {/* 📝 กล่องฟอร์มลอยอยู่ตรงกลาง */}
      <div className="absolute inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-[450px] max-h-[90vh] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl flex flex-col pointer-events-auto overflow-hidden border border-gray-200">
          
          <div className="bg-red-600 p-5 text-white shadow-md flex-shrink-0">
            <div className="flex items-center space-x-3">
              <span className="text-2xl bg-white/20 p-2 rounded-xl">🚨</span>
              <div>
                <h1 className="text-lg font-bold tracking-wide">รายงานจุดเสี่ยงภัย</h1>
                <p className="text-xs text-red-100 mt-0.5">ระบบแจ้งเหตุสาธารณภัย ต.บ่อหลวง</p>
              </div>
            </div>
          </div>

          <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
            <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] p-3 rounded-lg flex items-start space-x-2 mb-5">
              <span className="text-base">📍</span>
              <p>กรุณากรอกข้อมูล และ <b>"คลิกบนแผนที่ด้านหลัง"</b> เพื่อปักหมุดพิกัด</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-gray-700 mb-1 flex items-center"><span className="text-red-500 mr-1.5">📌</span> 1. พื้นที่หมู่บ้านที่พบเหตุ</label>
                <select name="village_name" value={formData.village_name} onChange={handleChange} className="w-full border border-gray-300 rounded-lg p-2 text-[13px] bg-gray-50 focus:ring-2 focus:ring-red-500 outline-none">
                  {/* 🌟 ดึงชื่อ 13 หมู่บ้านอัตโนมัติจาก Object ด้านบน */}
                  {Object.keys(VILLAGE_COORDS).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-[12px] font-bold text-gray-700 mb-1 flex items-center"><span className="text-orange-500 mr-1.5">🔥</span> 2. ประเภทของสาธารณภัย <span className="text-red-500 ml-1">*</span></label>
                <select name="risk_type" value={formData.risk_type} onChange={handleChange} className="w-full border border-gray-300 rounded-lg p-2 text-[13px] bg-gray-50 focus:ring-2 focus:ring-red-500 outline-none">
                  <option value="ไฟป่า / หมอกควัน">ไฟป่า / หมอกควัน</option>
                  <option value="ดินโคลนถล่ม / ดินสไลด์">ดินโคลนถล่ม / ดินสไลด์</option>
                  <option value="น้ำป่าไหลหลาก / น้ำท่วม">น้ำป่าไหลหลาก / น้ำท่วม</option>
                  <option value="ต้นไม้ล้มขวางทาง / ภัยแล้ง">ต้นไม้ล้มขวางทาง / ภัยแล้ง</option>
                  <option value="อื่นๆ">อื่นๆ</option>
                </select>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                <label className="block text-[12px] font-bold text-gray-700 mb-2 flex items-center"><span className="text-yellow-500 mr-1.5">⚠️</span> 3. ระดับความรุนแรง <span className="text-red-500 ml-1">*</span></label>
                <div className="flex justify-between space-x-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level} type="button" onClick={() => setFormData(p => ({ ...p, severity_level: level }))}
                      className={`flex-1 py-1.5 rounded-lg font-bold text-[14px] border-2 transition-all ${
                        formData.severity_level === level ? (level > 3 ? 'bg-red-600 border-red-600 text-white shadow-md' : 'bg-orange-500 border-orange-500 text-white shadow-md') : 'bg-white border-gray-200 text-gray-500 hover:border-orange-300'
                      }`}
                    >{level}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-bold text-gray-700 mb-1 flex items-center"><span className="text-blue-500 mr-1.5">📝</span> 4. รายละเอียดและข้อเสนอแนะ <span className="text-red-500 ml-1">*</span></label>
                <textarea name="description" required rows={2} value={formData.description} onChange={handleChange} placeholder="ระบุรายละเอียดเพิ่มเติม..." className="w-full border border-gray-300 rounded-lg p-2 text-[13px] bg-gray-50 focus:ring-2 focus:ring-red-500 outline-none resize-none"></textarea>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">ชื่อผู้แจ้ง (ไม่บังคับ)</label>
                  <input type="text" name="reporter_name" value={formData.reporter_name} onChange={handleChange} placeholder="ระบุชื่อ..." className="w-full border border-gray-300 rounded-lg p-2 text-[12px] bg-gray-50 outline-none focus:border-red-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">สถานะผู้แจ้ง</label>
                  <select name="reporter_role" value={formData.reporter_role} onChange={handleChange} className="w-full border border-gray-300 rounded-lg p-2 text-[12px] bg-gray-50 outline-none focus:border-red-500">
                    <option value="ประชาชนทั่วไป">ประชาชนทั่วไป</option>
                    <option value="ผู้นำชุมชน">ผู้นำชุมชน / ผู้ใหญ่บ้าน</option>
                    <option value="ชรบ. / อปพร.">ชรบ. / อปพร.</option>
                    <option value="เจ้าหน้าที่ อบต.">เจ้าหน้าที่ อบต.</option>
                  </select>
                </div>
              </div>
              <div className="pt-3 mt-3 border-t border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[11px] font-semibold text-gray-500">จำนวนพิกัดที่ปักบนแผนที่</span>
                  <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${position ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600 animate-pulse'}`}>{position ? '1 จุด' : 'ยังไม่ปักหมุด'}</span>
                </div>
                <button type="submit" disabled={isSubmitting} className={`w-full py-3 rounded-xl font-bold text-[14px] text-white shadow-lg transition-all flex justify-center items-center space-x-2 ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}>
                  {isSubmitting ? <span>กำลังส่งข้อมูล...</span> : <><span>แจ้งจุดเสี่ยงภัย / ส่งพิกัด</span></>}
                </button>
                {submitStatus === 'success' && <div className="mt-3 p-2 bg-green-50 border border-green-200 text-green-700 text-center text-[12px] font-bold rounded-lg animate-fade-in">✅ ส่งข้อมูลแจ้งจุดเสี่ยงภัยสำเร็จ</div>}
              </div>
            </form>
          </div>
        </div>
      </div>

      {!position && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[400] pointer-events-none">
          <div className="bg-gray-900/80 backdrop-blur-md text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center space-x-2 animate-bounce border border-gray-700">
            <span className="text-xl">👆</span>
            <span className="text-[13px] font-bold tracking-wide">เลื่อนแผนที่ด้านหลังแล้วแตะเพื่อปักหมุด</span>
          </div>
        </div>
      )}
    </div>
  );
}
