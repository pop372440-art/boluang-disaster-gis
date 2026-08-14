'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js';
import Swal from 'sweetalert2'; 
import { useMapEvents } from 'react-leaflet';

// 🌟 ตั้งค่า Supabase 
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '[https://uvtjjhvvtaswzhwhowlj.supabase.co](https://uvtjjhvvtaswzhwhowlj.supabase.co)';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dGpqaHZ2dGFzd3pod2hvd2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDA3NjcsImV4cCI6MjA5MjExNjc2N30.Jjqi1LWgxEgpT2nBdjuNyoLxEP_VQcKf3GEbIYKPI8Y';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false });

export default function ReportPage() {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingGPS, setIsFetchingGPS] = useState(false);
  
  // 🤖 State สำหรับ AI
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [aiResult, setAiResult] = useState<{ type: string, severity: number, description: string } | null>(null);
  
  const [mapRef, setMapRef] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);

  const [formData, setFormData] = useState({
    village_name: '',
    risk_type: 'ไฟป่า / หมอกควัน',
    severity_level: 3,
    description: '',
    reporter_name: '',
    reporter_role: 'ประชาชนทั่วไป'
  });

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
    iconSize: [32, 40], iconAnchor: [16, 36],
  }) : null;

  const LocationMarker = () => {
    useMapEvents({ click(e: any) { setPosition(e.latlng); } });
    return position === null ? null : <Marker position={position} icon={customIcon}></Marker>;
  };

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
        if (mapRef) mapRef.flyTo([latitude, longitude], 16, { duration: 1.5 });
        setIsFetchingGPS(false);
      },
      (err) => {
        setIsFetchingGPS(false);
        Swal.fire({ icon: 'warning', title: 'ดึงตำแหน่งไม่ได้', text: 'กรุณาอนุญาตให้ระบบเข้าถึง Location บนมือถือของคุณ' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleVillageChange = (e: any) => {
    const selectedName = e.target.value;
    setFormData(prev => ({ ...prev, village_name: selectedName }));
    if (mapRef && villageList.length > 0) {
      const targetVillage = villageList.find(v => v.name === selectedName);
      if (targetVillage) mapRef.flyTo([targetVillage.lat, targetVillage.lng], 15, { duration: 1.5, easeLinearity: 0.25 });
    }
  };

  const handleInputChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const setSeverity = (level: number) => {
    setFormData(prev => ({ ...prev, severity_level: level }));
  };

  // 🤖 🚀 ฟังก์ชันส่งรูปไปให้ AI วิเคราะห์
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFiles(e.target.files);
      
      // ดำเนินการวิเคราะห์ AI
      setIsAnalyzingAI(true);
      setAiResult(null);

      try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = async () => {
          const base64data = reader.result;
          const res = await fetch('/api/analyze-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64data })
          });
          
          const data = await res.json();
          if (data.success && data.result) {
            setAiResult(data.result);
            // เติมข้อมูลลงฟอร์มอัตโนมัติด้วยผลลัพธ์จาก AI
            setFormData(prev => ({
              ...prev,
              risk_type: data.result.type || prev.risk_type,
              severity_level: data.result.severity || prev.severity_level,
              description: `[AI วิเคราะห์] ${data.result.description}\n\nรายละเอียดเพิ่มเติม: `
            }));
            
            Swal.fire({
              toast: true, position: 'top-end', icon: 'success', 
              title: 'AI ประเมินภาพเรียบร้อยแล้ว', showConfirmButton: false, timer: 3000
            });
          }
        };
      } catch (error) {
        console.error("AI Analysis failed:", error);
      } finally {
        setIsAnalyzingAI(false);
      }
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!position) {
      Swal.fire({ icon: 'warning', title: 'ลืมปักหมุด!', text: 'กรุณากดปุ่มดึงตำแหน่ง หรือคลิกบนแผนที่ครับ' });
      return;
    }
    if (!formData.description) {
      Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณาระบุรายละเอียดของสถานการณ์' });
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUrl = null;

      if (selectedFiles && selectedFiles.length > 0) {
        const file = selectedFiles[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `reports/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('disaster_images')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('disaster_images')
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
      }

      const trackingCode = `BL-${Math.floor(100000 + Math.random() * 900000)}`;

      const { error: insertError } = await supabase
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
            image_url: imageUrl,
            tracking_code: trackingCode,
            status: 'รับเรื่องแล้ว'
          }
        ]);

      if (insertError) throw insertError;

      const statusUrl = `${window.location.origin}/status?code=${trackingCode}`;
      const qrCodeImageUrl = `[https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=$](https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=$){encodeURIComponent(statusUrl)}`;

      localStorage.setItem('bl_latest_tracking_code', trackingCode);

      Swal.fire({
        title: 'ส่งข้อมูลสำเร็จ!',
        html: `
          <div class="mt-1 text-sm text-gray-600">หมายเลขติดตามคำร้องของคุณคือ:</div>
          <div class="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg text-2xl font-bold text-green-700 tracking-widest select-all cursor-text">
            ${trackingCode}
          </div>
          <div class="mt-4 flex flex-col items-center justify-center">
            <span class="text-xs font-bold text-gray-800 mb-2 bg-gray-100 px-3 py-1 rounded-full">📷 แคปหน้าจอนี้เก็บไว้</span>
            <img src="${qrCodeImageUrl}" alt="QR Code" class="w-40 h-40 object-contain rounded-lg border-2 border-dashed border-gray-300 p-2 shadow-sm" />
            <span class="text-[11px] text-gray-500 mt-2 leading-tight">
              นำ QR Code นี้ให้ผู้นำชุมชน หรือ อสม.<br/>สแกนเพื่อตรวจสอบสถานะแทนคุณได้ทันที
            </span>
          </div>
        `,
        showDenyButton: true,
        confirmButtonText: 'กลับหน้าหลัก',
        denyButtonText: 'แจ้งเหตุเพิ่ม',
        confirmButtonColor: '#3b82f6',
        denyButtonColor: '#10b981',    
        reverseButtons: true           
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = '/';
        } else {
          setFormData({ ...formData, description: '', reporter_name: '' });
          setPosition(null);
          setSelectedFiles(null);
          setPdpaConsent(false);
          setAiResult(null); // เคลียร์ AI Result
        }
      });

    } catch (error: any) {
      console.error('Error:', error.message);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return <div className="h-screen w-screen bg-gray-100 flex items-center justify-center">Loading...</div>;

  const riskTypes = ['ไฟป่า / หมอกควัน', 'ดินโคลนถล่ม / ดินสไลด์', 'น้ำป่าไหลหลาก / น้ำท่วม', 'ต้นไม้ล้มขวางทาง', 'แผ่นดินไหว', 'อื่นๆ'];

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-white font-sans overflow-hidden">
      
      {/* 🗺️ แผนที่ */}
      <div className="order-1 md:order-2 w-full h-[40vh] md:h-full md:flex-1 relative bg-gray-900 z-0 flex-shrink-0">
        <MapContainer center={[18.1633, 98.3744]} zoom={13} maxZoom={20} className="w-full h-full cursor-crosshair" ref={setMapRef}>
          {/* 🗺️ แผนที่ Google Satellite (ดาวเทียม) ตามที่ชาวบ้านต้องการ */}
          <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} attribution="Google Maps Satellite" />
          {/* 📍 ขอบเขตหมู่บ้าน (ปรับเป็นเส้นประสีเหลืองสว่าง ให้ตัดกับสีของป่า) */}
          {geoBlock && <GeoJSON data={geoBlock} style={{ color: '#fde047', weight: 2.5, fillOpacity: 0, dashArray: '5, 5' }} interactive={false} />}
          
          <LocationMarker />
        </MapContainer>
        {!position && (
          <div className="absolute top-4 md:top-6 left-1/2 transform -translate-x-1/2 z-[400] pointer-events-none w-[90%] md:w-auto flex justify-center">
            <div className="bg-black/70 backdrop-blur-md text-white px-4 md:px-6 py-2 md:py-2.5 rounded-full shadow-2xl border border-gray-600 flex items-center space-x-2 animate-bounce">
              <span className="text-base md:text-lg">👇</span>
              <span className="text-[12px] md:text-sm font-medium tracking-wide">เลื่อนและคลิกเพื่อปักหมุดจุดเกิดเหตุ</span>
            </div>
          </div>
        )}
      </div>

      {/* 🔴 ฟอร์มแจ้งเหตุ */}
      <div className="order-2 md:order-1 w-full md:w-[420px] h-[60vh] md:h-full bg-white shadow-[0_-10px_20px_rgba(0,0,0,0.15)] md:shadow-2xl z-10 flex flex-col relative flex-shrink-0">
        
        <div className="bg-red-600 text-white p-4 md:p-5 shadow-md flex-shrink-0">
          <div className="w-full flex justify-center pb-3 md:hidden">
            <div className="w-12 h-1.5 bg-white/40 rounded-full"></div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-2xl animate-pulse">🚨</span>
              <div>
                <h1 className="text-lg font-bold">รายงานจุดเสี่ยงภัย</h1>
                <p className="text-[11px] text-red-200">ระบบแจ้งเหตุ ต.บ่อหลวง</p>
              </div>
            </div>
            <div className="flex space-x-2">
              <a href="/" className="bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-lg text-[11px] md:text-xs font-bold transition-colors shadow-sm flex items-center">
                🏠 หน้าแรก
              </a>
              <a href="/status" className="bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-lg text-[11px] md:text-xs font-bold transition-colors shadow-sm flex items-center">
                🔍 สถานะ
              </a>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-5 overflow-y-auto flex-1 custom-scrollbar">
          
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 shadow-sm">
            <div className="flex items-start mb-3">
              <span className="text-blue-600 text-lg mr-2">📍</span>
              <div>
                <h3 className="text-[13px] font-bold text-blue-800">ระบุตำแหน่งของคุณ</h3>
                <p className="text-[11px] text-blue-600/80 leading-relaxed mt-1">เพื่อความแม่นยำ กรุณาอนุญาตการเข้าถึง GPS หรือคลิกปักหมุดบนแผนที่ด้วยตนเอง</p>
              </div>
            </div>
            <button type="button" onClick={handleGetLocation} disabled={isFetchingGPS} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center space-x-2">
              {isFetchingGPS ? <><span className="animate-spin">⏳</span><span>กำลังค้นหาตำแหน่ง...</span></> : <><span className="text-lg">🎯</span><span>ใช้ตำแหน่งปัจจุบันของฉัน</span></>}
            </button>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="flex items-center">
              <div className="flex-1 border-t border-gray-200"></div><span className="px-3 text-xs font-bold text-gray-400">ข้อมูลการแจ้งเหตุ</span><div className="flex-1 border-t border-gray-200"></div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">📎 1. แนบรูปภาพประกอบ (รองรับ AI วิเคราะห์) <span className="text-red-500">*</span></label>
              <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                  {selectedFiles && selectedFiles.length > 0 ? (
                    <><span className="text-3xl">✅</span><span className="text-[13px] font-bold text-green-600">แนบรูปภาพแล้ว</span><span className="text-[11px] text-gray-500 truncate max-w-[200px]">{selectedFiles[0].name}</span></>
                  ) : (
                    <><span className="text-3xl text-gray-400">📷</span><span className="text-[13px] font-bold text-gray-600 bg-gray-200 px-3 py-1 rounded-md">เลือกไฟล์ / ถ่ายรูป</span><span className="text-[11px] text-gray-400">AI จะช่วยคุณประเมินข้อมูลทันที</span></>
                  )}
                </div>
              </div>
              
              {/* 🤖 AI Loading & Result Badges */}
              {isAnalyzingAI && (
                <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-center space-x-3">
                   <span className="text-lg animate-spin">🪄</span>
                   <span className="text-xs font-bold text-purple-700">AI กำลังวิเคราะห์รูปภาพ กรุณารอสักครู่...</span>
                </div>
              )}
              {aiResult && !isAnalyzingAI && (
                <div className="mt-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-purple-200 rounded-lg shadow-sm">
                   <div className="flex items-center mb-1">
                      <span className="text-purple-600 mr-1.5">🤖</span>
                      <span className="text-xs font-bold text-purple-800">วิเคราะห์โดย Gemini AI</span>
                   </div>
                   <div className="text-[11px] text-gray-600 flex items-center space-x-2 mt-1.5">
                      <span className="bg-white px-2 py-0.5 rounded border border-purple-100">พยากรณ์: <b>{aiResult.type}</b></span>
                      <span className="bg-white px-2 py-0.5 rounded border border-purple-100">รุนแรง: <b>ระดับ {aiResult.severity}</b></span>
                   </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">2. พื้นที่หมู่บ้านที่พบเหตุ</label>
              <select name="village_name" value={formData.village_name} onChange={handleVillageChange} className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-700 focus:ring-red-500 focus:border-red-500 bg-white outline-none">
                {villageList.length > 0 ? villageList.map((v: any) => <option key={v.name} value={v.name}>{v.name}</option>) : <option value="">กำลังโหลด...</option>}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">3. ประเภทของสาธารณภัย <span className="text-red-500">*</span></label>
              <select name="risk_type" value={formData.risk_type} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-700 focus:ring-red-500 focus:border-red-500 bg-white outline-none">
                {riskTypes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">4. ระดับความรุนแรง <span className="text-red-500">*</span></label>
              <div className="flex justify-between space-x-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                {[1, 2, 3, 4, 5].map(level => (
                  <button type="button" key={level} onClick={() => setSeverity(level)} 
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${formData.severity_level === level ? (level >= 4 ? 'bg-red-600 text-white shadow-md' : level === 3 ? 'bg-orange-500 text-white shadow-md' : 'bg-yellow-400 text-white shadow-md') : 'bg-transparent text-gray-500 hover:bg-gray-200'}`}
                  >{level}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">5. รายละเอียดและข้อเสนอแนะ <span className="text-red-500">*</span></label>
              <textarea name="description" value={formData.description} onChange={handleInputChange} rows={3} placeholder="เช่น ไฟป่ากำลังลุกลามเข้าใกล้สวนชาวบ้าน..." className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-700 focus:ring-red-500 focus:border-red-500 bg-white resize-none outline-none"></textarea>
            </div>

            <div className="flex items-center mt-6 mb-2">
              <div className="flex-1 border-t border-gray-200"></div><span className="px-3 text-xs font-bold text-gray-400">ข้อมูลผู้แจ้ง</span><div className="flex-1 border-t border-gray-200"></div>
            </div>

            <div className="grid grid-cols-2 gap-4 pb-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">ชื่อผู้แจ้ง (ไม่บังคับ)</label>
                <input type="text" name="reporter_name" value={formData.reporter_name} onChange={handleInputChange} placeholder="ระบุชื่อ..." className="w-full border border-gray-300 rounded-lg p-2.5 text-[13px] text-gray-700 bg-white outline-none focus:border-red-500" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">สถานะผู้แจ้ง</label>
                <select name="reporter_role" value={formData.reporter_role} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg p-2.5 text-[13px] text-gray-700 bg-white outline-none focus:border-red-500">
                  <option value="ประชาชนทั่วไป">ประชาชนทั่วไป</option>
                  <option value="ผู้นำชุมชน/กำนัน/ผู้ใหญ่บ้าน">ผู้นำชุมชน</option>
                  <option value="เจ้าหน้าที่รัฐ/อปท.">เจ้าหน้าที่รัฐ</option>
                </select>
              </div>
            </div>

            <div className={`mt-6 p-4 rounded-xl border transition-all ${pdpaConsent ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-300'}`}>
              <label className="flex items-start space-x-3 cursor-pointer">
                <div className="flex items-center h-5 mt-0.5"><input type="checkbox" checked={pdpaConsent} onChange={(e) => setPdpaConsent(e.target.checked)} className="w-5 h-5 text-green-600 bg-white border-gray-300 rounded focus:ring-green-500 cursor-pointer" /></div>
                <div className="flex flex-col">
                  <span className={`text-[13px] font-bold ${pdpaConsent ? 'text-green-800' : 'text-gray-700'}`}>ความยินยอมในการให้ข้อมูลส่วนบุคคล (PDPA) <span className="text-red-500">*</span></span>
                  <span className={`text-[11px] mt-1 leading-relaxed ${pdpaConsent ? 'text-green-700/80' : 'text-gray-500'}`}>ข้าพเจ้ายินยอมให้ทางหน่วยงานเก็บรวบรวมและใช้ข้อมูลที่ระบุไว้ เพื่อตรวจสอบและประสานงาน ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล</span>
                </div>
              </label>
            </div>

          </form>
        </div>

        <div className="p-4 md:p-5 border-t border-gray-200 bg-white flex-shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[11px] font-bold text-gray-500">พิกัดเกิดเหตุ (GPS):</span>
            {position ? <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-100 px-2.5 py-1 rounded border border-blue-200">{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</span> : <span className="text-[11px] font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded border border-red-100">ยังไม่ระบุพิกัด</span>}
          </div>
          
          <button onClick={handleSubmit} disabled={isSubmitting || !pdpaConsent} className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-lg flex justify-center items-center space-x-2 transition-all ${isSubmitting ? 'bg-gray-400 text-gray-100 cursor-not-allowed' : !pdpaConsent ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 hover:shadow-xl active:scale-[0.98]'}`}>
            {isSubmitting ? <span>กำลังส่งข้อมูล...</span> : <><span className="text-lg">✅</span> <span>ส่งข้อมูลแจ้งเหตุ</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
