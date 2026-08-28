'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js';
import Swal from 'sweetalert2'; 
import { useMapEvents } from 'react-leaflet';
// 🌟 สำคัญ: อย่าลืม Import html2canvas ไว้ด้านบนสุดของไฟล์
import html2canvas from 'html2canvas';

// 🌟 ตั้งค่า Supabase (ดึงจาก Environment Variables)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase Error: Missing environment variables.");
}
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false });

// 🚀 ฟังก์ชันช่วย: เช็คว่าพิกัดตกอยู่ในขอบเขต Polygon หรือไม่
const isPointInPolygon = (point: number[], polygon: number[][]) => {
  let x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    let xi = polygon[i][0], yi = polygon[i][1];
    let xj = polygon[j][0], yj = polygon[j][1];
    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const checkPointInFeature = (lng: number, lat: number, feature: any) => {
  if (!feature.geometry || !feature.geometry.coordinates) return false;
  const type = feature.geometry.type;
  const coords = feature.geometry.coordinates;
  if (type === 'Polygon') {
    return isPointInPolygon([lng, lat], coords[0]);
  } else if (type === 'MultiPolygon') {
    for (let i = 0; i < coords.length; i++) {
      if (isPointInPolygon([lng, lat], coords[i][0])) return true;
    }
  }
  return false;
};

// 🌟 ฟังก์ชันสร้างรูปภาพและเรียกหน้าต่างแชร์ (Share Sheet)
const downloadSlipImage = async (trackingCode: string, qrUrlStr: string) => {
  try {
    // 1. สร้างภาพ QR Code ให้พร้อมใช้งานก่อน
    const qrImage = new Image();
    qrImage.crossOrigin = "Anonymous"; 
    qrImage.src = qrUrlStr;

    await new Promise((resolve) => {
      qrImage.onload = resolve;
      qrImage.onerror = () => {
        console.warn("QR Code โหลดไม่ทัน จะวาดสลิปแบบไม่มี QR แทน");
        resolve(null);
      };
    });

    // 2. เตรียม Canvas (เหมือนกระดาษวาดรูป) ความละเอียด 2 เท่า (Retina)
    const canvas = document.createElement('canvas');
    const scale = 2;
    const width = 400;
    const height = 550;
    canvas.width = width * scale;
    canvas.height = height * scale;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // ตั้งค่าสเกล
    ctx.scale(scale, scale);

    // 3. วาดพื้นหลังสลิป (สีขาว)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 4. วาดหัวสลิป
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('หมายเลขติดตามคำร้องของคุณ', width / 2, 60);

    // 5. วาดกล่องเขียว
    ctx.fillStyle = '#059669';
    roundRect(ctx, 40, 80, width - 80, 80, 16);
    ctx.fill();

    // 6. วาดรหัส Tracking (สีขาว บนกล่องเขียว)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(trackingCode, width / 2, 133);

    // 7. วาดกล่องเทาด้านล่าง
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    roundRect(ctx, 40, 180, width - 80, 310, 16);
    ctx.fill();
    ctx.stroke();

    // 8. วาดป้ายสีน้ำเงิน "ข้อมูลบันทึกเข้าระบบแล้ว"
    ctx.fillStyle = '#3b82f6';
    roundRect(ctx, 80, 205, width - 160, 35, 18);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✅ ข้อมูลบันทึกเข้าระบบแล้ว', width / 2, 227);

    // 9. วาดกรอบสำหรับ QR
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]); // เส้นประ
    roundRect(ctx, 110, 260, 180, 180, 12);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]); // คืนค่าเส้นทึบ

    // 10. แปะรูป QR (ถ้ามี)
    if (qrImage.complete && qrImage.naturalWidth > 0) {
      ctx.drawImage(qrImage, 120, 270, 160, 160);
    }

    // 11. วาดคำแนะนำด้านล่าง
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('นำรูปนี้ให้ผู้นำชุมชน หรือ อสม.', width / 2, 465);
    ctx.fillText('สแกนเพื่อตรวจสอบสถานะแทนคุณได้ทันที', width / 2, 485);

    // 12. วาดท้ายสลิป
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`เทศบาลตำบลบ่อหลวง จ.เชียงใหม่ • ${new Date().toLocaleDateString('th-TH')}`, width / 2, 530);

    // 13. แปลงร่าง Canvas เป็นไฟล์ภาพ
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `Slip_BL_${trackingCode}.png`, { type: 'image/png' });
      const imageURL = URL.createObjectURL(blob);

      // เช็คว่าเป็นมือถือหรือไม่ (Mobile / Tablet)
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      // เช็คว่าเบราว์เซอร์รองรับการ Share ไฟล์ภาพหรือไม่
      const isShareSupported = navigator.canShare && navigator.canShare({ files: [new File([], '')] });

      // 🌟 แก้ไขเงื่อนไข: บังคับให้หน้าต่างแชร์เด้ง "เฉพาะบนมือถือ" เท่านั้น
      if (isMobileDevice && isShareSupported) {
        // มือถือ: เปิดหน้าต่างแชร์
        try {
          await navigator.share({
            title: 'หลักฐานการแจ้งเหตุ (เทศบาลตำบลบ่อหลวง)',
            text: `แจ้งเหตุสำเร็จ! รหัสติดตาม: ${trackingCode}`,
            files: [file]
          });
        } catch (shareError: any) {
          if (shareError.name !== 'AbortError') {
             // ถ้าแชร์ไม่ได้ ให้โชว์รูปให้แตะค้าง
             showFallbackImage(imageURL);
          }
        }
      } else if (isMobileDevice && !isShareSupported) {
        // มือถือรุ่นเก่า (ที่ไม่รองรับ Share): โชว์รูปให้แตะค้าง
        showFallbackImage(imageURL);
      } else {
        // 💻 คอมพิวเตอร์ (PC): บังคับดาวน์โหลดลงเครื่องทันที! (ข้ามระบบ Share ของ Windows/Mac ไปเลย)
        const link = document.createElement('a');
        link.download = `Slip_แจ้งเหตุ_${trackingCode}.png`;
        link.href = imageURL;
        document.body.appendChild(link); // จำเป็นสำหรับบางเบราว์เซอร์บน PC
        link.click();
        document.body.removeChild(link);
        
        // คืนหน่วยความจำ
        setTimeout(() => URL.revokeObjectURL(imageURL), 100);
      }
    }, 'image/png');

  } catch (error) {
    console.error("Error creating slip image:", error);
  }
};

