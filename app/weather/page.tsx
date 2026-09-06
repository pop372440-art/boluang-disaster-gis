'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, AreaChart, Area, Legend
} from 'recharts';

/* ================= 1. Leaflet แบบ Dynamic ================= */
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });

/* ================= 2. ค่าคงที่ & ตัวช่วย ================= */
const INITIAL_LAT = 18.1633;
const INITIAL_LNG = 98.3744;

/* จับคู่ layer กับ product ของ Windy ให้ถูกต้อง
   radar = ข้อมูลตรวจวัดจริง ห้ามบังคับ ecmwf / pm2p5 ต้องใช้ cams */
const WINDY_LAYERS = [
  { id: 'radar',    icon: '📡', label: 'เรดาร์ฝน',        product: 'radar' },
  { id: 'rain',     icon: '🌧️', label: 'ฝน',              product: 'ecmwf' },
  { id: 'wind',     icon: '💨', label: 'ลม',              product: 'ecmwf' },
  { id: 'temp',     icon: '🌡️', label: 'อุณหภูมิ',        product: 'ecmwf' },
  { id: 'clouds',   icon: '☁️', label: 'เมฆ',             product: 'ecmwf' },
  { id: 'pressure', icon: '⏲️', label: 'ความกดอากาศ',     product: 'ecmwf' },
  { id: 'thunder',  icon: '⚡', label: 'ฟ้าผ่า',          product: 'satellite' },
  { id: 'pm2p5',    icon: '😷', label: 'PM2.5 / มลพิษ',   product: 'cams' },
];

const getWmoWeatherDesc = (code: number) => {
  const codes: Record<number, string> = {
    0: 'แจ่มใส', 1: 'มีเมฆบางส่วน', 2: 'มีเมฆครึ้ม', 3: 'เมฆเป็นส่วนมาก', 45: 'มีหมอก', 48: 'หมอกหนา',
    51: 'ฝนปรอยๆ', 53: 'ฝนปรอยปานกลาง', 55: 'ฝนปรอยหนัก', 61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง',
    65: 'ฝนตกหนัก', 66: 'ฝนเยือกแข็ง', 80: 'ฝนเป็นหย่อมๆ', 81: 'ฝนซู่ปานกลาง', 82: 'ฝนซู่รุนแรง',
    95: 'พายุฝนฟ้าคะนอง', 96: 'ฟ้าคะนองมีลูกเห็บ', 99: 'ฟ้าคะนองรุนแรง',
  };
  return codes[code] ?? 'ปกติ';
};

const getWeatherEmoji = (code: number) => {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '☀️';
};

const getAqiStatus = (aqi: number) => {
  if (aqi <= 50) return { text: 'ดีมาก', color: '#10b981', bg: 'bg-emerald-500/20' };
  if (aqi <= 100) return { text: 'ปานกลาง', color: '#facc15', bg: 'bg-yellow-500/20' };
  if (aqi <= 150) return { text: 'เริ่มมีผลกระทบ', color: '#f97316', bg: 'bg-orange-500/20' };
  return { text: 'มีผลกระทบ', color: '#ef4444', bg: 'bg-red-500/20' };
};

const ALERT_STYLE: Record<string, { ring: string; bg: string; text: string; icon: string }> = {
  GREEN:  { ring: 'border-emerald-500/50', bg: 'bg-emerald-50',  text: 'text-emerald-700', icon: '✅' },
  YELLOW: { ring: 'border-yellow-500/60',  bg: 'bg-yellow-50',   text: 'text-yellow-700',  icon: '⚠️' },
  ORANGE: { ring: 'border-orange-500/60',  bg: 'bg-orange-50',   text: 'text-orange-700',  icon: '🟠' },
  RED:    { ring: 'border-red-500/70',     bg: 'bg-red-50',      text: 'text-red-700',     icon: '🚨' },
};

/* นาฬิกาแยกคอมโพเนนต์ กันทั้งหน้ารีเรนเดอร์ทุกวินาที */
function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="text-emerald-400 font-bold">{now ? now.toLocaleTimeString('th-TH') : '--:--:--'}</span>;
}

