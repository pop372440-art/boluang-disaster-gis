'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2'; 
import { useMapEvents } from 'react-leaflet';
import {
  createIncidentAiFormPatch,
  INCIDENT_RISK_TYPES,
  parseIncidentAiResult,
  type IncidentAiResult
} from '@/lib/incident-ai';

const SEVERITY_OPTIONS = [
  { level: 1, label: 'เล็กน้อย', help: 'ยังไม่กระทบการใช้ชีวิต' },
  { level: 2, label: 'เฝ้าระวัง', help: 'เริ่มมีผลกระทบเล็กน้อย' },
  { level: 3, label: 'เร่งด่วน', help: 'ควรส่งเจ้าหน้าที่ตรวจสอบ' },
  { level: 4, label: 'รุนแรง', help: 'กระทบคนหรือทรัพย์สิน' },
  { level: 5, label: 'วิกฤต', help: 'มีอันตรายทันที' }
];

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

    const canvas = document.createElement('canvas');
    const scale = 2;
    const width = 400;
    const height = 550;
    canvas.width = width * scale;
    canvas.height = height * scale;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.scale(scale, scale);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('หมายเลขติดตามคำร้องของคุณ', width / 2, 60);

    ctx.fillStyle = '#059669';
    roundRect(ctx, 40, 80, width - 80, 80, 16);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(trackingCode, width / 2, 133);

    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    roundRect(ctx, 40, 180, width - 80, 310, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#3b82f6';
    roundRect(ctx, 80, 205, width - 160, 35, 18);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✅ ข้อมูลบันทึกเข้าระบบแล้ว', width / 2, 227);

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]); 
    roundRect(ctx, 110, 260, 180, 180, 12);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]); 

    if (qrImage.complete && qrImage.naturalWidth > 0) {
      ctx.drawImage(qrImage, 120, 270, 160, 160);
    }

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('นำรูปนี้ให้ผู้นำชุมชน หรือ อสม.', width / 2, 465);
    ctx.fillText('สแกนเพื่อตรวจสอบสถานะแทนคุณได้ทันที', width / 2, 485);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`เทศบาลตำบลบ่อหลวง จ.เชียงใหม่ • ${new Date().toLocaleDateString('th-TH')}`, width / 2, 530);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `Slip_BL_${trackingCode}.png`, { type: 'image/png' });
      const imageURL = URL.createObjectURL(blob);

      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isShareSupported = navigator.canShare && navigator.canShare({ files: [new File([], '')] });

      if (isMobileDevice && isShareSupported) {
        try {
          await navigator.share({
            title: 'หลักฐานการแจ้งเหตุ (เทศบาลตำบลบ่อหลวง)',
            text: `แจ้งเหตุสำเร็จ! รหัสติดตาม: ${trackingCode}`,
            files: [file]
          });
        } catch (shareError: any) {
          if (shareError.name !== 'AbortError') {
             showFallbackImage(imageURL);
          }
        }
      } else if (isMobileDevice && !isShareSupported) {
        showFallbackImage(imageURL);
      } else {
        const link = document.createElement('a');
        link.download = `Slip_แจ้งเหตุ_${trackingCode}.png`;
        link.href = imageURL;
        document.body.appendChild(link); 
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(imageURL), 100);
      }
    }, 'image/png');

  } catch (error) {
    console.error("Error creating slip image:", error);
  }
};

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
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingGPS, setIsFetchingGPS] = useState(false);
  
  // ✅ 1. เพิ่ม State เพื่อป้องกันการทับซ้อนพิกัด (สิทธิ์ผู้ใช้ต้องใหญ่กว่า Auto)
  const [isManualVillage, setIsManualVillage] = useState(false);

  const [cooldownTime, setCooldownTime] = useState(0);

  // 🌟 State สำหรับพับ/ขยาย Bottom Sheet บนมือถือ
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const lastSubmitTime = localStorage.getItem('bl_last_submit_time');
    if (lastSubmitTime) {
      const timePassed = Math.floor((Date.now() - parseInt(lastSubmitTime)) / 1000);
      if (timePassed < 60) {
        setCooldownTime(60 - timePassed);
      }
    }
  }, []);
  
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [aiResult, setAiResult] = useState<IncidentAiResult | null>(null);
  const [aiProvider, setAiProvider] = useState<'gemini' | 'groq' | null>(null);
  const [aiError, setAiError] = useState('');
  const [fileError, setFileError] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  
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
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');

  useEffect(() => {
    if (!selectedFile) {
      setImagePreviewUrl('');
      return;
    }

    const previewUrl = URL.createObjectURL(selectedFile);
    setImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedFile]);

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
    return Object.keys(vMap).map(name => ({ name, lat: vMap[name].sumLat / vMap[name].count, lng: vMap[name].sumLng / vMap[name].count }));
  }, [geoBlock]);

  useEffect(() => {
    if (villageList.length > 0 && !formData.village_name) {
      setFormData(prev => ({ ...prev, village_name: villageList[0].name }));
    }
  }, [villageList, formData.village_name]);

  // ✅ 2. อัปเดต useEffect ให้ตรวจสอบ isManualVillage
  useEffect(() => {
    if (position && geoBlock && geoBlock.features && !isManualVillage) {
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
  }, [position, geoBlock, isManualVillage, formData.village_name]);

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
    // 💡 ให้การคลิกบนแผนที่ถือเป็นการใช้พิกัดจริง (ปลดล็อก Auto)
    useMapEvents({ click(e: any) { setPosition(e.latlng); setGpsAccuracy(null); setIsManualVillage(false); } });
    return position === null ? null : <Marker position={position} icon={customIcon}></Marker>;
  };

  // ✅ 3. ปลดล็อคโหมด Auto เมื่อกดขอตำแหน่ง GPS ใหม่
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      Swal.fire({ icon: 'error', title: 'ไม่รองรับ GPS', text: 'เบราว์เซอร์ของคุณไม่รองรับการดึงตำแหน่งครับ' });
      return;
    }
    setIsFetchingGPS(true);
    setIsManualVillage(false);
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPosition({ lat: latitude, lng: longitude });
        setGpsAccuracy(Math.round(pos.coords.accuracy));
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

  // ✅ 4. ล็อคโหมดเมื่อผู้ใช้เลือกหมู่บ้านเอง
  const handleVillageChange = (e: any) => {
    const selectedName = e.target.value;
    setFormData(prev => ({ ...prev, village_name: selectedName }));
    setIsManualVillage(true); 

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

  const descriptionLength = formData.description.trim().length;
  const validationItems = [
    { id: 'location-section', label: 'ปักหมุดตำแหน่ง', valid: Boolean(position) },
    { id: 'image-section', label: 'แนบรูปภาพ', valid: Boolean(selectedFile) },
    { id: 'village-name', label: 'เลือกหมู่บ้าน', valid: Boolean(formData.village_name) },
    { id: 'description', label: 'รายละเอียดอย่างน้อย 10 ตัวอักษร', valid: descriptionLength >= 10 },
    { id: 'privacy-notice', label: 'รับทราบประกาศความเป็นส่วนตัว', valid: privacyAcknowledged }
  ];
  const completedRequired = validationItems.filter(item => item.valid).length;
  const invalidItems = validationItems.filter(item => !item.valid);
  const canSubmit = invalidItems.length === 0 && !isSubmitting && cooldownTime === 0;

  const compressImage = (file: File, maxDimension = 1024, quality = 0.8): Promise<File> => {
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
          const scale = Math.min(1, maxDimension / width, maxDimension / height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
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

  const analyzeImageFile = async (file: File) => {
    setIsAnalyzingAI(true);
    setAiResult(null);
    setAiProvider(null);
    setAiError('');

    try {
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });

      const res = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64data })
      });
      const data = await res.json().catch(() => null);

      const analyzedResult = data?.success ? parseIncidentAiResult(data.result) : null;
      if (!res.ok || !data?.success || !analyzedResult) {
        const message = data?.message || 'AI ขัดข้องชั่วคราว กรุณาลองวิเคราะห์อีกครั้งหรือระบุข้อมูลด้วยตนเอง';
        setAiError(message);
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'info',
          title: 'ยังวิเคราะห์ภาพไม่สำเร็จ',
          text: message,
          showConfirmButton: false,
          timer: 4500
        });
        return;
      }

      setAiResult(analyzedResult);
      setAiProvider(data.provider === 'groq' ? 'groq' : 'gemini');
      setFormData(prev => ({
        ...prev,
        ...createIncidentAiFormPatch(analyzedResult, prev.description)
      }));
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: data.fallbackUsed
          ? 'AI สำรองใส่คำแนะนำในแบบฟอร์มแล้ว โปรดตรวจสอบ'
          : 'AI ใส่คำแนะนำในแบบฟอร์มแล้ว โปรดตรวจสอบ',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (error) {
      console.error('AI request failed:', error);
      const message = 'เชื่อมต่อ AI ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง';
      setAiError(message);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'warning',
        title: 'เชื่อมต่อ AI ไม่สำเร็จ',
        text: message,
        showConfirmButton: false,
        timer: 4500
      });
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const originalFile = e.target.files[0];

      setFileError('');
      setAiError('');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(originalFile.type)) {
        setFileError('รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP');
        e.target.value = '';
        return;
      }
      if (originalFile.size > 10 * 1024 * 1024) {
        setFileError('ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
        e.target.value = '';
        return;
      }

      try {
        const compressedFile = await compressImage(originalFile, 1024, 0.8);
        setSelectedFile(compressedFile);
        setAiResult(null);
        setAiProvider(null);
        setAiError('');
      } catch (error) {
        console.error('File compression failed:', error);
        setSelectedFile(null);
        setFileError('ประมวลผลรูปไม่สำเร็จ กรุณาเลือกรูปใหม่');
        Swal.fire({ icon: 'error', title: 'ประมวลผลรูปไม่สำเร็จ', text: 'กรุณาลองเลือกรูปใหม่อีกครั้ง' });
      }
    }
  };

  const applyAiSuggestion = () => {
    if (!aiResult) return;
    setFormData(prev => ({
      ...prev,
      ...createIncidentAiFormPatch(aiResult, prev.description)
    }));
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'นำคำแนะนำมาใส่ในแบบฟอร์มแล้ว',
      showConfirmButton: false,
      timer: 2200
    });
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSubmitAttempted(true);

    if (invalidItems.length > 0) {
      const firstInvalid = document.getElementById(invalidItems[0].id);
      firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalid?.focus({ preventScroll: true });
      Swal.fire({
        icon: 'warning',
        title: `กรุณาตรวจสอบอีก ${invalidItems.length} รายการ`,
        text: invalidItems.map(item => item.label).join(' • ')
      });
      return;
    }

    if (!position || !selectedFile) {
      Swal.fire({ icon: 'error', title: 'ระบบยังไม่พร้อมรับข้อมูล', text: 'กรุณาลองใหม่ภายหลังหรือติดต่อเทศบาลตำบลบ่อหลวง' });
      return;
    }

    setIsSubmitting(true);

    try {
      const submission = new FormData();
      submission.set('village_name', formData.village_name);
      submission.set('risk_type', formData.risk_type);
      submission.set('severity_level', String(formData.severity_level));
      submission.set('description', formData.description);
      submission.set('reporter_name', formData.reporter_name || 'ไม่ระบุชื่อ');
      submission.set('reporter_role', formData.reporter_role);
      submission.set('latitude', String(position.lat));
      submission.set('longitude', String(position.lng));
      submission.set('image', selectedFile);

      const response = await fetch('/api/incidents', { method: 'POST', body: submission });
      const result = await response.json().catch(() => ({})) as { trackingToken?: string; error?: string };
      if (!response.ok || !result.trackingToken) throw new Error(result.error || 'ส่งข้อมูลไม่สำเร็จ');
      const trackingCode = result.trackingToken;

      // Keep the bearer token in the URL fragment so it never reaches server access logs or Referer headers.
      const statusUrl = `${window.location.origin}/status#token=${encodeURIComponent(trackingCode)}`;
      // Generate the QR locally: the bearer token must never be sent to a third-party QR service.
      const { default: QRCode } = await import('qrcode');
      const qrCodeImageUrl = await QRCode.toDataURL(statusUrl, { width: 200, margin: 1, errorCorrectionLevel: 'M' });

      localStorage.setItem('bl_latest_tracking_code', trackingCode);
      localStorage.setItem('bl_last_submit_time', Date.now().toString());
      setCooldownTime(60);

      Swal.fire({
        title: 'ส่งข้อมูลสำเร็จ!',
        html: `
          <div style="font-family: Arial, sans-serif; color: #1e293b; background: #ffffff; padding: 10px 0;">
            <div style="font-size: 13px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
              หมายเลขติดตามคำร้อง
            </div>
            <div style="background-color: #059669; padding: 15px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.3);">
              <div style="font-family: monospace; font-size: 14px; font-weight: 900; color: #ffffff; overflow-wrap: anywhere;">
                ${trackingCode}
              </div>
            </div>
            <div id="slip-original-html" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; text-align: center;">
              <div style="display: inline-block; background-color: #3b82f6; color: #ffffff; font-size: 13px; font-weight: bold; padding: 6px 16px; border-radius: 20px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);">
                ✅ ระบบบันทึกรูปนี้ลงเครื่องคุณแล้ว
              </div>
              <div style="background-color: #ffffff; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 10px; display: inline-block; margin-bottom: 15px;">
                <img src="${qrCodeImageUrl}" alt="QR Code" style="width: 160px; height: 160px; object-fit: contain; display: block;" />
              </div>
              <div style="font-size: 12px; color: #475569; line-height: 1.6; font-weight: 600;">
                นำรูปนี้ให้ <span style="color: #0284c7;">ผู้นำชุมชน</span> หรือ <span style="color: #0284c7;">อสม.</span><br/>
                สแกนเพื่อตรวจสอบสถานะแทนคุณได้ทันที
              </div>
            </div>
            <div id="slip-image-result"></div>
            <div style="margin-top: 15px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px dashed #e2e8f0; padding-top: 10px;">
              เทศบาลตำบลบ่อหลวง จ.เชียงใหม่
            </div>
          </div>
        `,
        showDenyButton: true,
        confirmButtonText: 'กลับหน้าหลัก',
        denyButtonText: 'แจ้งข้อมูลเพิ่ม',
        confirmButtonColor: '#2563eb', 
        denyButtonColor: '#10b981',    
        reverseButtons: true            
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = '/';
        } else {
          setFormData({ ...formData, description: '', reporter_name: '' });
          setPosition(null);
          setGpsAccuracy(null);
          setSelectedFile(null); 
          setPrivacyAcknowledged(false);
          setAiResult(null); 
          setAiProvider(null);
          setAiError('');
          setSubmitAttempted(false);
          setIsManualVillage(false);
        }
      });

      downloadSlipImage(trackingCode, qrCodeImageUrl);

    } catch (error: any) {
      console.error('Error:', error.message);
      Swal.fire({ icon: 'error', title: 'ส่งข้อมูลไม่สำเร็จ', text: error.message || 'ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง' });
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

  return (
    <div className="flex h-[100dvh] w-screen bg-slate-50 font-sans overflow-hidden relative">
      
      {/* 🗺️ แผนที่ Google ดาวเทียม */}
      <div className="z-0 bg-slate-900 absolute inset-0 md:relative md:flex-1 md:order-2 w-full h-full flex-shrink-0">
        <MapContainer center={[18.1633, 98.3744]} zoom={13} maxZoom={20} className="w-full h-full cursor-crosshair" ref={setMapRef}>
          <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} attribution="&copy; Google Maps" />
          {geoBlock && <GeoJSON data={geoBlock} style={{ color: '#fde047', weight: 2.5, fillOpacity: 0, dashArray: '5, 5' }} interactive={false} />}
          <LocationMarker />
        </MapContainer>
        
        {/* Floating Badge แนะนำให้ปักหมุด */}
        {!position && (
          <div className="absolute top-6 md:top-6 left-1/2 transform -translate-x-1/2 z-[400] pointer-events-none w-[90%] md:w-auto flex justify-center">
            <div className="bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full shadow-lg border border-slate-100 flex items-center space-x-2 animate-bounce">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span className="text-sm font-bold text-slate-700 tracking-wide">เลื่อนแผนที่เพื่อปักหมุด</span>
            </div>
          </div>
        )}
      </div>

      {/* 📝 ฟอร์มแจ้งข้อมูล (Mobile Bottom Sheet / Desktop Sidebar) */}
      <div 
        className={`
          z-[99999] flex flex-col flex-shrink-0 bg-white
          md:relative md:w-[460px] md:h-full md:rounded-none md:shadow-2xl md:translate-y-0 md:order-1
          absolute bottom-0 left-0 w-full h-[75vh] rounded-t-[2.5rem] shadow-[0_-15px_40px_rgba(0,0,0,0.12)]
          transition-transform duration-500 ease-in-out
          ${isExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-105px)]'}
        `}
      >
        
        {/* 👆 แถบ Drag Handle สำหรับย่อ-ขยายบนมือถือ */}
        <div 
           className="w-full flex flex-col items-center justify-center pt-3 pb-2 shrink-0 md:hidden cursor-pointer"
           onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="w-12 h-1.5 bg-slate-300 rounded-full mb-1"></div>
        </div>

        {/* 👑 Header Section */}
        <div 
           className={`px-6 pb-4 md:pt-4 flex items-center justify-between border-b border-slate-100 shrink-0 ${!isExpanded ? 'cursor-pointer' : 'md:cursor-default'}`}
           onClick={() => { if(!isExpanded) setIsExpanded(true); }}
        >
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
            <Link href="/" prefetch={false} className="p-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition shadow-sm bg-white" title="หน้าแรก" aria-label="กลับหน้าแรก">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </Link>
            <Link href="/status" prefetch={false} className="p-2 border border-slate-200 text-indigo-600 rounded-xl hover:bg-indigo-50 transition shadow-sm bg-white" title="ติดตามสถานะ" aria-label="ติดตามสถานะเรื่องที่แจ้ง">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </Link>
          </div>
        </div>

        {/* 📝 ส่วนเนื้อหาฟอร์มกรอกข้อมูล */}
        <form id="incident-report-form" onSubmit={handleSubmit} noValidate className="p-6 overflow-y-auto flex-1 scrollbar-hide space-y-6 pb-[155px]">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4" role="note">
            <p className="text-[13px] font-extrabold text-rose-800">กรณีมีผู้บาดเจ็บหรืออันตรายทันที</p>
            <p className="mt-1 text-[12px] leading-relaxed text-rose-700">โทร <a href="tel:1669" className="font-black underline underline-offset-2">1669</a> การแพทย์ฉุกเฉิน หรือ <a href="tel:191" className="font-black underline underline-offset-2">191</a> เหตุด่วน ก่อนกรอกแบบฟอร์มนี้</p>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="report-progress-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="report-progress-title" className="text-[13px] font-extrabold text-slate-800">ความพร้อมก่อนส่ง</h2>
                <p className="text-[11px] text-slate-500">กรอกให้ครบเพื่อช่วยให้เจ้าหน้าที่ตรวจสอบได้เร็วขึ้น</p>
              </div>
              <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-[12px] font-black text-indigo-700">{completedRequired}/5</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all" style={{ width: `${completedRequired * 20}%` }} />
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              {validationItems.map(item => (
                <li key={item.id} className={`flex items-center gap-1.5 ${item.valid ? 'font-bold text-emerald-700' : 'text-slate-500'}`}>
                  <span aria-hidden="true">{item.valid ? '✓' : '○'}</span>{item.label}
                </li>
              ))}
            </ul>
          </section>
          
          {/* 📍 1. Card ระบุตำแหน่ง (GPS) */}
          <div id="location-section" tabIndex={-1} className={`bg-indigo-50/50 border rounded-2xl p-5 shadow-sm relative overflow-hidden outline-none ${submitAttempted && !position ? 'border-rose-400 ring-2 ring-rose-100' : 'border-indigo-100'}`}>
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-200/30 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="flex items-start space-x-3 mb-4 relative z-10">
              <div className="p-2 bg-white rounded-xl shadow-sm border border-indigo-100 text-indigo-600">
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">ระบุตำแหน่งเกิดเหตุ</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">กรุณาอนุญาตเข้าถึง GPS หรือปักหมุดบนแผนที่</p>
                {position && <div className="mt-1 inline-block text-[10px] font-mono font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200">{position.lat.toFixed(5)}, {position.lng.toFixed(5)}{gpsAccuracy ? ` · ±${gpsAccuracy} ม.` : ''}</div>}
              </div>
            </div>
            <button type="button" onClick={handleGetLocation} disabled={isFetchingGPS} className="relative z-10 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center space-x-2">
              {isFetchingGPS ? (
                <><svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>กำลังค้นหาตำแหน่ง...</span></>
              ) : (
                <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg> <span>ใช้ตำแหน่งปัจจุบันของฉัน</span></>
              )}
            </button>
            <p className="relative z-10 mt-2 text-[10px] leading-relaxed text-indigo-700">ตรวจสอบหมุดบนแผนที่ก่อนส่ง พิกัดใช้เพื่อค้นหาจุดเกิดเหตุและประสานเจ้าหน้าที่เท่านั้น</p>
            {submitAttempted && !position && <p className="mt-2 text-[11px] font-bold text-rose-600" role="alert">กรุณาใช้ GPS หรือแตะบนแผนที่เพื่อปักหมุด</p>}
          </div>

          {/* Divider */}
          <div className="flex items-center justify-center space-x-4">
            <div className="h-px bg-slate-200 flex-1"></div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ข้อมูลการรายงาน</span>
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>

          {/* 📷 2. Upload Card (มี AI แบบ 2 ปุ่มแยกชัดเจน) */}
          <div id="image-section" tabIndex={-1} className="space-y-2 outline-none">
            <label className="text-[13px] font-bold text-slate-700 flex items-center">
              <svg className="w-4 h-4 mr-1.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              แนบรูปภาพประกอบ <span className="text-rose-500 ml-1">*</span>
            </label>
            
            <div className={`border-2 border-dashed bg-slate-50/50 rounded-2xl p-4 flex flex-col items-center justify-center relative min-h-[140px] ${submitAttempted && !selectedFile ? 'border-rose-400' : 'border-slate-300'}`}>
              {selectedFile ? (
                <div className="flex flex-col items-center relative w-full">
                  <button type="button" onClick={() => { setSelectedFile(null); setAiResult(null); setAiProvider(null); setAiError(''); setFileError(''); }} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-2 shadow-md hover:bg-rose-600 z-20 transition-colors" aria-label="นำรูปภาพออก">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  {imagePreviewUrl && <img src={imagePreviewUrl} alt="ภาพเหตุการณ์ที่เลือก" className="h-32 w-full rounded-xl object-cover" />}
                  <span className="text-[13px] font-bold text-emerald-600">แนบรูปภาพสำเร็จ</span>
                  <span className="text-[11px] text-slate-500 truncate max-w-[260px] mt-1">{selectedFile.name} · {(selectedFile.size / 1024).toFixed(0)} KB</span>
                </div>
              ) : (
                <div className="flex flex-col items-center w-full">
                  <div className="flex space-x-3 w-full">
                    {/* ปุ่มถ่ายรูปใหม่ (บังคับเปิดกล้อง) */}
                    <label className="flex-1 flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-300 cursor-pointer transition-all shadow-sm group">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-500 group-hover:bg-indigo-100 rounded-full flex items-center justify-center mb-2 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </div>
                      <span className="text-[12px] font-bold text-slate-700 group-hover:text-indigo-600">ถ่ายรูปใหม่</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={handleFileChange} className="sr-only" aria-label="ถ่ายรูปเหตุการณ์ด้วยกล้อง" />
                    </label>

                    {/* ปุ่มเลือกจากคลัง */}
                    <label className="flex-1 flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-all shadow-sm group">
                      <div className="w-10 h-10 bg-blue-50 text-blue-500 group-hover:bg-blue-100 rounded-full flex items-center justify-center mb-2 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                      <span className="text-[12px] font-bold text-slate-700 group-hover:text-blue-600">เลือกจากคลัง</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} className="sr-only" aria-label="เลือกรูปเหตุการณ์จากคลัง" />
                    </label>
                  </div>
                  
                  {/* 🤖 AI Highlight Banner (Pro Version) */}
                <div className="mt-4 w-full relative group rounded-xl p-[2px] bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 overflow-hidden shadow-lg shadow-purple-500/20">
        
                {/* ออร่าเรืองแสงด้านหลัง */}
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 opacity-40 group-hover:opacity-100 transition-opacity blur-md"></div>
    
                {/* กล่องสีขาวด้านใน */}
                <div className="relative bg-white/95 backdrop-blur-sm rounded-[10px] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center space-x-3">
        
                {/* ไอคอน AI ประกายแสง */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-50 to-purple-100 flex items-center justify-center border border-purple-200 shadow-inner">
                <svg className="w-5 h-5 text-purple-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                </div>
        
                <div className="text-left">
                <h4 className="text-[14px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 to-purple-600">
                AI ช่วยวิเคราะห์ภาพ (ไม่บังคับ)
          </h4>
          <p className="text-[11px] text-slate-500 font-bold mt-0.5">
            หลังเลือกภาพ ท่านเป็นผู้กดเริ่มวิเคราะห์เอง
          </p>
        </div>
      </div>
      
      {/* ไฟกระพริบสถานะ */}
      <div className="flex h-3 w-3 relative ml-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
      </div>
    </div>
  </div>
                </div>
              )}
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500">รองรับ JPG, PNG, WebP ไม่เกิน 10 MB กรุณาใช้ภาพชัดเจนและหลีกเลี่ยงใบหน้าหรือข้อมูลส่วนบุคคลที่ไม่จำเป็น</p>
            {fileError && <p className="text-[11px] font-bold text-rose-600" role="alert">{fileError}</p>}
            {submitAttempted && !selectedFile && !fileError && <p className="text-[11px] font-bold text-rose-600" role="alert">กรุณาถ่ายหรือเลือกรูปจุดเกิดเหตุ</p>}

            {selectedFile && !isAnalyzingAI && !aiResult && !aiError && (
              <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3.5">
                <p className="text-[12px] font-extrabold text-indigo-900">AI เป็นตัวเลือก ไม่จำเป็นต่อการส่งคำร้อง</p>
                <p className="mt-1 text-[10px] leading-relaxed text-indigo-800">เมื่อกดปุ่มด้านล่าง ภาพจะถูกส่งไปยัง Google Gemini และอาจใช้ Groq เป็นระบบสำรองเพื่อเสนอประเภทภัยและระดับความรุนแรง ท่านสามารถกรอกข้อมูลเองโดยไม่ส่งภาพให้ AI ได้</p>
                <button type="button" onClick={() => analyzeImageFile(selectedFile)} className="mt-3 w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-[12px] font-extrabold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                  วิเคราะห์ภาพด้วย AI (ไม่บังคับ)
                </button>
              </div>
            )}

            {/* AI Status */}
            {isAnalyzingAI && (
              <div className="mt-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center space-x-3">
                <svg className="animate-spin h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span className="text-[12px] font-bold text-indigo-700">AI กำลังวิเคราะห์รูปภาพ...</span>
              </div>
            )}
            {aiError && !isAnalyzingAI && selectedFile && (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5" role="alert">
                <p className="text-[12px] font-extrabold text-amber-900">AI ยังวิเคราะห์ไม่สำเร็จ</p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-800">{aiError}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={() => analyzeImageFile(selectedFile)} className="flex-1 rounded-xl bg-amber-600 px-3 py-2.5 text-[12px] font-extrabold text-white transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2">
                    ลองวิเคราะห์อีกครั้ง
                  </button>
                  <p className="flex-1 self-center text-[10px] leading-relaxed text-amber-700">ไม่ต้องรอ AI ก็กรอกประเภท ระดับ และรายละเอียดด้วยตนเองได้</p>
                </div>
              </div>
            )}
            {aiResult && !isAnalyzingAI && (
              <div className="mt-2 p-3.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl shadow-sm">
                <div className="flex items-center mb-2">
                  <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded flex items-center justify-center mr-2"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                  <span className="text-[12px] font-bold text-indigo-900">
                    {aiProvider === 'groq' ? 'วิเคราะห์โดย Groq AI (ระบบสำรอง)' : 'วิเคราะห์โดย Gemini AI'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-white px-2.5 py-1 rounded-lg border border-indigo-100 text-[11px] text-slate-600 shadow-sm">ภัย: <span className="font-bold text-indigo-700">{aiResult.type}</span></span>
                  <span className="bg-white px-2.5 py-1 rounded-lg border border-indigo-100 text-[11px] text-slate-600 shadow-sm">รุนแรง: <span className="font-bold text-rose-600">ระดับ {aiResult.severity}</span></span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-600">ระบบใส่ประเภทภัยและระดับลงในแบบฟอร์มแล้ว AI อาจคลาดเคลื่อน โปรดตรวจสอบและแก้ไขให้ตรงกับเหตุจริงก่อนส่ง</p>
                <button type="button" onClick={applyAiSuggestion} className="mt-3 w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-[12px] font-extrabold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                  ใช้คำแนะนำนี้อีกครั้ง
                </button>
              </div>
            )}
          </div>

          {/* 🏘️ 3. ข้อมูลพื้นฐาน */}
          <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div>
              <label className="text-[13px] font-bold text-slate-700 mb-1.5 block">พื้นที่หมู่บ้านที่พบปัญหา</label>
              <select id="village-name" name="village_name" value={formData.village_name} onChange={handleVillageChange} aria-invalid={submitAttempted && !formData.village_name} className={`w-full border bg-white rounded-xl p-3.5 text-[13px] text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${submitAttempted && !formData.village_name ? 'border-rose-400' : 'border-transparent'}`}>
                {villageList.length > 0 ? villageList.map((v: any) => <option key={v.name} value={v.name}>{v.name}</option>) : <option value="">กำลังโหลดข้อมูล...</option>}
              </select>
              {submitAttempted && !formData.village_name && <p className="mt-1 text-[11px] font-bold text-rose-600" role="alert">กรุณาเลือกหมู่บ้าน</p>}
            </div>

            <div>
              <label className="text-[13px] font-bold text-slate-700 mb-1.5 flex items-center">ประเภทสาธารณภัย <span className="text-rose-500 ml-1">*</span></label>
              <select name="risk_type" value={formData.risk_type} onChange={handleInputChange} className="w-full border-0 bg-white rounded-xl p-3.5 text-[13px] text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                {INCIDENT_RISK_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* 🌡️ 4. ระดับความรุนแรง */}
          <div>
            <label className="text-[13px] font-bold text-slate-700 mb-2 flex items-center">ระดับความรุนแรง <span className="text-rose-500 ml-1">*</span></label>
            <div className="grid grid-cols-5 gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200" role="group" aria-label="เลือกระดับความรุนแรง">
              {SEVERITY_OPTIONS.map(({ level, label }) => (
                <button type="button" key={level} onClick={() => setSeverity(level)} aria-pressed={formData.severity_level === level} title={`ระดับ ${level} ${label}`}
                  className={`flex min-h-12 flex-col items-center justify-center rounded-lg px-1 py-2 font-bold transition-all duration-200 ${formData.severity_level === level ? (level >= 4 ? 'bg-rose-500 text-white shadow-md scale-[1.03]' : level === 3 ? 'bg-amber-500 text-white shadow-md scale-[1.03]' : 'bg-emerald-500 text-white shadow-md scale-[1.03]') : 'bg-transparent text-slate-500 hover:bg-slate-200'}`}
                >
                  <span className="text-[14px]">{level}</span>
                  <span className="hidden text-[8px] leading-tight sm:block">{label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] font-semibold text-slate-600">ระดับ {formData.severity_level}: {SEVERITY_OPTIONS.find(item => item.level === formData.severity_level)?.label} — {SEVERITY_OPTIONS.find(item => item.level === formData.severity_level)?.help}</p>
          </div>

          {/* 📝 5. รายละเอียด */}
          <div>
            <label className="text-[13px] font-bold text-slate-700 mb-1.5 flex items-center">รายละเอียดเหตุการณ์ <span className="text-rose-500 ml-1">*</span></label>
            <textarea id="description" name="description" value={formData.description} onChange={handleInputChange} rows={4} maxLength={1000} aria-invalid={submitAttempted && descriptionLength < 10} aria-describedby="description-help description-count" placeholder="เช่น ก่อนถึงวัด 100 เมตร มีต้นไม้ล้มขวางถนน รถผ่านไม่ได้ ต้องการเจ้าหน้าที่ตัดต้นไม้" className={`w-full border bg-white rounded-xl p-3.5 text-[13px] text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all ${submitAttempted && descriptionLength < 10 ? 'border-rose-400' : 'border-slate-200'}`}></textarea>
            <div className="mt-1 flex items-start justify-between gap-3 text-[10px]">
              <p id="description-help" className="leading-relaxed text-slate-500">ระบุจุดสังเกต ผลกระทบ และความช่วยเหลือที่ต้องการ</p>
              <span id="description-count" className={`shrink-0 font-bold ${descriptionLength >= 10 ? 'text-emerald-600' : 'text-slate-400'}`}>{descriptionLength}/1000</span>
            </div>
            {submitAttempted && descriptionLength < 10 && <p className="mt-1 text-[11px] font-bold text-rose-600" role="alert">กรุณาระบุรายละเอียดอย่างน้อย 10 ตัวอักษร</p>}
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
          <p className="-mt-3 text-[10px] leading-relaxed text-slate-500">ไม่ระบุชื่อได้ ระบบจะบันทึกเป็น “ไม่ระบุชื่อ” และยังสามารถติดตามเรื่องด้วยรหัสที่ได้รับหลังส่ง</p>

          {/* ⚖️ Privacy notice acknowledgement */}
          <div id="privacy-notice" tabIndex={-1} className={`p-4 rounded-xl border outline-none transition-all duration-300 ${privacyAcknowledged ? 'bg-emerald-50 border-emerald-200 shadow-sm' : submitAttempted ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-100' : 'bg-slate-50 border-slate-200'}`}>
            <label className="flex items-start space-x-3 cursor-pointer group">
              <div className="flex items-center h-5 mt-0.5">
                <input type="checkbox" checked={privacyAcknowledged} onChange={(e) => setPrivacyAcknowledged(e.target.checked)} aria-invalid={submitAttempted && !privacyAcknowledged} className="w-5 h-5 text-emerald-500 bg-white border-slate-300 rounded focus:ring-emerald-500 cursor-pointer" />
              </div>
              <div className="flex flex-col">
                <span className={`text-[12px] font-bold transition-colors ${privacyAcknowledged ? 'text-emerald-800' : 'text-slate-700 group-hover:text-slate-900'}`}>รับทราบประกาศความเป็นส่วนตัว <span className="text-rose-500">*</span></span>
                <span className={`text-[10px] mt-1 leading-relaxed transition-colors ${privacyAcknowledged ? 'text-emerald-600' : 'text-slate-500'}`}>ข้าพเจ้าได้อ่านและรับทราบว่าเทศบาลจะใช้ข้อมูล รูปภาพ และพิกัดเพื่อรับเรื่อง ตรวจสอบ ประสานงาน และติดตามผลตามภารกิจสาธารณะ การทำเครื่องหมายนี้เป็นการยืนยันการรับทราบ ไม่ใช่การยินยอมแบบเหมารวม</span>
                <a href="/privacy" target="_blank" rel="noreferrer" className="mt-2 w-fit text-[10px] font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                  อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม (เปิดแท็บใหม่)
                </a>
              </div>
            </label>
            {submitAttempted && !privacyAcknowledged && <p className="mt-2 text-[11px] font-bold text-rose-600" role="alert">กรุณาอ่านประกาศความเป็นส่วนตัวและยืนยันการรับทราบก่อนส่ง</p>}
          </div>

        </form>
        
        {/* 🚀 Fixed Bottom Submit Button (ลอยติดอยู่ด้านล่างเสมอ z-[100000] ป้องกันโดนบัง) */}
        <div className={`absolute bottom-0 left-0 right-0 p-5 bg-white/95 backdrop-blur-xl border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-[100000] flex flex-col justify-center transition-all duration-300 ${isExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto'}`}>
          {!canSubmit && cooldownTime === 0 && !isSubmitting && (
            <p className="mb-2 text-center text-[11px] font-semibold text-slate-500" aria-live="polite">เหลือ {invalidItems.length} รายการก่อนส่ง</p>
          )}
          <button 
            type="submit"
            form="incident-report-form"
            disabled={isSubmitting || cooldownTime > 0}
            className={`w-full py-4 rounded-2xl font-black text-[15px] shadow-lg flex justify-center items-center space-x-2 transition-all duration-300 transform 
              ${(isSubmitting || cooldownTime > 0) 
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' 
                : canSubmit
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 active:scale-95'
                  : 'bg-amber-500 text-white shadow-amber-500/20 hover:bg-amber-600'}`}
          >
            {isSubmitting ? (
              <><svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>กำลังอัปโหลดข้อมูล...</span></>
            ) : cooldownTime > 0 ? (
              <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> <span>รอ {cooldownTime} วินาที</span></>
            ) : (
              <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg> <span>{canSubmit ? 'ยืนยันการส่งรายงาน' : 'ตรวจสอบข้อมูลก่อนส่ง'}</span></>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