// ฟังก์ชันช่วยวาดกล่องขอบมนใน Canvas
const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// ฟังก์ชันโชว์รูปภาพให้แตะค้าง (Fallback สำหรับมือถือ)
const showFallbackImage = (imageURL: string) => {
  const imageContainer = document.getElementById('slip-image-result');
  const originalContent = document.getElementById('slip-original-html');
  if (imageContainer && originalContent) {
    originalContent.style.display = 'none';
    imageContainer.innerHTML = `
      <div style="text-align: center; margin-top: 10px;">
        <p style="color: #ef4444; font-size: 13px; font-weight: bold; margin-bottom: 8px;">
          👇 แตะค้างที่รูปภาพเพื่อบันทึก 👇
        </p>
        <img src="${imageURL}" alt="สลิปแจ้งเหตุ" style="max-width: 100%; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15);" />
      </div>
    `;
  }
};

export default function ReportPage() {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingGPS, setIsFetchingGPS] = useState(false);
  
  // 🕒 State สำหรับจัดการ Cooldown Timer (ป้องกันสแปม)
  const [cooldownTime, setCooldownTime] = useState(0);

  // 🛡️ SECURITY: เช็คเวลา Cooldown จาก LocalStorage ตอนโหลดหน้า เพื่อป้องกันการกด Refresh หนี Cooldown
  useEffect(() => {
    const lastSubmitTime = localStorage.getItem('bl_last_submit_time');
    if (lastSubmitTime) {
      const timePassed = Math.floor((Date.now() - parseInt(lastSubmitTime)) / 1000);
      if (timePassed < 60) {
        setCooldownTime(60 - timePassed);
      }
    }
  }, []);
  
  // 🤖 State สำหรับ AI
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [aiResult, setAiResult] = useState<{ type: string, severity: number, description: string } | null>(null);
  
  const [mapRef, setMapRef] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);

  const [formData, setFormData] = useState({
    village_name: '',
    risk_type: 'ไฟป่า / หมอกควัน (PM 2.5)',
    severity_level: 3,
    description: '',
    reporter_name: '',
    reporter_role: 'ประชาชนทั่วไป'
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdpaConsent, setPdpaConsent] = useState(false);

  // 🛡️ ระบบนับถอยหลัง (Timer)
  useEffect(() => {
    if (cooldownTime > 0) {
      const timer = setTimeout(() => {
        setCooldownTime((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownTime]);

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

  useEffect(() => {
    if (position && geoBlock && geoBlock.features) {
      let foundVillage = null;
      for (const feature of geoBlock.features) {
        if (checkPointInFeature(position.lng, position.lat, feature)) {
          const props = feature.properties || {};
          const rawName = props.own_villag || props.name_th || props.vil_name || props.name || props.zone_name || `หมู่ที่ ${props.zone_id || props.id || 'ไม่ระบุ'}`;
          foundVillage = formatVillageName(rawName);
          break;
        }
      }

      if (foundVillage && foundVillage !== formData.village_name) {
        setFormData(prev => ({ ...prev, village_name: foundVillage }));
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'info',
          title: `📍 อัปเดตพื้นที่: ${foundVillage}`,
          showConfirmButton: false,
          timer: 2500
        });
      }
    }
  }, [position, geoBlock]);

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const customIcon = L ? L.divIcon({
    className: 'bg-transparent border-none',
    html: `
      <div class="relative flex flex-col items-center">
        <div class="w-10 h-10 bg-rose-600 rounded-full border-2 border-white shadow-xl flex items-center justify-center z-10">
          <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <div class="w-3 h-3 bg-black/40 rounded-full blur-[2px] -mt-2 z-0"></div>
      </div>
    `,
    iconSize: [40, 48], iconAnchor: [20, 44],
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

  const compressImage = (file: File, maxWidth = 1024, quality = 0.8): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Cannot get canvas context'));
          
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('Canvas is empty'));
            const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const compressedFile = new File([blob], newFileName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          }, 'image/jpeg', quality);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const originalFile = e.target.files[0];
      
      setIsAnalyzingAI(true);
      setAiResult(null);

      try {
        const compressedFile = await compressImage(originalFile, 1024, 0.8);
        setSelectedFile(compressedFile);

        const base64data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(compressedFile);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });

        const res = await fetch('/api/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64data })
        });
        
        const data = await res.json();
        
        if (data.success && data.result) {
          setAiResult(data.result);
          setFormData(prev => ({
            ...prev,
            risk_type: data.result.type || prev.risk_type,
            severity_level: data.result.severity || prev.severity_level,
            description: `[AI วิเคราะห์] ${data.result.description}\n\nรายละเอียดเพิ่มเติม: `
          }));
          
          Swal.fire({
            toast: true, position: 'top-end', icon: 'success', 
            title: 'AI ประเมินภาพเสร็จสิ้น', showConfirmButton: false, timer: 3000
          });
        } else {
          console.error("AI Error:", data.error);
          Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'AI ไม่สามารถระบุได้', text: 'กรุณาระบุรายละเอียดด้วยตนเอง', showConfirmButton: false, timer: 3000 });
        }
      } catch (error) {
        console.error("File compression or AI Request failed:", error);
        Swal.fire({ icon: 'error', title: 'ประมวลผลรูปไม่สำเร็จ', text: 'กรุณาลองเลือกรูปใหม่อีกครั้ง' });
      } finally {
        setIsAnalyzingAI(false);
      }
    }
  };

  // ===============================================
  // 🚀 ฟังก์ชัน Submit ที่เพิ่มระบบ Auto-Save Slip
  // ===============================================
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

    if (!selectedFile) { 
      Swal.fire({ icon: 'warning', title: 'ลืมแนบรูปภาพ!', text: 'กรุณาถ่ายภาพหรือแนบรูปสถานที่เกิดเหตุ เพื่อความรวดเร็วในการประเมินสถานการณ์ครับ' });
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUrl = null;
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `reports/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('disaster_images')
          .upload(filePath, selectedFile);

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
      const qrCodeImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(statusUrl)}&size=200`;

      // 🛡️ SECURITY: บันทึกข้อมูลเพื่อเริ่มการนับ Cooldown 60 วินาที ทั้งใน State และ LocalStorage
      localStorage.setItem('bl_latest_tracking_code', trackingCode);
      localStorage.setItem('bl_last_submit_time', Date.now().toString());
      setCooldownTime(60);

      // แสดง Popup แจ้งเตือนความสำเร็จ (รูปแบบสลิปใบเสร็จ)
      Swal.fire({
        title: 'ส่งข้อมูลสำเร็จ!',
        html: `
          <!-- โครงสร้าง E-Slip แบบทางการ -->
          <div style="font-family: Arial, sans-serif; color: #1e293b; background: #ffffff; padding: 10px 0;">
            
            <!-- หัวสลิป -->
            <div style="font-size: 13px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
              หมายเลขติดตามคำร้อง
            </div>

            <!-- กล่อง Tracking Code สีเข้ม -->
            <div style="background-color: #059669; padding: 15px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.3);">
              <div style="font-size: 32px; font-weight: 900; color: #ffffff; letter-spacing: 2px;">
                ${trackingCode}
              </div>
            </div>

            <!-- ข้อมูล QR Code & คำแนะนำ -->
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; text-align: center;">
              
              <!-- ป้ายสถานะ -->
              <div style="display: inline-block; background-color: #3b82f6; color: #ffffff; font-size: 13px; font-weight: bold; padding: 6px 16px; border-radius: 20px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);">
                ✅ ระบบบันทึกรูปนี้ลงเครื่องคุณแล้ว
              </div>

              <!-- กรอบ QR Code -->
              <div style="background-color: #ffffff; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 10px; display: inline-block; margin-bottom: 15px;">
                <img src="${qrCodeImageUrl}" alt="QR Code" style="width: 160px; height: 160px; object-fit: contain; display: block;" />
              </div>

              <!-- คำแนะนำ -->
              <div style="font-size: 12px; color: #475569; line-height: 1.6; font-weight: 600;">
                นำรูปนี้ให้ <span style="color: #0284c7;">ผู้นำชุมชน</span> หรือ <span style="color: #0284c7;">อสม.</span><br/>
                สแกนเพื่อตรวจสอบสถานะแทนคุณได้ทันที
              </div>

            </div>
            
            <!-- ท้ายสลิป -->
            <div style="margin-top: 15px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px dashed #e2e8f0; padding-top: 10px;">
              เทศบาลตำบลบ่อหลวง จ.เชียงใหม่
            </div>

          </div>
        `,
        showDenyButton: true,
        confirmButtonText: 'กลับหน้าหลัก',
        denyButtonText: 'แจ้งข้อมูลเพิ่ม',
        confirmButtonColor: '#2563eb', // สีน้ำเงินเข้มขึ้น
        denyButtonColor: '#10b981',    // สีเขียวเข้มขึ้น
        reverseButtons: true            
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = '/';
        } else {
          setFormData({ ...formData, description: '', reporter_name: '' });
          setPosition(null);
          setSelectedFile(null); 
          setPdpaConsent(false);
          setAiResult(null); 
        }
      });

      // 🌟 สั่งถ่ายรูปหน้าจอ Popup แล้วดาวน์โหลดลงเครื่องทันที (สลิปธนาคารสไตล์)
      downloadSlipImage(trackingCode, qrCodeImageUrl);

    } catch (error: any) {
      console.error('Error:', error.message);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <div className="text-slate-500 font-medium animate-pulse">กำลังโหลดระบบ...</div>
    </div>
  );

  const riskTypes = [
    'ไฟป่า / หมอกควัน (PM 2.5)',
    'น้ำป่าไหลหลาก / น้ำท่วม',
    'ดินโคลนถล่ม / ดินสไลด์',
    'ต้นไม้ล้มขวางทาง',
    'การลักลอบทิ้งขยะ / ขยะมูลฝอยตกค้าง',
    'มลพิษทางน้ำ / น้ำเสีย',
    'การบุกรุกทำลายป่า / ลักลอบตัดไม้',
    'อื่นๆ'
  ];

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-screen bg-slate-50 font-sans overflow-hidden">
      
      {/* 🗺️ แผนที่ Google ดาวเทียม */}
      <div className="order-1 md:order-2 w-full h-[45vh] md:h-full md:flex-1 relative z-0 flex-shrink-0 shadow-inner bg-slate-900">
        <MapContainer center={[18.1633, 98.3744]} zoom={13} maxZoom={20} className="w-full h-full cursor-crosshair" ref={setMapRef}>
          <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} attribution="&copy; Google Maps" />
          {geoBlock && <GeoJSON data={geoBlock} style={{ color: '#fde047', weight: 2.5, fillOpacity: 0, dashArray: '5, 5' }} interactive={false} />}
          <LocationMarker />
        </MapContainer>
        
        {/* Floating Badge แนะนำให้ปักหมุด */}
        {!position && (
          <div className="absolute top-4 md:top-6 left-1/2 transform -translate-x-1/2 z-[400] pointer-events-none w-[90%] md:w-auto flex justify-center">
            <div className="bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full shadow-lg border border-slate-100 flex items-center space-x-2 animate-bounce">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span className="text-sm font-bold text-slate-700 tracking-wide">เลื่อนแผนที่เพื่อปักหมุด</span>
            </div>
          </div>
        )}
      </div>

      {/* 📝 ฟอร์มแจ้งข้อมูล (Modern Slide Sheet UI) */}
      <div className="order-2 md:order-1 w-full md:w-[460px] h-[55vh] md:h-full bg-white md:rounded-none rounded-t-[2.5rem] shadow-[0_-15px_40px_rgba(0,0,0,0.08)] md:shadow-2xl z-10 flex flex-col relative flex-shrink-0 -mt-6 md:mt-0">
        
        {/* ขีดตกแต่งด้านบน (Handle สำหรับมือถือ) */}
        <div className="w-full flex justify-center pt-3 pb-1 shrink-0 md:hidden">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
        </div>

        {/* 👑 Header Section (Professional Style) */}
        <div className="px-6 pb-4 pt-2 flex items-center justify-between border-b border-slate-100 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 bg-gradient-to-br from-rose-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div>
              <h1 className="text-[17px] font-extrabold text-slate-800 leading-tight">แจ้งเหตุสาธารณภัย</h1>
              <p className="text-[11px] text-slate-500 font-medium">เทศบาลตำบลบ่อหลวง จ.เชียงใหม่</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <a href="/" className="p-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition shadow-sm bg-white" title="หน้าแรก">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </a>
            <a href="/status" className="p-2 border border-slate-200 text-indigo-600 rounded-xl hover:bg-indigo-50 transition shadow-sm bg-white" title="ติดตามสถานะ">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </a>
          </div>
        </div>

        {/* 📝 ฟอร์มกรอกข้อมูล */}
        <div className="p-6 overflow-y-auto flex-1 scrollbar-hide space-y-6 pb-[120px]">
          
          {/* 📍 1. Card ระบุตำแหน่ง (GPS) */}
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-200/30 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="flex items-start space-x-3 mb-4 relative z-10">
              <div className="p-2 bg-white rounded-xl shadow-sm border border-indigo-100 text-indigo-600">
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">ระบุตำแหน่งเกิดเหตุ</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">กรุณาอนุญาตเข้าถึง GPS หรือปักหมุดบนแผนที่</p>
                {position && <div className="mt-1 inline-block text-[10px] font-mono font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200">{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</div>}
              </div>
            </div>
            <button type="button" onClick={handleGetLocation} disabled={isFetchingGPS} className="relative z-10 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center space-x-2">
              {isFetchingGPS ? (
                <><svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>กำลังค้นหาตำแหน่ง...</span></>
              ) : (
                <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg> <span>ใช้ตำแหน่งปัจจุบันของฉัน</span></>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center justify-center space-x-4">
            <div className="h-px bg-slate-200 flex-1"></div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ข้อมูลการรายงาน</span>
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>

          {/* 📷 2. Upload Card (มี AI) */}
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-slate-700 flex items-center">
              <svg className="w-4 h-4 mr-1.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              แนบรูปภาพประกอบ <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="border-2 border-dashed border-slate-300 bg-slate-50/50 hover:bg-indigo-50 hover:border-indigo-300 transition-colors rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer group relative min-h-[140px]">
              <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              {selectedFile ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-2">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <span className="text-[13px] font-bold text-emerald-600">แนบรูปภาพสำเร็จ</span>
                  <span className="text-[11px] text-slate-500 truncate max-w-[200px] mt-1">{selectedFile.name}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center border border-slate-200 group-hover:scale-110 group-hover:border-indigo-200 transition-all mb-3">
                    <svg className="w-6 h-6 text-slate-400 group-hover:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <span className="text-[13px] font-bold text-indigo-600">แตะเพื่อถ่ายรูป / เลือกไฟล์</span>
                  <span className="text-[10px] text-slate-500 mt-1.5 flex items-center bg-white px-2 py-0.5 rounded border border-slate-100 shadow-sm">
                    ✨ มีระบบ AI ช่วยประเมินข้อมูลทันที
                  </span>
                </div>
              )}
            </div>

            {/* AI Status */}
            {isAnalyzingAI && (
              <div className="mt-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center space-x-3">
                <svg className="animate-spin h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span className="text-[12px] font-bold text-indigo-700">AI กำลังวิเคราะห์รูปภาพ...</span>
              </div>
            )}
            {aiResult && !isAnalyzingAI && (
              <div className="mt-2 p-3.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl shadow-sm">
                <div className="flex items-center mb-2">
                  <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded flex items-center justify-center mr-2"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                  <span className="text-[12px] font-bold text-indigo-900">วิเคราะห์โดย Gemini AI</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-white px-2.5 py-1 rounded-lg border border-indigo-100 text-[11px] text-slate-600 shadow-sm">ภัย: <span className="font-bold text-indigo-700">{aiResult.type}</span></span>
                  <span className="bg-white px-2.5 py-1 rounded-lg border border-indigo-100 text-[11px] text-slate-600 shadow-sm">รุนแรง: <span className="font-bold text-rose-600">ระดับ {aiResult.severity}</span></span>
                </div>
              </div>
            )}
          </div>

          {/* 🏘️ 3. ข้อมูลพื้นฐาน */}
          <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div>
              <label className="text-[13px] font-bold text-slate-700 mb-1.5 block">พื้นที่หมู่บ้านที่พบปัญหา</label>
              <select name="village_name" value={formData.village_name} onChange={handleVillageChange} className="w-full border-0 bg-white rounded-xl p-3.5 text-[13px] text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                {villageList.length > 0 ? villageList.map((v: any) => <option key={v.name} value={v.name}>{v.name}</option>) : <option value="">กำลังโหลดข้อมูล...</option>}
              </select>
            </div>

            <div>
              <label className="text-[13px] font-bold text-slate-700 mb-1.5 flex items-center">ประเภทสาธารณภัย <span className="text-rose-500 ml-1">*</span></label>
              <select name="risk_type" value={formData.risk_type} onChange={handleInputChange} className="w-full border-0 bg-white rounded-xl p-3.5 text-[13px] text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                {riskTypes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* 🌡️ 4. ระดับความรุนแรง */}
          <div>
            <label className="text-[13px] font-bold text-slate-700 mb-2 flex items-center">ระดับความรุนแรง <span className="text-rose-500 ml-1">*</span></label>
            <div className="flex justify-between space-x-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              {[1, 2, 3, 4, 5].map(level => (
                <button type="button" key={level} onClick={() => setSeverity(level)} 
                  className={`flex-1 py-2.5 rounded-lg font-bold text-[13px] transition-all duration-200 ${formData.severity_level === level ? (level >= 4 ? 'bg-rose-500 text-white shadow-md scale-105' : level === 3 ? 'bg-amber-500 text-white shadow-md scale-105' : 'bg-emerald-500 text-white shadow-md scale-105') : 'bg-transparent text-slate-400 hover:bg-slate-200'}`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* 📝 5. รายละเอียด */}
          <div>
            <label className="text-[13px] font-bold text-slate-700 mb-1.5 flex items-center">รายละเอียดเหตุการณ์ <span className="text-rose-500 ml-1">*</span></label>
            <textarea name="description" value={formData.description} onChange={handleInputChange} rows={3} placeholder="อธิบายลักษณะเหตุการณ์เพิ่มเติม..." className="w-full border border-slate-200 bg-white rounded-xl p-3.5 text-[13px] text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all"></textarea>
          </div>

          {/* Divider */}
          <div className="flex items-center justify-center space-x-4 pt-2">
            <div className="h-px bg-slate-200 flex-1"></div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ข้อมูลผู้แจ้ง</span>
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>

          {/* 👤 6. ข้อมูลผู้แจ้ง */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">ชื่อ-สกุล (ไม่บังคับ)</label>
              <input type="text" name="reporter_name" value={formData.reporter_name} onChange={handleInputChange} placeholder="ระบุชื่อ..." className="w-full border border-slate-200 bg-slate-50 rounded-xl p-3 text-[13px] text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">สถานะผู้แจ้ง</label>
              <select name="reporter_role" value={formData.reporter_role} onChange={handleInputChange} className="w-full border border-slate-200 bg-slate-50 rounded-xl p-3 text-[13px] text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all">
                <option value="ประชาชนทั่วไป">ประชาชนทั่วไป</option>
                <option value="ผู้นำชุมชน/กำนัน/ผู้ใหญ่บ้าน">ผู้นำชุมชน</option>
                <option value="เจ้าหน้าที่รัฐ/อปท.">เจ้าหน้าที่รัฐ</option>
              </select>
            </div>
          </div>

          {/* ⚖️ PDPA Consent */}
          <div className={`p-4 rounded-xl border transition-all duration-300 ${pdpaConsent ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
            <label className="flex items-start space-x-3 cursor-pointer group">
              <div className="flex items-center h-5 mt-0.5">
                <input type="checkbox" checked={pdpaConsent} onChange={(e) => setPdpaConsent(e.target.checked)} className="w-5 h-5 text-emerald-500 bg-white border-slate-300 rounded focus:ring-emerald-500 cursor-pointer" />
              </div>
              <div className="flex flex-col">
                <span className={`text-[12px] font-bold transition-colors ${pdpaConsent ? 'text-emerald-800' : 'text-slate-700 group-hover:text-slate-900'}`}>ความยินยอมข้อมูลส่วนบุคคล (PDPA) <span className="text-rose-500">*</span></span>
                <span className={`text-[10px] mt-1 leading-relaxed transition-colors ${pdpaConsent ? 'text-emerald-600' : 'text-slate-500'}`}>ข้าพเจ้ายินยอมให้ทางหน่วยงานเก็บรวบรวมและใช้ข้อมูล เพื่อตรวจสอบและประสานงาน ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล</span>
              </div>
            </label>
          </div>

        </div>
        
        {/* 🚀 Fixed Bottom Submit Button */}
        <div className="absolute bottom-0 left-0 right-0 p-5 bg-white/95 backdrop-blur-xl border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-30 flex flex-col justify-center">
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !pdpaConsent || cooldownTime > 0} 
            className={`w-full py-4 rounded-2xl font-black text-[15px] shadow-lg flex justify-center items-center space-x-2 transition-all duration-300 transform 
              ${(isSubmitting || cooldownTime > 0) 
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' 
                : !pdpaConsent 
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none' 
                  : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 active:scale-95'}`}
          >
            {isSubmitting ? (
              <><svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>กำลังอัปโหลดข้อมูล...</span></>
            ) : cooldownTime > 0 ? (
              <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> <span>รอ {cooldownTime} วินาที</span></>
            ) : (
              <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg> <span>ยืนยันการส่งรายงาน</span></>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