/* ================= 3. MAIN ================= */
export default function WeatherDashboard() {
  const [windyLayer, setWindyLayer] = useState('radar');
  const [windyZoom, setWindyZoom] = useState(9); // เห็นแม่สะเรียง–อมก๋อย–บ่อหลวงในจอเดียว
  const [searchQuery, setSearchQuery] = useState('');
  const [position, setPosition] = useState({ lat: INITIAL_LAT, lng: INITIAL_LNG });
  const [locationName, setLocationName] = useState('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [L, setL] = useState<any>(null);
  const [map, setMap] = useState<any>(null);
  const [radarOn, setRadarOn] = useState(true);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  const markerRef = useRef<any>(null);
  const radarLayerRef = useRef<any>(null);

  /* โหลด leaflet ครั้งเดียว */
  useEffect(() => { import('leaflet').then(mod => setL(mod.default ?? mod)); }, []);

  const pinIcon = useMemo(() => {
    if (!L) return undefined;
    return L.divIcon({
      className: 'bg-transparent border-none',
      html: `<div class="relative flex items-center justify-center w-8 h-8 group">
               <div class="absolute inset-0 bg-red-500 rounded-full blur-[6px] opacity-50"></div>
               <svg class="relative z-10 w-8 h-8 text-red-500 drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
               </svg>
             </div>`,
      iconSize: [32, 32], iconAnchor: [16, 32],
    });
  }, [L]);

  /* ---------- ดึงข้อมูลจริงจาก API route ---------- */
  const loadWeather = useCallback(async (lat: number, lng: number) => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'ดึงข้อมูลไม่สำเร็จ');
      setData(json);
      setFrameIdx(Math.max(0, (json.radar?.frames?.length ?? 1) - 1));
    } catch (e: any) {
      setErr(e.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, []);

  /* ยิงใหม่ทุกครั้งที่พิกัดเปลี่ยน + refresh อัตโนมัติทุก 5 นาที */
  useEffect(() => {
    const t = setTimeout(() => loadWeather(position.lat, position.lng), 350);
    return () => clearTimeout(t);
  }, [position.lat, position.lng, loadWeather]);

  useEffect(() => {
    const i = setInterval(() => loadWeather(position.lat, position.lng), 5 * 60 * 1000);
    return () => clearInterval(i);
  }, [position.lat, position.lng, loadWeather]);

  /* ---------- คลิกบนแผนที่เพื่อย้ายหมุด (บั๊กเดิม) ---------- */
  useEffect(() => {
    if (!map) return;
    const onClick = (e: any) => {
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
      fetchLocationName(e.latlng.lat, e.latlng.lng);
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [map]);

  /* ---------- ชั้นเรดาร์ RainViewer ซ้อนบน Leaflet ---------- */
  useEffect(() => {
    if (!map || !L || !data?.radar?.frames?.length) return;
    if (radarLayerRef.current) { map.removeLayer(radarLayerRef.current); radarLayerRef.current = null; }
    if (!radarOn) return;
    const frame = data.radar.frames[Math.min(frameIdx, data.radar.frames.length - 1)];
    const layer = L.tileLayer(frame.url, { opacity: 0.62, zIndex: 400, tileSize: 256 });
    layer.addTo(map);
    radarLayerRef.current = layer;
    return () => { if (radarLayerRef.current) { map.removeLayer(radarLayerRef.current); radarLayerRef.current = null; } };
  }, [map, L, data, frameIdx, radarOn]);

  /* เล่นภาพเรดาร์ย้อนหลังอัตโนมัติ */
  useEffect(() => {
    if (!playing || !radarOn || !data?.radar?.frames?.length) return;
    const i = setInterval(() => setFrameIdx(p => (p + 1) % data.radar.frames.length), 700);
    return () => clearInterval(i);
  }, [playing, radarOn, data]);

  /* ---------- Geocoding ---------- */
  const fetchLocationName = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=th`);
      const d = await res.json();
      if (d?.display_name) {
        const parts = d.display_name.split(',').slice(0, 3).reverse().map((s: string) => s.trim()).join(' • ');
        setLocationName(parts || d.display_name);
      }
    } catch { /* เงียบไว้ ไม่ให้ล้มทั้งหน้า */ }
  };

  const handleMarkerDragEnd = () => {
    const m = markerRef.current;
    if (!m) return;
    const ll = m.getLatLng();
    setPosition({ lat: ll.lat, lng: ll.lng });
    fetchLocationName(ll.lat, ll.lng);
  };

  const handleSearchSubmit = async (e: any) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    Swal.fire({ title: 'กำลังค้นหา...', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&accept-language=th`);
      const d = await res.json();
      if (d?.length) {
        const nLat = parseFloat(d[0].lat), nLng = parseFloat(d[0].lon);
        setPosition({ lat: nLat, lng: nLng });
        setLocationName(d[0].display_name.split(',').slice(0, 3).reverse().map((s: string) => s.trim()).join(' • '));
        map?.flyTo([nLat, nLng], 12, { duration: 1.5 });
        Swal.close();
      } else {
        Swal.fire({ icon: 'warning', title: 'ไม่พบสถานที่', text: 'กรุณาลองเปลี่ยนคำค้นหา', background: '#0f172a', color: '#fff' });
      }
    } catch {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', background: '#0f172a', color: '#fff' });
    }
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'เบราว์เซอร์ไม่รองรับ GPS', background: '#0f172a', color: '#fff' });
      return;
    }
    Swal.fire({ title: 'กำลังดึงพิกัด...', text: 'หากใช้คอมพิวเตอร์ พิกัดอาจอิงตามอินเทอร์เน็ตของท่าน', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nLat = pos.coords.latitude, nLng = pos.coords.longitude;
        setPosition({ lat: nLat, lng: nLng });
        fetchLocationName(nLat, nLng);
        map?.flyTo([nLat, nLng], 13, { duration: 1.5 });
        Swal.close();
      },
      () => Swal.fire({ icon: 'error', title: 'ไม่สามารถระบุตำแหน่งได้', background: '#0f172a', color: '#fff' }),
      { enableHighAccuracy: true }
    );
  };

  const handleResetToCenter = () => {
    setPosition({ lat: INITIAL_LAT, lng: INITIAL_LNG });
    setLocationName('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');
    map?.flyTo([INITIAL_LAT, INITIAL_LNG], 13, { duration: 1.5 });
  };

  /* ---------- Legend ครบทุกชั้น ---------- */
  const LEGENDS: Record<string, { title: string; stops: any[] }> = {
    pm2p5: { title: '😷 ระดับค่าฝุ่น PM2.5 / มลพิษ (µg/m³)', stops: [
      { label: 'ดีมาก', color: '#10b981', textColor: '#6ee7b7' }, { label: 'ดี', color: '#84cc16', textColor: '#bef264' },
      { label: 'ปานกลาง', color: '#facc15', textColor: '#fde047' }, { label: 'เริ่มมีผลกระทบ', color: '#f97316', textColor: '#fdba74' },
      { label: 'มีผลกระทบ', color: '#ef4444', textColor: '#fca5a5' }, { label: 'อันตราย', color: '#9f1239', textColor: '#fda4af' }] },
    rain: { title: '🌧️ ปริมาณฝนสะสม (มม.)', stops: [
      { label: 'ไม่มีฝน', color: '#0f172a', textColor: '#64748b' }, { label: 'ฝนละออง', color: '#bae6fd', textColor: '#94a3b8' },
      { label: 'เบาบาง', color: '#38bdf8', textColor: '#7dd3fc' }, { label: 'ปานกลาง', color: '#10b981', textColor: '#6ee7b7' },
      { label: 'ฝนหนัก', color: '#facc15', textColor: '#fde047' }, { label: 'พายุรุนแรง', color: '#ef4444', textColor: '#fca5a5' }] },
    radar: { title: '📡 เรดาร์ตรวจกลุ่มฝนแบบเรียลไทม์ (dBZ)', stops: [
      { label: 'กลุ่มฝนอ่อน', color: '#059669', textColor: '#6ee7b7' }, { label: 'ปานกลาง', color: '#facc15', textColor: '#fde047' },
      { label: 'ฝนหนัก', color: '#f97316', textColor: '#fdba74' }, { label: 'หนักมาก', color: '#ef4444', textColor: '#fca5a5' },
      { label: 'อันตราย', color: '#be123c', textColor: '#fda4af' }] },
    wind: { title: '💨 ความแรงลมและทิศทางลม (กม./ชม.)', stops: [
      { label: 'ลมอ่อน', color: '#1e3a8a', textColor: '#93c5fd' }, { label: 'เย็นสบาย', color: '#38bdf8', textColor: '#7dd3fc' },
      { label: 'ลมแรง', color: '#8b5cf6', textColor: '#c4b5fd' }, { label: 'พายุพัดแรง', color: '#ec4899', textColor: '#f9a8d4' },
      { label: 'พายุหมุนรุนแรง', color: '#ef4444', textColor: '#fca5a5' }] },
    temp: { title: '🌡️ อุณหภูมิและความร้อน (°C)', stops: [
      { label: 'หนาวจัด', color: '#1e3a8a', textColor: '#93c5fd' }, { label: 'เย็นสบาย', color: '#2dd4bf', textColor: '#99f6e4' },
      { label: 'อบอุ่น', color: '#10b981', textColor: '#6ee7b7' }, { label: 'ร้อน', color: '#facc15', textColor: '#fde047' },
      { label: 'ร้อนจัด', color: '#f97316', textColor: '#fdba74' }, { label: 'อันตราย', color: '#ef4444', textColor: '#fca5a5' }] },
    clouds: { title: '☁️ ปริมาณเมฆปกคลุม (%)', stops: [
      { label: 'ท้องฟ้าโปร่ง', color: '#0f172a', textColor: '#64748b' }, { label: 'เมฆบางส่วน', color: '#475569', textColor: '#94a3b8' },
      { label: 'เมฆกระจาย', color: '#94a3b8', textColor: '#cbd5e1' }, { label: 'เมฆมาก', color: '#e2e8f0', textColor: '#f1f5f9' },
      { label: 'ปกคลุมเต็ม', color: '#ffffff', textColor: '#ffffff' }] },
    pressure: { title: '⏲️ ความกดอากาศระดับน้ำทะเล (hPa)', stops: [
      { label: 'ต่ำมาก', color: '#7c3aed', textColor: '#c4b5fd' }, { label: 'ต่ำ', color: '#3b82f6', textColor: '#93c5fd' },
      { label: 'ปกติ', color: '#10b981', textColor: '#6ee7b7' }, { label: 'สูง', color: '#f59e0b', textColor: '#fcd34d' },
      { label: 'สูงมาก', color: '#dc2626', textColor: '#fca5a5' }] },
    thunder: { title: '⚡ โอกาสเกิดพายุฝนฟ้าคะนอง', stops: [
      { label: 'ไม่มี', color: '#0f172a', textColor: '#64748b' }, { label: 'ต่ำ', color: '#0891b2', textColor: '#67e8f9' },
      { label: 'ปานกลาง', color: '#facc15', textColor: '#fde047' }, { label: 'สูง', color: '#f97316', textColor: '#fdba74' },
      { label: 'รุนแรงมาก', color: '#dc2626', textColor: '#fca5a5' }] },
  };

  const renderWindyLegend = () => {
    const lg = LEGENDS[windyLayer];
    if (!lg) return null;
    return (
      <div className="bg-[#111827]/95 backdrop-blur-md border-t border-[#1e293b] p-3 md:p-4 shadow-[0_-5px_15px_rgba(0,0,0,0.3)] w-full flex flex-col flex-shrink-0 z-[1000] relative">
        <div className="text-gray-100 text-[12px] md:text-sm font-bold mb-3 flex justify-center items-center px-1">
          <span className="flex items-center tracking-wide">{lg.title}</span>
        </div>
        <div className="relative w-full h-3 md:h-4 rounded-full overflow-hidden shadow-inner flex border border-[#334155]/50">
          {lg.stops.map((s, i) => <div key={i} className="flex-1 h-full" style={{ backgroundColor: s.color }} />)}
        </div>
        <div className="flex w-full text-[10px] md:text-[11px] font-bold mt-2">
          {lg.stops.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center text-center px-0.5">
              <span style={{ color: s.textColor || '#94a3b8' }} className="leading-tight">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ---------- ค่าที่ใช้แสดงผล (มาจาก API ล้วน) ---------- */
  const cur = data?.current;
  const aqiStatus = getAqiStatus(data?.aqi?.us_aqi ?? 0);
  const alert = data?.alert;
  const nowcast = data?.nowcast;
  const st = ALERT_STYLE[alert?.level ?? 'GREEN'];
  const activeProduct = WINDY_LAYERS.find(l => l.id === windyLayer)?.product ?? 'ecmwf';
  const frames = data?.radar?.frames ?? [];
  const frameTime = frames[frameIdx]?.time
    ? new Date(frames[frameIdx].time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const Skeleton = ({ h = 'h-24' }: { h?: string }) => <div className={`${h} w-full bg-gray-200 animate-pulse rounded-2xl`} />;

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-gray-800 font-sans selection:bg-[#0ea5e9] selection:text-white pb-10 flex flex-col">

      {/* Header */}
      <header className="bg-[#0b132b] px-6 py-4 flex flex-col md:flex-row justify-between md:items-center border-b border-[#1e293b] space-y-4 md:space-y-0">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-[#38bdf8] to-[#0284c7] rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <div>
            <h1 className="text-[18px] md:text-[22px] font-extrabold text-[#60a5fa] leading-tight">ระบบตรวจสอบสภาพอากาศ</h1>
            <h2 className="text-[14px] md:text-[16px] font-bold text-white mt-1">Bo Luang Weather Center</h2>
            <p className="text-[12px] md:text-[13px] text-gray-400 mt-1">ตรวจสอบอุณหภูมิ ปริมาณฝน และการพยากรณ์อากาศในพื้นที่</p>
          </div>
        </div>
        <Link href="/" className="flex items-center justify-center space-x-2 bg-[#1e293b] hover:bg-[#334155] border border-gray-700 px-4 py-2.5 rounded-xl text-sm md:text-base font-bold text-white transition-all shadow-sm w-full md:w-auto">
          <span>⬅️</span> <span>กลับหน้าแผนที่หลัก</span>
        </Link>
      </header>

      <main className="p-4 md:p-6 w-full space-y-6 flex-1">

        {err && (
          <div className="bg-red-50 border border-red-300 rounded-2xl p-4 text-red-700 font-bold text-sm">
            ⚠️ {err} — ระบบจะพยายามดึงข้อมูลใหม่อัตโนมัติใน 5 นาที
          </div>
        )}

        {/* 🚨 แถบเตือนภัยจริงจาก API */}
        {loading && !data ? <Skeleton h="h-28" /> : alert && (
          <div className={`${st.bg} border ${st.ring} rounded-2xl p-5 md:p-6 shadow-md flex items-start space-x-4`}>
            <div className={`mt-1 text-2xl flex-shrink-0 ${alert.level === 'RED' ? 'animate-pulse' : ''}`}>{st.icon}</div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`${st.text} font-extrabold text-lg md:text-xl tracking-wide`}>{alert.title}</h3>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md text-white" style={{ backgroundColor: alert.color }}>
                  ระดับ {alert.level}
                </span>
              </div>
              <p className="text-gray-700 text-sm md:text-base font-medium mt-1.5 leading-relaxed">{alert.message}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[11px] md:text-xs font-mono font-bold text-gray-600">
                <span>สะสม 3 ชม.: {alert.sums.s3.toFixed(1)} มม.</span>
                <span>6 ชม.: {alert.sums.s6.toFixed(1)} มม.</span>
                <span>12 ชม.: {alert.sums.s12.toFixed(1)} มม.</span>
                <span>24 ชม.: {alert.sums.s24.toFixed(1)} มม.</span>
              </div>
            </div>
          </div>
        )}

        {/* ⏱️ Nowcast: อีกกี่นาทีฝนจะมา */}
        {nowcast && (
          <div className="bg-gradient-to-r from-[#0f172a] to-[#1e293b] rounded-2xl p-5 md:p-6 border border-[#334155] shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <span className="text-4xl">{nowcast.status === 'RAINING_NOW' ? '🌧️' : nowcast.status === 'INCOMING' ? '⏱️' : '🌤️'}</span>
              <div>
                <div className="text-[#38bdf8] font-extrabold text-sm tracking-widest">NOWCAST • เรดาร์ + ลมนำพา</div>
                <p className="text-white font-bold text-base md:text-lg mt-1 leading-snug">{nowcast.headline}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {nowcast.etaMinutes !== null && nowcast.etaMinutes > 0 && (
                <div className="text-center bg-white/10 rounded-2xl px-5 py-3 border border-white/10">
                  <div className="text-4xl font-extrabold text-yellow-300 leading-none">{nowcast.etaMinutes}</div>
                  <div className="text-[10px] text-gray-300 font-bold mt-1 tracking-widest">นาที</div>
                </div>
              )}
              {data?.steering && (
                <div className="text-gray-300 text-[11px] md:text-xs font-mono leading-relaxed">
                  <div>ลมนำพา {data.steering.level}</div>
                  <div className="text-[#38bdf8] font-bold">จากทิศ{data.steering.directionText}</div>
                  <div>{data.steering.speedKmh} กม./ชม.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 🛤️ ทางเดินพายุ */}
        {data?.corridor?.length > 0 && (
          <div className="bg-white rounded-2xl p-4 md:p-5 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 font-extrabold text-gray-800 text-sm md:text-base mb-3">
              <span>🛤️</span><span>จุดตรวจกลุ่มฝนต้นทาง (ทวนทิศลมนำพาออกไปจากพิกัด)</span>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {data.corridor.map((c: any, i: number) => {
                const wet = c.precipitation >= 0.3;
                return (
                  <div key={i} className={`flex-1 min-w-[110px] rounded-xl p-3 border text-center ${wet ? 'bg-sky-50 border-sky-300' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="text-[11px] font-bold text-gray-500">ระยะ {c.distanceKm} กม.</div>
                    <div className={`text-2xl font-extrabold mt-1 ${wet ? 'text-sky-600' : 'text-gray-400'}`}>{c.precipitation.toFixed(1)}</div>
                    <div className="text-[10px] text-gray-400 font-mono">มม./ชม.</div>
                    <div className={`text-[11px] font-bold mt-1 ${wet ? 'text-sky-700' : 'text-gray-400'}`}>{wet ? '🌧️ มีฝน' : 'แห้ง'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 🔍 ค้นหา */}
        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-end space-y-3 md:space-y-0 md:space-x-4">
          <div className="flex-1">
            <label className="block text-xs md:text-sm font-bold text-gray-600 mb-1.5 ml-1">ค้นหาพื้นที่ (ชื่อจังหวัด / อำเภอ / ตำบล / หมู่บ้าน)</label>
            <form onSubmit={handleSearchSubmit}>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="เช่น แม่แจ่ม, ฮอด, เชียงใหม่"
                className="w-full bg-gray-50 border border-gray-300 text-gray-800 text-sm md:text-base rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#0284c7] focus:border-transparent shadow-sm" />
            </form>
          </div>
          <div className="flex space-x-2 md:space-x-3 w-full md:w-auto">
            <button onClick={handleResetToCenter} className="flex-1 md:flex-none bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-3 rounded-xl font-bold text-sm md:text-base flex items-center justify-center space-x-2 transition-colors shadow-sm">
              <span>🏠</span><span className="whitespace-nowrap">กลับบ่อหลวง</span>
            </button>
            <button onClick={handleCurrentLocation} className="flex-1 md:flex-none bg-sky-100 hover:bg-sky-200 text-sky-800 px-5 py-3 rounded-xl font-bold text-sm md:text-base flex items-center justify-center space-x-2 transition-colors shadow-sm">
              <span>📍</span><span className="whitespace-nowrap">พิกัดปัจจุบัน</span>
            </button>
          </div>
        </div>

        {/* 🗺️ แผนที่ + เรดาร์ RainViewer */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-gray-50 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between border-b border-gray-200 gap-3">
            <div className="flex items-center space-x-2 text-gray-800 font-extrabold text-sm md:text-base">
              <span>🛰️</span><span>แผนที่ดาวเทียม + เรดาร์ฝน (คลิก / ลากหมุด เพื่อเลือกพิกัด)</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <button onClick={() => setRadarOn(v => !v)} className={`px-3 py-2 rounded-lg font-bold transition-colors ${radarOn ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                📡 เรดาร์ {radarOn ? 'เปิด' : 'ปิด'}
              </button>
              <button onClick={() => setPlaying(p => !p)} disabled={!radarOn} className="px-3 py-2 rounded-lg font-bold bg-gray-800 text-white disabled:opacity-40">
                {playing ? '⏸ หยุด' : '▶ เล่น'}
              </button>
              <span className="px-3 py-2 rounded-lg bg-white border border-gray-300 font-bold text-gray-700">🕒 {frameTime}</span>
              <a href={`https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`} target="_blank" rel="noopener noreferrer"
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-sm">
                Google Maps ↗
              </a>
            </div>
          </div>

          <div className="h-[350px] md:h-[500px] w-full relative z-0">
            <MapContainer center={[INITIAL_LAT, INITIAL_LNG]} zoom={13} maxZoom={20} zoomControl attributionControl={false}
              className="w-full h-full bg-gray-100" ref={setMap as any}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
              {pinIcon && (
                <Marker draggable position={[position.lat, position.lng]} icon={pinIcon} ref={markerRef}
                  eventHandlers={{ dragend: handleMarkerDragEnd }} />
              )}
            </MapContainer>
          </div>

          {frames.length > 0 && radarOn && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center gap-3">
              <input type="range" min={0} max={frames.length - 1} value={frameIdx}
                onChange={(e) => { setPlaying(false); setFrameIdx(Number(e.target.value)); }}
                className="w-full accent-[#0ea5e9]" />
              <span className={`text-[11px] font-bold whitespace-nowrap px-2 py-1 rounded ${frames[frameIdx]?.isForecast ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                {frames[frameIdx]?.isForecast ? 'พยากรณ์' : 'ย้อนหลัง'}
              </span>
            </div>
          )}

          <div className="bg-gray-50 px-5 py-3 text-[12px] md:text-[13px] text-gray-600 font-bold border-t border-gray-200">
            💡 คลิกที่แผนที่หรือลากหมุด 📍 เพื่อปักตำแหน่งใหม่ ระบบจะดึงข้อมูลสภาพอากาศของจุดนั้นให้อัตโนมัติ
          </div>
        </div>

        {/* 📍 แถบสถานะ */}
        <div className="bg-[#1e293b] rounded-2xl p-4 md:p-5 shadow-lg border border-[#334155] flex flex-col lg:flex-row items-center justify-between text-sm md:text-base">
          <div className="flex items-center space-x-3 text-gray-200 w-full lg:w-auto justify-center lg:justify-start">
            <span className="text-red-400 text-xl animate-pulse">📍</span>
            <span className="font-bold whitespace-nowrap hidden sm:inline">พื้นที่ตรวจสอบสภาพอากาศ:</span>
            <span className="text-white font-medium break-words leading-tight text-[13px] md:text-base">{locationName}</span>
          </div>
          <div className="flex items-center space-x-3 mt-3 lg:mt-0 text-gray-300 font-mono text-[11px] md:text-sm whitespace-nowrap">
            <span>พิกัด: <span className="text-[#38bdf8]">{position.lat.toFixed(4)}, {position.lng.toFixed(4)}</span></span>
            <span className="hidden md:inline">|</span>
            <span>{loading ? <span className="text-yellow-400 font-bold">กำลังอัปเดต…</span> : <>อัปเดต: <LiveClock /></>}</span>
          </div>
        </div>

        {/* 🍱 Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">

          <div className="col-span-1 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 md:p-8 rounded-3xl border border-[#334155] shadow-lg relative overflow-hidden flex flex-col justify-center items-center text-center group hover:border-[#38bdf8]/50 transition-colors min-h-[220px]">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#38bdf8] rounded-full blur-[60px] opacity-20" />
            {cur ? (
              <>
                <span className="text-7xl drop-shadow-lg mb-3 group-hover:scale-110 transition-transform">{getWeatherEmoji(cur.weather_code)}</span>
                <div className="text-6xl font-extrabold text-white mb-2">{cur.temperature_2m?.toFixed(1)}°<span className="text-3xl text-gray-400">C</span></div>
                <p className="text-[#38bdf8] font-bold text-xl">{getWmoWeatherDesc(cur.weather_code)}</p>
                <p className="text-gray-400 text-xs mt-2 font-mono">รู้สึกเหมือน {cur.apparent_temperature?.toFixed(1)}°C</p>
              </>
            ) : <div className="text-gray-500 animate-pulse">กำลังโหลด…</div>}
          </div>

          <div className="col-span-1 bg-white p-6 md:p-7 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[160px]">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-2 text-gray-500 font-extrabold text-sm tracking-widest"><span>🌫️</span><span>AIR QUALITY</span></div>
              <div className={`px-2.5 py-1 rounded-md text-xs font-bold ${aqiStatus.bg}`} style={{ color: aqiStatus.color }}>{aqiStatus.text}</div>
            </div>
            <div className="flex items-end justify-between mt-auto">
              <div>
                <div className="text-5xl font-extrabold" style={{ color: aqiStatus.color }}>{data?.aqi?.us_aqi ?? '--'}</div>
                <div className="text-xs text-gray-400 mt-1 font-mono">US AQI Standard</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800">{data?.aqi?.pm2_5 ?? '--'} <span className="text-sm text-gray-500">µg/m³</span></div>
                <div className="text-xs text-gray-400 mt-1">PM 2.5</div>
              </div>
            </div>
          </div>

          <div className="col-span-1 bg-white p-6 md:p-7 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-center space-y-6 min-h-[160px]">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center"><span className="text-blue-500 text-xl">💨</span></div>
              <div>
                <div className="text-xs md:text-sm text-gray-500 font-bold">ความเร็วลม {cur ? `(จากทิศ${cur.wind_direction_text})` : ''}</div>
                <div className="text-2xl font-extrabold text-gray-800">{cur ? (cur.wind_speed_10m / 3.6).toFixed(1) : '--'} <span className="text-xs font-normal text-gray-500">ม./วินาที</span></div>
              </div>
            </div>
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center"><span className="text-cyan-500 text-xl">💧</span></div>
              <div>
                <div className="text-xs md:text-sm text-gray-500 font-bold">ความชื้นสัมพัทธ์</div>
                <div className="text-2xl font-extrabold text-gray-800">{cur?.relative_humidity_2m ?? '--'}<span className="text-xs font-normal text-gray-500">%</span></div>
              </div>
            </div>
          </div>

          <div className="col-span-1 bg-white p-6 md:p-7 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-center space-y-6 min-h-[160px]">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center"><span className="text-indigo-500 text-xl">🌧️</span></div>
              <div>
                <div className="text-xs md:text-sm text-gray-500 font-bold">ปริมาณฝน (วันนี้)</div>
                <div className="text-2xl font-extrabold text-gray-800">{cur?.rain_today ?? '--'} <span className="text-xs font-normal text-gray-500">มม.</span></div>
              </div>
            </div>
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center"><span className="text-purple-500 text-xl">☀️</span></div>
              <div>
                <div className="text-xs md:text-sm text-gray-500 font-bold">UV Index (สูงสุด)</div>
                <div className="text-2xl font-extrabold text-gray-800">{cur?.uv_max ?? '--'} <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded ml-1">Index</span></div>
              </div>
            </div>
          </div>

          {/* กราฟฝนรายชั่วโมง 24 ชม. */}
          <div className="col-span-1 md:col-span-4 bg-white p-5 md:p-7 rounded-3xl border border-gray-200 shadow-sm h-[320px] md:h-[360px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-xl mr-2">⏳</span>
              <h3 className="text-gray-800 text-base md:text-lg font-extrabold">ฝนรายชั่วโมง 24 ชั่วโมงข้างหน้า (มม. / โอกาสเกิดฝน %)</h3>
            </div>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.hourly ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cRain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="hour" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} interval={2} />
                  <YAxis yAxisId="l" stroke="#0ea5e9" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="r" orientation="right" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, borderColor: '#0ea5e9' }} />
                  <Legend />
                  <Area yAxisId="l" type="monotone" name="ปริมาณฝน (มม.)" dataKey="rain" stroke="#0ea5e9" strokeWidth={3} fill="url(#cRain)" />
                  <Area yAxisId="r" type="monotone" name="โอกาสเกิดฝน (%)" dataKey="prob" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* อุณหภูมิ 7 วัน */}
          <div className="col-span-1 md:col-span-2 bg-white p-5 md:p-7 rounded-3xl border border-gray-200 shadow-sm h-[350px] md:h-[400px] flex flex-col">
            <div className="flex items-center mb-4"><span className="text-xl mr-2">📈</span>
              <h3 className="text-gray-800 text-base md:text-lg font-extrabold">พยากรณ์อุณหภูมิ 7 วันล่วงหน้า (°C)</h3></div>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.forecast ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f87171" stopOpacity={0.3} /><stop offset="95%" stopColor="#f87171" stopOpacity={0} /></linearGradient>
                    <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} /><stop offset="95%" stopColor="#38bdf8" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, borderColor: '#cbd5e1' }} />
                  <Area type="monotone" name="อุณหภูมิสูงสุด" dataKey="maxTemp" stroke="#f87171" strokeWidth={3} fill="url(#colorMax)" />
                  <Area type="monotone" name="อุณหภูมิต่ำสุด" dataKey="minTemp" stroke="#38bdf8" strokeWidth={3} fill="url(#colorMin)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ฝน 7 วัน */}
          <div className="col-span-1 md:col-span-2 bg-white p-5 md:p-7 rounded-3xl border border-gray-200 shadow-sm h-[350px] md:h-[400px] flex flex-col">
            <div className="flex items-center mb-4"><span className="text-xl mr-2">🌧️</span>
              <h3 className="text-gray-800 text-base md:text-lg font-extrabold">พยากรณ์ปริมาณน้ำฝน 7 วัน (มม.)</h3></div>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.forecast ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 12, borderColor: '#0ea5e9' }} />
                  <Bar name="ปริมาณฝนสะสม" dataKey="rain" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Windy */}
          <div className="col-span-1 md:col-span-4 bg-white p-3 md:p-6 rounded-3xl border border-gray-200 shadow-md flex flex-col mt-4 h-[600px] md:h-[850px] relative overflow-hidden">
            <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-white z-10 w-full shrink-0">
              <div className="flex items-center space-x-3 w-full md:w-auto mb-4 md:mb-0">
                <span className="text-2xl md:text-3xl">🛰️</span>
                <div className="flex flex-col">
                  <span className="text-[#0f4a8a] font-extrabold text-[18px] md:text-[20px] leading-tight">แผนที่อากาศเรียลไทม์ (Windy)</span>
                  <span className="text-gray-500 font-medium text-[11px] md:text-sm mt-0.5 truncate max-w-[250px] md:max-w-none">เรดาร์ฝน ลม เมฆ • {locationName}</span>
                </div>
              </div>
              <div className="flex items-center space-x-2 md:space-x-3 w-full md:w-auto">
                <button onClick={handleCurrentLocation} className="flex-1 md:flex-none justify-center bg-[#0f172a] text-white px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-bold shadow-sm flex items-center hover:bg-gray-800 transition">
                  <span className="mr-1.5 text-red-500">📍</span> ตำแหน่งของฉัน
                </button>
                <div className="flex flex-1 md:flex-none justify-between md:justify-center items-center space-x-2 bg-gray-100 rounded-xl px-2 md:px-3 py-1.5 border border-gray-200">
                  <button onClick={() => setWindyZoom(z => Math.max(3, z - 1))} className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white text-[#0ea5e9] hover:bg-sky-50 flex items-center justify-center font-bold shadow-sm">-</button>
                  <span className="text-xs md:text-sm font-mono text-gray-700 font-bold px-1 md:px-2">z{windyZoom}</span>
                  <button onClick={() => setWindyZoom(z => Math.min(15, z + 1))} className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white text-[#0ea5e9] hover:bg-sky-50 flex items-center justify-center font-bold shadow-sm">+</button>
                </div>
              </div>
            </div>

            <div className="flex space-x-2.5 py-4 overflow-x-auto scrollbar-hide w-full px-5 md:px-6 bg-white z-10 shrink-0">
              {WINDY_LAYERS.map((layer) => (
                <button key={layer.id} onClick={() => setWindyLayer(layer.id)}
                  className={`flex items-center space-x-1.5 md:space-x-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-[11px] md:text-sm font-bold whitespace-nowrap transition-all duration-300 flex-shrink-0 border
                    ${windyLayer === layer.id ? 'bg-[#0f4a8a] text-white border-[#0f4a8a] shadow-md md:scale-105' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 shadow-sm'}`}>
                  <span className="text-sm md:text-base">{layer.icon}</span><span>{layer.label}</span>
                </button>
              ))}
            </div>

            <div className="w-full flex-1 relative z-0 flex flex-col bg-slate-100">
              <div className="w-full flex-1 relative z-0">
                <iframe width="100%" height="100%" frameBorder="0" allow="geolocation"
                  src={`https://embed.windy.com/embed2.html?lat=${position.lat}&lon=${position.lng}&detailLat=${position.lat}&detailLon=${position.lng}&zoom=${windyZoom}&level=surface&overlay=${windyLayer}&product=${activeProduct}&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1&lang=th`}
                  className="absolute inset-0 w-full h-full border-none" title="Windy Map" loading="lazy" />
              </div>
              {renderWindyLegend()}
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between py-3 px-5 md:px-6 text-[10px] md:text-xs text-gray-500 font-bold bg-white shrink-0">
              <div className="flex items-center mb-3 md:mb-0"><span className="mr-1.5 text-orange-500">💡</span> เลื่อนแถบเวลาด้านล่างแผนที่เพื่อดูพยากรณ์อากาศล่วงหน้า</div>
              <a href={`https://www.windy.com/?${position.lat},${position.lng},${windyZoom}`} target="_blank" rel="noopener noreferrer"
                className="w-full md:w-auto text-[#0ea5e9] hover:text-[#0284c7] font-bold flex items-center justify-center bg-sky-50 px-4 py-2 rounded-xl border border-sky-200">
                เปิดหน้าจอเต็มในแอป Windy ↗
              </a>
            </div>
          </div>

        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
