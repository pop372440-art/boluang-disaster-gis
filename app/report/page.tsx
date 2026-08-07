'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js';
import Swal from 'sweetalert2'; 
import { useMapEvents } from 'react-leaflet';

// 🌟 ตั้งค่า Supabase 
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvtjjhvvtaswzhwhowlj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dGpqaHZ2dGFzd3pod2hvd2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDA3NjcsImV4cCI6MjA5MjExNjc2N30.Jjqi1LWgxEgpT2nBdjuNyoLxEP_VQcKf3GEbIYKPI8Y';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 🗺️ โหลด Leaflet Components แบบ Dynamic
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false });

export default function ReportPage() {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 🌟 State สำหรับแผนที่และข้อมูล GeoJSON
  const [mapRef, setMapRef] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);

  // 📝 ข้อมูลฟอร์ม
  const [formData, setFormData] = useState({
    village_name: '',
    risk_type: 'ไฟป่า / หมอกควัน',
    severity_level: 3,
    description: '',
    reporter_name: '',
    reporter_role: 'ประชาชนทั่วไป'
  });

  useEffect(() => {
    setMounted(true);
    
    // 🌟 โหลดข้อมูล block.json เพื่อสกัดชื่อและพิกัดหมู่บ้าน
    const fetchBlockData = async () => {
      try {
        const ts = Date.now();
        const res = await fetch(`/geojson/block.json?v=${ts}`);
        if (res.ok) {
          let data = await res.json();
          if (Array.isArray(data)) data = { type: "FeatureCollection", features: data };
          setGeoBlock(data);
        }
      } catch (e) {
        console.error("Error loading block.json", e);
      }
    };
    fetchBlockData();
  }, []);

  // 🌟 ฟังก์ชันจัดการชื่อหมู่บ้านให้สวยงาม
  const formatVillageName = (rawName: any) => {
    if (!rawName) return 'พื้นที่หมู่บ้าน';
    const safeName = String(rawName); 
    let cName = safeName.replace(/^(บ้าน|บ\.|หมู่ที่\s*\d+|หมู่\s*\d+)/, '').replace(/\s+/g, '');
    if (cName.includes('บ่อหลวง')) cName = 'บ้านบ่อหลวง';
    else if (cName === 'ขุน' || cName.includes('บ้านขุน')) cName = 'บ้านขุน';
    else cName = `บ้าน${cName}`;
    return cName;
  };

  // 🌟 คำนวณรายชื่อหมู่บ้านและจุดกึ่งกลาง (Center) จากไฟล์ GeoJSON
  const villageList = useMemo(() => {
    const vMap: Record<string, { sumLat: number, sumLng: number, count: number }> = {};
    if (geoBlock && geoBlock.features) {
      geoBlock.features.forEach((f: any) => {
        const props = f.properties || {};
        let rawName = props.own_villag || props.name_th || props.vil_name || props.name || props.zone_name || `หมู่ที่ ${props.zone_id || props.id || 'ไม่ระบุ'}`;
        let cName = formatVillageName(rawName);
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        const extractCoords = (coords: any[]) => {
          if (!coords) return;
          if (typeof coords[0] === 'number') {
            if (coords[1] < minLat) minLat = coords[1];
            if (coords[1] > maxLat) maxLat = coords[1];
            if (coords[0] < minLng) minLng = coords[0];
            if (coords[0] > maxLng) maxLng = coords[0];
          } else if (Array.isArray(coords)) { coords.forEach(extractCoords); }
        };
        extractCoords(f.geometry?.coordinates);
        if (minLat !== Infinity) {
          if (!vMap[cName]) vMap[cName] = { sumLat: 0, sumLng: 0, count: 0 };
          vMap[cName].sumLat += (minLat + maxLat) / 2;
          vMap[cName].sumLng += (minLng + maxLng) / 2;
          vMap[cName].count += 1;
        }
      });
    }
    
    const result = Object.keys(vMap).map(name => ({ 
      name, 
      lat: vMap[name].sumLat / vMap[name].count, 
      lng: vMap[name].sumLng / vMap[name].count 
    }));

    // ตั้งค่าเริ่มต้นให้ Dropdown ถ้ารายการถูกดึงมาสำเร็จ
    if (result.length > 0 && !formData.village_name) {
      setFormData(prev => ({ ...prev, village_name: result[0].name }));
    }
    
    return result;
  }, [geoBlock]);

  const L = typeof window !== 'undefined' ? require('leaflet') : null;

  // 📍 ไอคอนหมุดแจ้งเหตุสีแดง
  const customIcon = L ? L.divIcon({
    className: 'bg-transparent border-none',
    html: `
      <div class="relative flex flex-col items-center">
        <div class="w-8 h-8 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center z-10 animate-bounce">
          <span class="text-white text-sm">🚨</span>
        </div>
        <div class="w-3 h-3 bg-black/40 rounded-full blur-[2px] -mt-1 z-0"></div>
      </div>
    `,
    iconSize: [32, 40],
    iconAnchor: [16, 36],
  }) : null;

  // 📍 Component สำหรับดักจับการคลิกบนแผนที่
  const LocationMarker = () => {
    useMapEvents({
      click(e: any) {
        setPosition(e.latlng);
      },
    });
    return position === null ? null : <Marker position={position} icon={customIcon}></Marker>;
  };

  // 🌟 เมื่อเลือกหมู่บ้าน ให้แผนที่บิน (FlyTo) ไปที่พิกัดนั้น
  const handleVillageChange = (e: any) => {
    const selectedName = e.target.value;
    setFormData(prev => ({ ...prev, village_name: selectedName }));

    if (mapRef && villageList.length > 0) {
      const targetVillage = villageList.find(v => v.name === selectedName);
      if (targetVillage) {
        mapRef.flyTo([targetVillage.lat, targetVillage.lng], 15, {
          duration: 1.5,
          easeLinearity: 0.25
        });
      }
    }
  };

  const handleInputChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const setSeverity = (level: number) => {
    setFormData(prev => ({ ...prev, severity_level: level }));
  };

  // 🚀 ฟังก์ชันกดปุ่มส่งข้อมูลเข้า Supabase
  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!position) {
      Swal.fire({ icon: 'warning', title: 'ลืมปักหมุด!', text: 'กรุณาคลิกบนแผนที่เพื่อระบุพิกัดจุดเกิดเหตุก่อนครับ', confirmButtonColor: '#ef4444' });
      return;
    }
    if (!formData.description) {
      Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณาระบุรายละเอียดของสถานการณ์', confirmButtonColor: '#ef4444' });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase
        .from('boluang_disaster_reports')
        .insert([
          {
            village_name: formData.village_name,
            risk_type: formData.risk_type,
            severity_level: formData.severity_level,
            description: formData.description,
            reporter_name: formData.reporter_name || 'ไม่ระบุชื่อ',
            reporter_role: formData.reporter_role,
            latitude: position.lat,
            longitude: position.lng,
          }
        ]);

      if (error) throw error;

      Swal.fire({
        icon: 'success',
        title: 'แจ้งเหตุสำเร็จ!',
        text: 'ข้อมูลของคุณถูกส่งไปยังศูนย์รับเรื่องแล้วครับ',
        confirmButtonColor: '#10b981'
      }).then(() => {
        setFormData({ ...formData, description: '', reporter_name: '' });
        setPosition(null);
      });

    } catch (error: any) {
      console.error('Error:', error.message);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง', confirmButtonColor: '#ef4444' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return <div className="h-screen w-screen bg-gray-100 flex items-center justify-center">Loading...</div>;

  const riskTypes = ['ไฟป่า / หมอกควัน', 'ดินโคลนถล่ม / ดินสไลด์', 'น้ำป่าไหลหลาก / น้ำท่วม', 'ต้นไม้ล้มขวางทาง', 'แผ่นดินไหว', 'อื่นๆ'];

  // 🌟 จุดที่มีการปรับแก้เลย์เอาต์ (Responsive) อย่างสมบูรณ์ 🌟
  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-white font-sans overflow-hidden">
      
      {/* 🗺️ ฝั่งขวา (หรืออยู่ด้านบน 45% บนมือถือ): แผนที่ Leaflet */}
      <div className="order-1 md:order-2 w-full h-[45vh] md:h-full md:flex-1 relative bg-gray-900 z-0 flex-shrink-0">
        <MapContainer 
          center={[18.1633, 98.3744]} 
          zoom={13} 
          maxZoom={20} 
          className="w-full h-full cursor-crosshair"
          ref={setMapRef}
        >
          {/* ใช้ Google Satellite เป็น Base Map */}
          <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} attribution="Google Maps Satellite" />
          
          {/* แสดงขอบเขตหมู่บ้าน (เส้นประสีขาวบางๆ) */}
          {geoBlock && (
             <GeoJSON 
               data={geoBlock} 
               style={{ color: 'rgba(255,255,255,0.4)', weight: 1.5, fillOpacity: 0, dashArray: '4, 4' }} 
               interactive={false}
             />
          )}

          <LocationMarker />
        </MapContainer>
        
        {/* แถบสอนใช้งานลอยอยู่บนแผนที่ (โชว์ชัดๆ ให้ปักหมุด) */}
        {!position && (
          <div className="absolute top-4 md:top-6 left-1/2 transform -translate-x-1/2 z-[400] pointer-events-none w-[90%] md:w-auto flex justify-center">
            <div className="bg-black/70 backdrop-blur-md text-white px-4 md:px-6 py-2 md:py-2.5 rounded-full shadow-2xl border border-gray-600 flex items-center space-x-2 animate-bounce">
              <span className="text-base md:text-lg">👇</span>
              <span className="text-[12px] md:text-sm font-medium tracking-wide">เลื่อนและคลิกบนแผนที่เพื่อปักหมุดจุดเกิดเหตุ</span>
            </div>
          </div>
        )}
      </div>

      {/* 🔴 ฝั่งซ้าย (หรืออยู่ด้านล่าง 55% บนมือถือ): ฟอร์มแจ้งเหตุ */}
      <div className="order-2 md:order-1 w-full md:w-[400px] h-[55vh] md:h-full bg-white shadow-[0_-10px_20px_rgba(0,0,0,0.15)] md:shadow-2xl z-10 flex flex-col relative flex-shrink-0">
        
        <div className="bg-red-600 text-white p-4 md:p-5 shadow-md flex-shrink-0">
          {/* 📱 แถบดึงสีขาวเล็กๆ ด้านบน (หลอกตาให้ดูเหมือนดึงขึ้นลงได้เฉพาะบนมือถือ) */}
          <div className="w-full flex justify-center pb-3 md:hidden">
            <div className="w-12 h-1.5 bg-white/40 rounded-full"></div>
          </div>
          
          <div className="flex items-center space-x-3">
            <span className="text-2xl animate-pulse">🚨</span>
            <div>
              <h1 className="text-lg font-bold">รายงานจุดเสี่ยงภัย</h1>
              <p className="text-xs text-red-200">ระบบแจ้งเหตุสาธารณภัย ต.บ่อหลวง</p>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-5 overflow-y-auto flex-1 custom-scrollbar">
          <div className="bg-red-50 border border-red-100 p-3 rounded-lg mb-5 md:mb-6">
            <p className="text-[12px] text-red-600 flex items-start leading-relaxed">
              <span className="mr-2">📍</span> 
              กรุณากรอกข้อมูล และ "คลิกบนแผนที่ดาวเทียม" เพื่อปักหมุดพิกัดจุดเกิดเหตุ
            </p>
          </div>

          <form className="space-y-4 md:space-y-5" onSubmit={handleSubmit}>
            {/* 1. พื้นที่ */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">📌 1. พื้นที่หมู่บ้านที่พบเหตุ</label>
              <select 
                name="village_name" 
                value={formData.village_name} 
                onChange={handleVillageChange} 
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-700 focus:ring-red-500 focus:border-red-500 bg-white outline-none"
              >
                {villageList.length > 0 ? (
                  villageList.map((v: any) => <option key={v.name} value={v.name}>{v.name}</option>)
                ) : (
                  <option value="">กำลังโหลดข้อมูลหมู่บ้าน...</option>
                )}
              </select>
            </div>

            {/* 2. ประเภทภัย */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">🔥 2. ประเภทของสาธารณภัย <span className="text-red-500">*</span></label>
              <select name="risk_type" value={formData.risk_type} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-700 focus:ring-red-500 focus:border-red-500 bg-white outline-none">
                {riskTypes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* 3. ความรุนแรง */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">⚠️ 3. ระดับความรุนแรง <span className="text-red-500">*</span></label>
              <div className="flex justify-between space-x-2">
                {[1, 2, 3, 4, 5].map(level => (
                  <button type="button" key={level} onClick={() => setSeverity(level)} 
                    className={`flex-1 py-2 rounded-lg border font-bold text-sm transition-all ${
                      formData.severity_level === level 
                        ? (level >= 4 ? 'bg-red-600 text-white border-red-600' : level === 3 ? 'bg-orange-500 text-white border-orange-500' : 'bg-yellow-400 text-white border-yellow-400') 
                        : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. รายละเอียด */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">📝 4. รายละเอียดและข้อเสนอแนะ <span className="text-red-500">*</span></label>
              <textarea name="description" value={formData.description} onChange={handleInputChange} rows={3} placeholder="เช่น ไฟป่ากำลังลุกลามเข้าใกล้สวนชาวบ้าน..." className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-700 focus:ring-red-500 focus:border-red-500 bg-white resize-none outline-none"></textarea>
            </div>

            {/* 5. ผู้แจ้ง */}
            <div className="grid grid-cols-2 gap-4 pb-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">ชื่อผู้แจ้ง (ไม่บังคับ)</label>
                <input type="text" name="reporter_name" value={formData.reporter_name} onChange={handleInputChange} placeholder="ระบุชื่อ..." className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-700 bg-white outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">สถานะผู้แจ้ง</label>
                <select name="reporter_role" value={formData.reporter_role} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-700 bg-white outline-none">
                  <option value="ประชาชนทั่วไป">ประชาชนทั่วไป</option>
                  <option value="ผู้นำชุมชน/กำนัน/ผู้ใหญ่บ้าน">ผู้นำชุมชน</option>
                  <option value="เจ้าหน้าที่รัฐ/อปท.">เจ้าหน้าที่รัฐ</option>
                </select>
              </div>
            </div>
          </form>
        </div>

        {/* 🚀 ส่วนปุ่มส่งข้อมูลด้านล่างสุด */}
        <div className="p-4 md:p-5 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex justify-between items-center mb-3 md:mb-4">
            <span className="text-xs font-bold text-gray-500">พิกัดบนแผนที่:</span>
            {position ? (
              <span className="text-xs font-mono font-bold text-green-600 bg-green-100 px-2 py-1 rounded border border-green-200">
                {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
              </span>
            ) : (
              <span className="text-xs font-bold text-red-500 animate-pulse">ยังไม่ระบุพิกัด</span>
            )}
          </div>
          
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-lg flex justify-center items-center space-x-2 transition-all ${
              isSubmitting ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 hover:shadow-xl active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? <span>กำลังส่งข้อมูล...</span> : <span>แจ้งจุดเสี่ยงภัย / ส่งพิกัด</span>}
          </button>
        </div>
      </div>

    </div>
  );
}
