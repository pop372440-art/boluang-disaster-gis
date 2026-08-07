'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js';
import Swal from 'sweetalert2'; 
import { useMapEvents } from 'react-leaflet';

// 🌟 ตั้งค่า Supabase 
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvtjjhvvtaswzhwhowlj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'ใส่_KEY_ของคุณที่นี่';
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
  const [isFetchingGPS, setIsFetchingGPS] = useState(false); // สถานะตอนกำลังค้นหา GPS
  
  // 🌟 State สำหรับแผนที่และข้อมูล GeoJSON
  const [mapRef, setMapRef] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);

  // 📝 ข้อมูลฟอร์มที่อัปเกรดแล้ว
  const [formData, setFormData] = useState({
    village_name: '',
    risk_type: 'ไฟป่า / หมอกควัน',
    severity_level: 3,
    description: '',
    reporter_name: '',
    reporter_role: 'ประชาชนทั่วไป'
  });

  // 📸 State สำหรับไฟล์รูปภาพ และ ✅ State สำหรับ PDPA
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [pdpaConsent, setPdpaConsent] = useState(false);

  useEffect(() => {
    setMounted(true);
    const fetchBlockData = async () => {
      try {
        const ts = Date.now();
        const res = await fetch(`/geojson/block.json?v=${ts}`);
        if (res.ok) {
          let data = await res.json();
          if (Array.isArray(data)) data = { type: "FeatureCollection", features: data };
          setGeoBlock(data);
        }
      } catch (e) { console.error("Error loading block.json", e); }
    };
    fetchBlockData();
  }, []);

  const formatVillageName = (rawName: any) => {
    if (!rawName) return 'พื้นที่หมู่บ้าน';
    const safeName = String(rawName); 
    let cName = safeName.replace(/^(บ้าน|บ\.|หมู่ที่\s*\d+|หมู่\s*\d+)/, '').replace(/\s+/g, '');
    if (cName.includes('บ่อหลวง')) cName = 'บ้านบ่อหลวง';
    else if (cName === 'ขุน' || cName.includes('บ้านขุน')) cName = 'บ้านขุน';
    else cName = `บ้าน${cName}`;
    return cName;
  };

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
    const result = Object.keys(vMap).map(name => ({ name, lat: vMap[name].sumLat / vMap[name].count, lng: vMap[name].sumLng / vMap[name].count }));
    if (result.length > 0 && !formData.village_name) {
      setFormData(prev => ({ ...prev, village_name: result[0].name }));
    }
    return result;
  }, [geoBlock]);

  const L = typeof window !== 'undefined' ? require('leaflet') : null;

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

  const LocationMarker = () => {
    useMapEvents({ click(e: any) { setPosition(e.latlng); } });
    return position === null ? null : <Marker position={position} icon={customIcon}></Marker>;
  };

  // 🎯 ฟังก์ชันดึงพิกัด GPS อัตโนมัติ
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      Swal.fire({ icon: 'error', title: 'ไม่รองรับ GPS', text: 'เบราว์เซอร์ของคุณไม่รองรับการดึงตำแหน่งครับ' });
      return;
    }
    
    setIsFetchingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPosition({ lat: latitude, lng: longitude });
        if (mapRef) {
          mapRef.flyTo([latitude, longitude], 16, { duration: 1.5 });
        }
        setIsFetchingGPS(false);
        Swal.fire({ icon: 'success', title: 'ดึงตำแหน่งสำเร็จ', text: 'ระบบปักหมุดตำแหน่งปัจจุบันของคุณแล้ว', timer: 1500, showConfirmButton: false });
      },
      (err) => {
        setIsFetchingGPS(false);
        Swal.fire({ icon: 'warning', title: 'ดึงตำแหน่งไม่ได้', text: 'กรุณาอนุญาตให้ระบบเข้าถึง Location บนมือถือของคุณ หรือคลิกปักหมุดเองบนแผนที่ครับ' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleVillageChange = (e: any) => {
    const selectedName = e.target.value;
    setFormData(prev => ({ ...prev, village_name: selectedName }));
    if (mapRef && villageList.length > 0) {
      const targetVillage = villageList.find(v => v.name === selectedName);
      if (targetVillage) {
        mapRef.flyTo([targetVillage.lat, targetVillage.lng], 15, { duration: 1.5, easeLinearity: 0.25 });
      }
    }
  };

  const handleInputChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // 📸 ฟังก์ชันจัดการเมื่อผู้ใช้เลือกไฟล์
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(e.target.files);
    }
  };

  const setSeverity = (level: number) => {
    setFormData(prev => ({ ...prev, severity_level: level }));
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!position) {
      Swal.fire({ icon: 'warning', title: 'ลืมปักหมุด!', text: 'กรุณากดปุ่มดึงตำแหน่ง หรือคลิกบนแผนที่เพื่อระบุพิกัดก่อนครับ', confirmButtonColor: '#ef4444' });
      return;
    }
    if (!formData.description) {
      Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณาระบุรายละเอียดของสถานการณ์', confirmButtonColor: '#ef4444' });
      return;
    }
    if (!pdpaConsent) {
      Swal.fire({ icon: 'warning', title: 'ยอมรับเงื่อนไข', text: 'กรุณาติ๊กถูกที่ช่องยินยอมให้ข้อมูลส่วนบุคคล (PDPA)', confirmButtonColor: '#10b981' });
      return;
    }

    setIsSubmitting(true);

    try {
      // 🚀 หมายเหตุ: เดี๋ยวสเตปต่อไปเราจะเขียนโค้ดอัปโหลดไฟล์ไปที่ Supabase Storage ตรงนี้ครับ
      // const fileUrl = await uploadFileToStorage(selectedFiles);

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
            // image_url: fileUrl  <-- เตรียมรอไว้
          }
        ]);

      if (error) throw error;

      Swal.fire({
        icon: 'success',
        title: 'แจ้งเหตุสำเร็จ!',
        text: 'ระบบได้รับข้อมูลของคุณเรียบร้อยแล้ว เจ้าหน้าที่จะดำเนินการโดยเร็วที่สุด',
        confirmButtonColor: '#10b981'
      }).then(() => {
        setFormData({ ...formData, description: '', reporter_name: '' });
        setPosition(null);
        setSelectedFiles(null);
        setPdpaConsent(false);
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

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-white font-sans overflow-hidden">
      
      {/* 🗺️ ฝั่งขวา (หรือด้านบนบนมือถือ): แผนที่ Leaflet */}
      <div className="order-1 md:order-2 w-full h-[40vh] md:h-full md:flex-1 relative bg-gray-900 z-0 flex-shrink-0">
        <MapContainer center={[18.1633, 98.3744]} zoom={13} maxZoom={20} className="w-full h-full cursor-crosshair" ref={setMapRef}>
          <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} attribution="Google Maps Satellite" />
          {geoBlock && <GeoJSON data={geoBlock} style={{ color: 'rgba(255,255,255,0.4)', weight: 1.5, fillOpacity: 0, dashArray: '4, 4' }} interactive={false} />}
          <LocationMarker />
        </MapContainer>
        
        {/* ข้อความบอกใบ้บนแผนที่ */}
        {!position && (
          <div className="absolute top-4 md:top-6 left-1/2 transform -translate-x-1/2 z-[400] pointer-events-none w-[90%] md:w-auto flex justify-center">
            <div className="bg-black/70 backdrop-blur-md text-white px-4 md:px-6 py-2 md:py-2.5 rounded-full shadow-2xl border border-gray-600 flex items-center space-x-2 animate-bounce">
              <span className="text-base md:text-lg">👇</span>
              <span className="text-[12px] md:text-sm font-medium tracking-wide">เลื่อนและคลิกเพื่อปักหมุดจุดเกิดเหตุ</span>
            </div>
          </div>
        )}
      </div>

      {/* 🔴 ฝั่งซ้าย (หรือด้านล่างบนมือถือ): ฟอร์มแจ้งเหตุ */}
      <div className="order-2 md:order-1 w-full md:w-[420px] h-[60vh] md:h-full bg-white shadow-[0_-10px_20px_rgba(0,0,0,0.15)] md:shadow-2xl z-10 flex flex-col relative flex-shrink-0">
        
        <div className="bg-red-600 text-white p-4 md:p-5 shadow-md flex-shrink-0">
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
          
          {/* 🎯 อัปเกรด: กล่องดึงตำแหน่ง GPS แบบอัจฉริยะ */}
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 shadow-sm">
            <div className="flex items-start mb-3">
              <span className="text-blue-600 text-lg mr-2">📍</span>
              <div>
                <h3 className="text-[13px] font-bold text-blue-800">ระบุตำแหน่งของคุณ</h3>
                <p className="text-[11px] text-blue-600/80 leading-relaxed mt-1">เพื่อความแม่นยำ กรุณาอนุญาตการเข้าถึง GPS ระบบจะดึงพิกัดให้อัตโนมัติ (หรือคุณสามารถเลื่อนหมุดบนแผนที่เองได้)</p>
              </div>
            </div>
            <button 
              type="button"
              onClick={handleGetLocation}
              disabled={isFetchingGPS}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {isFetchingGPS ? (
                <><span className="animate-spin">⏳</span><span>กำลังค้นหาตำแหน่ง...</span></>
              ) : (
                <><span className="text-lg">🎯</span><span>ใช้ตำแหน่งปัจจุบันของฉัน</span></>
              )}
            </button>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            
            <div className="flex items-center">
              <div className="flex-1 border-t border-gray-200"></div>
              <span className="px-3 text-xs font-bold text-gray-400">ข้อมูลการแจ้งเหตุ</span>
              <div className="flex-1 border-t border-gray-200"></div>
            </div>

            {/* 1. พื้นที่ */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">1. พื้นที่หมู่บ้านที่พบเหตุ</label>
              <select 
                name="village_name" 
                value={formData.village_name} 
                onChange={handleVillageChange} 
                className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-700 focus:ring-red-500 focus:border-red-500 bg-white outline-none transition-all"
              >
                {villageList.length > 0 ? (
                  villageList.map((v: any) => <option key={v.name} value={v.name}>{v.name}</option>)
                ) : (
                  <option value="">กำลังโหลดข้อมูล...</option>
                )}
              </select>
            </div>

            {/* 2. ประเภทภัย */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">2. ประเภทของสาธารณภัย <span className="text-red-500">*</span></label>
              <select name="risk_type" value={formData.risk_type} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-700 focus:ring-red-500 focus:border-red-500 bg-white outline-none transition-all">
                {riskTypes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* 3. ความรุนแรง */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">3. ระดับความรุนแรง <span className="text-red-500">*</span></label>
              <div className="flex justify-between space-x-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                {[1, 2, 3, 4, 5].map(level => (
                  <button type="button" key={level} onClick={() => setSeverity(level)} 
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                      formData.severity_level === level 
                        ? (level >= 4 ? 'bg-red-600 text-white shadow-md' : level === 3 ? 'bg-orange-500 text-white shadow-md' : 'bg-yellow-400 text-white shadow-md') 
                        : 'bg-transparent text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. รายละเอียด */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">4. รายละเอียดและข้อเสนอแนะ <span className="text-red-500">*</span></label>
              <textarea name="description" value={formData.description} onChange={handleInputChange} rows={3} placeholder="เช่น ไฟป่ากำลังลุกลามเข้าใกล้สวนชาวบ้าน..." className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-700 focus:ring-red-500 focus:border-red-500 bg-white resize-none outline-none transition-all"></textarea>
            </div>

            {/* 📸 อัปเกรด: โซนอัปโหลดภาพ/วิดีโอ */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">📎 5. แนบรูปภาพประกอบ (ถ้ามี)</label>
              <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                <input 
                  type="file" 
                  accept="image/*,video/*" 
                  capture="environment" 
                  multiple
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                />
                <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                  {selectedFiles && selectedFiles.length > 0 ? (
                    <>
                      <span className="text-3xl">✅</span>
                      <span className="text-[13px] font-bold text-green-600">เลือกไฟล์แล้ว {selectedFiles.length} รูป</span>
                      <span className="text-[11px] text-gray-500">{selectedFiles[0].name}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl text-gray-400">📷</span>
                      <span className="text-[13px] font-bold text-gray-600 bg-gray-200 px-3 py-1 rounded-md">เลือกไฟล์ / ถ่ายรูป</span>
                      <span className="text-[11px] text-gray-400">รองรับไฟล์รูปภาพ, วิดีโอ (สูงสุด 20MB)</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center mt-6 mb-2">
              <div className="flex-1 border-t border-gray-200"></div>
              <span className="px-3 text-xs font-bold text-gray-400">ข้อมูลผู้แจ้ง</span>
              <div className="flex-1 border-t border-gray-200"></div>
            </div>

            {/* ผู้แจ้ง */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">ชื่อผู้แจ้ง (ไม่บังคับ)</label>
                <input type="text" name="reporter_name" value={formData.reporter_name} onChange={handleInputChange} placeholder="ระบุชื่อ..." className="w-full border border-gray-300 rounded-lg p-2.5 text-[13px] text-gray-700 bg-white outline-none transition-all focus:border-red-500" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">สถานะผู้แจ้ง</label>
                <select name="reporter_role" value={formData.reporter_role} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg p-2.5 text-[13px] text-gray-700 bg-white outline-none transition-all focus:border-red-500">
                  <option value="ประชาชนทั่วไป">ประชาชนทั่วไป</option>
                  <option value="ผู้นำชุมชน/กำนัน/ผู้ใหญ่บ้าน">ผู้นำชุมชน</option>
                  <option value="เจ้าหน้าที่รัฐ/อปท.">เจ้าหน้าที่รัฐ</option>
                </select>
              </div>
            </div>

            {/* ✅ อัปเกรด: กล่องขอความยินยอม PDPA */}
            <div className={`mt-6 p-4 rounded-xl border transition-all ${pdpaConsent ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-300'}`}>
              <label className="flex items-start space-x-3 cursor-pointer">
                <div className="flex items-center h-5 mt-0.5">
                  <input 
                    type="checkbox" 
                    checked={pdpaConsent}
                    onChange={(e) => setPdpaConsent(e.target.checked)}
                    className="w-5 h-5 text-green-600 bg-white border-gray-300 rounded focus:ring-green-500 cursor-pointer" 
                  />
                </div>
                <div className="flex flex-col">
                  <span className={`text-[13px] font-bold ${pdpaConsent ? 'text-green-800' : 'text-gray-700'}`}>ความยินยอมในการให้ข้อมูลส่วนบุคคล (PDPA) <span className="text-red-500">*</span></span>
                  <span className={`text-[11px] mt-1 leading-relaxed ${pdpaConsent ? 'text-green-700/80' : 'text-gray-500'}`}>
                    ข้าพเจ้ายินยอมให้ทางหน่วยงานเก็บรวบรวมและใช้ข้อมูลที่ระบุไว้ เพื่อวัตถุประสงค์ในการตรวจสอบ ระงับเหตุ และประสานงาน ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล
                  </span>
                </div>
              </label>
            </div>

          </form>
        </div>

        {/* 🚀 ส่วนปุ่มส่งข้อมูลด้านล่างสุด */}
        <div className="p-4 md:p-5 border-t border-gray-200 bg-white flex-shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[11px] font-bold text-gray-500">พิกัดเกิดเหตุ (GPS):</span>
            {position ? (
              <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-100 px-2.5 py-1 rounded border border-blue-200">
                {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
              </span>
            ) : (
              <span className="text-[11px] font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded border border-red-100">ยังไม่ระบุพิกัด</span>
            )}
          </div>
          
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !pdpaConsent}
            className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-lg flex justify-center items-center space-x-2 transition-all ${
              isSubmitting ? 'bg-gray-400 text-gray-100 cursor-not-allowed' 
              : !pdpaConsent ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
              : 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 hover:shadow-xl active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? <span>กำลังส่งข้อมูล...</span> : <><span className="text-lg">✅</span> <span>ส่งข้อมูลแจ้งเหตุ</span></>}
          </button>
        </div>
      </div>

    </div>
  );
}
