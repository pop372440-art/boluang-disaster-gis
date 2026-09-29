'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';
import {
  CURRENT_LOCATION_ZOOM,
  geolocationFailureCopy,
  shouldRetryGeolocation,
} from '@/lib/weather/geolocation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, AreaChart, Area, Legend
} from 'recharts';

/* ================= 1. Leaflet แบบ Dynamic ================= */
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });

/* ================= 2. ค่าคงที่ ================= */
const INITIAL_LAT = 18.1633;
const INITIAL_LNG = 98.3744;

/* ⭐ แก้ไขการตั้งค่าเรดาร์เพื่อป้องกัน Zoom Level Not Supported และ 429 Too Many Requests */
const RADAR_MAX_NATIVE_ZOOM = 8;     // ลดระดับ Native ลง เพื่อหลีกเลี่ยงการขอภาพลึกเกินไป
const RADAR_KEEP_FRAMES = 6;         // ลดจำนวนเฟรมที่โหลดพร้อมกัน (เพื่อลดภาระเซิร์ฟเวอร์)
const RADAR_OPACITY = 0.62;
const DEFAULT_MAP_ZOOM = 11;
const TRANSPARENT_TILE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/* จับคู่ layer กับ product ของ Windy ให้ถูกคู่ */
const WINDY_LAYERS = [
  { id: 'radar',    icon: '📡', label: 'เรดาร์ฝน',     product: 'radar' },
  { id: 'rain',     icon: '🌧️', label: 'ฝน',            product: 'ecmwf' },
  { id: 'wind',     icon: '💨', label: 'ลม',            product: 'ecmwf' },
  { id: 'temp',     icon: '🌡️', label: 'อุณหภูมิ',      product: 'ecmwf' },
  { id: 'clouds',   icon: '☁️', label: 'เมฆ',           product: 'ecmwf' },
  { id: 'pressure', icon: '⏲️', label: 'ความกดอากาศ',   product: 'ecmwf' },
  { id: 'thunder',  icon: '⚡', label: 'ฟ้าผ่า',        product: 'satellite' },
  { id: 'pm2p5',    icon: '😷', label: 'PM2.5 / มลพิษ', product: 'cams' },
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

const getAqiStatus = (aqi: number | null | undefined) => {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi)) return { text: 'ไม่มีข้อมูล', color: '#64748b', bg: 'bg-slate-100' };
  if (aqi <= 50) return { text: 'ดีมาก', color: '#10b981', bg: 'bg-emerald-500/20' };
  if (aqi <= 100) return { text: 'ปานกลาง', color: '#facc15', bg: 'bg-yellow-500/20' };
  if (aqi <= 150) return { text: 'เริ่มมีผลกระทบ', color: '#f97316', bg: 'bg-orange-500/20' };
  return { text: 'มีผลกระทบ', color: '#ef4444', bg: 'bg-red-500/20' };
};

const ALERT_STYLE: Record<string, { ring: string; bg: string; text: string; icon: string }> = {
  GREEN:  { ring: 'border-emerald-500/50', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: '✅' },
  YELLOW: { ring: 'border-yellow-500/60',  bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: '⚠️' },
  ORANGE: { ring: 'border-orange-500/60',  bg: 'bg-orange-50',  text: 'text-orange-700',  icon: '🟠' },
  RED:    { ring: 'border-red-500/70',     bg: 'bg-red-50',     text: 'text-red-700',     icon: '🚨' },
};

/* บอกอายุข้อมูลตามจริง แทนนาฬิกาเดินทุกวินาทีที่ชวนเข้าใจผิดว่าสดตลอด */
function DataAge({ iso }: { iso?: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(v => v + 1), 30000); return () => clearInterval(t); }, []);
  if (!iso) return <span className="text-gray-400">--</span>;
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return <span className="text-gray-400">ไม่มีข้อมูล</span>;
  const mins = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  const label = mins === 0 ? 'เมื่อสักครู่' : `${mins} นาทีที่แล้ว`;
  const time = new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return <span className={mins > 15 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>{time} น. ({label})</span>;
}

function SourceBadge({ label, tone = 'slate' }: { label: string; tone?: 'slate' | 'sky' | 'amber' | 'emerald' }) {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700'
  };
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${tones[tone]}`}>{label}</span>;
}

function freshnessLabel(status?: string) {
  if (status === 'fresh') return { text: 'ข้อมูลล่าสุด', tone: 'emerald' as const };
  if (status === 'stale') return { text: 'ข้อมูลเก่า', tone: 'amber' as const };
  if (status === 'expired') return { text: 'ข้อมูลหมดอายุ', tone: 'amber' as const };
  return { text: 'ไม่ทราบอายุข้อมูล', tone: 'slate' as const };
}

const nwpFreshnessLabel = (status?: string) => status === 'fresh' ? 'สดตามเกณฑ์' : status === 'stale' ? 'เริ่มเก่า' : status === 'expired' ? 'หมดอายุ' : 'ไม่ทราบอายุ';

/* ================= 3. MAIN ================= */
export default function WeatherDashboard() {
  const [windyLayer, setWindyLayer] = useState('radar');
  const [searchQuery, setSearchQuery] = useState('');
  const [position, setPosition] = useState({ lat: INITIAL_LAT, lng: INITIAL_LNG });
  const [locationName, setLocationName] = useState('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');

  const [data, setData] = useState<any>(null);
  const [nwp, setNwp] = useState<any>(null);
  const [nwpView, setNwpView] = useState<'overview' | 'ecmwf' | 'gfs'>('overview');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [L, setL] = useState<any>(null);
  const [map, setMap] = useState<any>(null);
  const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);
  const [radarOn, setRadarOn] = useState(true);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [isLocating, setIsLocating] = useState(false);

  const markerRef = useRef<any>(null);
  const radarLayersRef = useRef<any[]>([]);

  useEffect(() => { import('leaflet').then(mod => setL(mod.default ?? mod)); }, []);

  const pinIcon = useMemo(() => {
    if (!L) return undefined;
    return L.divIcon({
      className: 'bg-transparent border-none',
      html: `<div class="relative flex items-center justify-center w-8 h-8">
               <div class="absolute inset-0 bg-red-500 rounded-full blur-[6px] opacity-50"></div>
               <svg class="relative z-10 w-8 h-8 text-red-500 drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
               </svg>
             </div>`,
      iconSize: [32, 32], iconAnchor: [16, 32],
    });
  }, [L]);

  /* ---------- Geocoding ผ่าน API ภายใน (ปิดช่องโหว่ Nominatim) ---------- */
  const fetchLocationName = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/geocode?mode=reverse&lat=${lat}&lng=${lng}`);
      const d = await res.json();
      if (d?.name) setLocationName(d.name);
    } catch { /* เงียบไว้ ไม่ให้ล้มทั้งหน้า */ }
  }, []);

  /* ---------- ดึงข้อมูลจริง ---------- */
  const loadWeather = useCallback(async (lat: number, lng: number) => {
    setLoading(true); setErr(null);
    try {
      const [weatherResult, nwpResult] = await Promise.allSettled([
        fetch(`/api/weather?lat=${lat}&lng=${lng}`, { cache: 'no-store' }).then(async (response) => {
          const json = await response.json();
          if (!response.ok || !json.ok) throw new Error(json.error || 'ดึงข้อมูลไม่สำเร็จ');
          return json;
        }),
        fetch('/api/weather/nwp', { cache: 'no-store' }).then(async (response) => {
          const json = await response.json();
          if (!response.ok || !json.ok) throw new Error(json.error || 'NWP ไม่พร้อม');
          return json;
        }),
      ]);
      if (weatherResult.status === 'rejected') throw weatherResult.reason;
      setData(weatherResult.value);
      setNwp(nwpResult.status === 'fulfilled' ? nwpResult.value : null);
    } catch (e: any) {
      setErr(e.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadWeather(position.lat, position.lng), 350);
    return () => clearTimeout(t);
  }, [position.lat, position.lng, loadWeather]);

  useEffect(() => {
    const i = setInterval(() => loadWeather(position.lat, position.lng), 5 * 60 * 1000);
    return () => clearInterval(i);
  }, [position.lat, position.lng, loadWeather]);

  /* ---------- คลิกแผนที่ย้ายหมุด + ติดตามระดับซูม ---------- */
  useEffect(() => {
    if (!map) return;
    const onClick = (e: any) => {
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
      fetchLocationName(e.latlng.lat, e.latlng.lng);
    };
    const onZoom = () => setMapZoom(map.getZoom());
    onZoom();
    map.on('click', onClick);
    map.on('zoomend', onZoom);
    return () => { map.off('click', onClick); map.off('zoomend', onZoom); };
  }, [map, fetchLocationName]);

  /* ---------- เฟรมเรดาร์ที่จะแสดงจริง ---------- */
  const shownFrames = useMemo(() => {
    const status = data?.radar?.freshness?.status;
    if (status === 'expired' || status === 'unknown') return [];
    const all = data?.radar?.frames ?? [];
    return all.slice(-RADAR_KEEP_FRAMES);
  }, [data]);

  /* ⭐ สร้างเลเยอร์เรดาร์ทุกเฟรมล่วงหน้า ตั้ง opacity 0 แล้วสลับแสดง */
  useEffect(() => {
    if (!map || !L) return;
    radarLayersRef.current.forEach((l) => { try { map.removeLayer(l); } catch {} });
    radarLayersRef.current = [];
    if (!radarOn || shownFrames.length === 0) return;

    radarLayersRef.current = shownFrames.map((f: any) =>
      L.tileLayer(f.url, {
        opacity: 0,
        zIndex: 400,
        tileSize: 256,
        maxNativeZoom: RADAR_MAX_NATIVE_ZOOM, // ⭐ กันการขอภาพเรดาร์ลึกเกินไป
        maxZoom: 20,                          // ยอมให้ขยายภาพเก่าต่อได้
        minZoom: 3,
        errorTileUrl: TRANSPARENT_TILE,
        crossOrigin: true,
        updateWhenIdle: false,
        keepBuffer: 2,
      }).addTo(map)
    );
    setFrameIdx(shownFrames.length - 1);

    return () => {
      radarLayersRef.current.forEach((l) => { try { map.removeLayer(l); } catch {} });
      radarLayersRef.current = [];
    };
  }, [map, L, shownFrames, radarOn]);

  /* สลับเฟรมด้วย opacity — ไม่กระพริบ ไม่โหลดไทล์ซ้ำ */
  useEffect(() => {
    radarLayersRef.current.forEach((l, i) => l.setOpacity(i === frameIdx ? RADAR_OPACITY : 0));
  }, [frameIdx, shownFrames]);

  useEffect(() => {
    if (!playing || !radarOn || shownFrames.length === 0) return;
    // ⭐ ปรับความเร็วการเล่นเฟรมให้ช้าลง เพื่อหลีกเลี่ยงภาระเซิร์ฟเวอร์
    const i = setInterval(() => setFrameIdx(p => (p + 1) % shownFrames.length), 1000);
    return () => clearInterval(i);
  }, [playing, radarOn, shownFrames]);

/* ═══════════ 🔔 ระบบแจ้งเตือนด้วย SweetAlert ═══════════ */
const alertMemoRef = useRef<{ sig: string; at: number } | null>(null);
const [muted, setMuted] = useState(false);

/* เสียงเตือนสังเคราะห์ ไม่ต้องพึ่งไฟล์เสียงภายนอก */
const beep = useCallback((times = 2) => {
  if (muted) return;
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = 880;
      const t0 = ctx.currentTime + i * 0.45;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.start(t0); o.stop(t0 + 0.4);
    }
  } catch {}
  try { navigator.vibrate?.([220, 120, 220]); } catch {}
}, [muted]);

useEffect(() => {
  if (!data?.alert || !data?.nowcast) return;

  const a = data.alert;
  const nc = data.nowcast;

  /* ลายเซ็นเหตุการณ์ — กันเด้งซ้ำเรื่องเดิม */
  const sig = `${a.level}|${nc.status}|${nc.etaMinutes ?? '-'}`;
  const prev = alertMemoRef.current;
  const COOLDOWN = a.level === 'RED' ? 10 * 60e3 : 30 * 60e3;
  if (prev && prev.sig === sig && Date.now() - prev.at < COOLDOWN) return;

  const worthPopup =
    a.level === 'RED' || a.level === 'ORANGE' ||
    nc.status === 'RAINING_NOW' ||
    (nc.status === 'INCOMING' && nc.etaMinutes !== null && nc.etaMinutes <= 90);
  if (!worthPopup) { alertMemoRef.current = { sig, at: Date.now() }; return; }

  alertMemoRef.current = { sig, at: Date.now() };

  const isCritical = a.level === 'RED' || a.level === 'ORANGE';
  if (isCritical || nc.status === 'RAINING_NOW') beep(a.level === 'RED' ? 4 : 2);

  const rows = (data.corridor ?? [])
    .filter((c: any) => c.wet)
    .slice(0, 4)
    .map((c: any) =>
      `<tr>
         <td style="padding:4px 10px;text-align:left">${c.distanceKm} กม.</td>
         <td style="padding:4px 10px;color:#38bdf8;font-weight:700">${c.mmh} มม./ชม.</td>
         <td style="padding:4px 10px;color:#fbbf24">${c.etaMin !== null ? `~${c.etaMin} นาที` : '—'}</td>
       </tr>`).join('');

  const html = `
    <div style="text-align:left;font-size:14px;line-height:1.75;color:#e2e8f0">
      <div style="background:${a.color}22;border-left:4px solid ${a.color};
                  padding:10px 14px;border-radius:8px;margin-bottom:14px">
        <b style="color:${a.color};font-size:15px">${nc.headline}</b>
      </div>

      <div style="margin-bottom:12px">${a.message}</div>

      ${data.motion ? `
      <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">
        🧭 กลุ่มฝนเคลื่อนที่จากทิศ<b style="color:#38bdf8">${data.motion.comingFrom}</b>
        ด้วยความเร็ว <b style="color:#38bdf8">${data.motion.speedKmh} กม./ชม.</b>
        (ความเชื่อมั่น ${data.motion.confidence})
        ${data.motion.stationary
          ? '<br/><span style="color:#f87171">⚠️ กลุ่มฝนเกือบนิ่ง เสี่ยงฝนตกซ้ำที่เดิมและน้ำป่าไหลหลาก</span>' : ''}
      </div>` : ''}

      ${rows ? `
      <table style="width:100%;border-collapse:collapse;font-size:12px;
                    background:#0b1220;border-radius:8px;overflow:hidden">
        <tr style="color:#94a3b8;background:#111c2e">
          <th style="padding:6px 10px;text-align:left">ระยะต้นทาง</th>
          <th style="padding:6px 10px;text-align:left">ความแรง</th>
          <th style="padding:6px 10px;text-align:left">คาดถึงพื้นที่</th>
        </tr>${rows}
      </table>` : ''}

      <div style="margin-top:14px;font-size:12px;color:#94a3b8">
        📊 ฝนสะสมคาดการณ์ &nbsp;3 ชม. <b>${a.sums.s3.toFixed(1)}</b> •
        6 ชม. <b>${a.sums.s6.toFixed(1)}</b> •
        12 ชม. <b>${a.sums.s12.toFixed(1)}</b> มม.
      </div>
      <div style="margin-top:6px;font-size:11px;color:#64748b">
        📍 ${locationName}<br/>
        🕒 ข้อมูล ณ ${new Date(data.updatedAt).toLocaleString('th-TH')}
        ${data.radarOk ? '• ✅ อ่านค่าเรดาร์จริงสำเร็จ' : '• ⚠️ ไม่มีข้อมูลเรดาร์'}
        ${data.stale ? '<br/>⚠️ ข้อมูลย้อนหลัง ระบบภายนอกไม่ตอบสนอง' : ''}
      </div>
      <div style="margin-top:10px;font-size:10px;color:#475569;line-height:1.5">
        ⚖️ ประมวลผลอัตโนมัติเพื่อประกอบการตัดสินใจเบื้องต้น
        มิใช่ประกาศเตือนภัยอย่างเป็นทางการ
      </div>
    </div>`;

  Swal.fire({
    title: `${a.level === 'RED' ? '🚨' : a.level === 'ORANGE' ? '🟠'
            : nc.status === 'RAINING_NOW' ? '🌧️' : '⚠️'}  ${a.title}`,
    html,
    background: '#0f172a',
    color: '#f1f5f9',
    width: 620,
    padding: '1.5rem',
    showCloseButton: true,
    allowOutsideClick: !isCritical,        // ระดับวิกฤตต้องกดรับทราบเท่านั้น
    confirmButtonText: isCritical ? 'รับทราบและดำเนินการ' : 'รับทราบ',
    confirmButtonColor: a.color,
    showDenyButton: isCritical,
    denyButtonText: '📋 คัดลอกข้อความแจ้งเตือน',
    denyButtonColor: '#334155',
    timer: isCritical ? undefined : 15000,
    timerProgressBar: !isCritical,
    didOpen: (el) => {
      if (a.level === 'RED') {
        el.style.boxShadow = `0 0 0 4px ${a.color}55`;
        el.animate(
          [{ boxShadow: `0 0 0 4px ${a.color}22` },
           { boxShadow: `0 0 0 14px ${a.color}00` }],
          { duration: 1400, iterations: Infinity }
        );
      }
    },
  }).then((r) => {
    if (r.isDenied) {
      const txt =
        `[แจ้งเตือนสภาพอากาศ • ทต.บ่อหลวง]\n` +
        `ระดับ: ${a.title} (${a.level})\n` +
        `${nc.headline}\n${a.message}\n` +
        `พื้นที่: ${locationName}\n` +
        `เวลา: ${new Date(data.updatedAt).toLocaleString('th-TH')}\n` +
        `— ประมวลผลอัตโนมัติ มิใช่ประกาศเตือนภัยอย่างเป็นทางการ`;
      navigator.clipboard?.writeText(txt);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success',
        title: 'คัดลอกแล้ว พร้อมวางลงกลุ่มไลน์', showConfirmButton: false,
        timer: 2200, background: '#0f172a', color: '#fff' });
    }
  });
}, [data, locationName, beep]);
  

  /* ---------- Events ---------- */
  const handleMarkerDragEnd = () => {
    const m = markerRef.current;
    if (!m) return;
    const ll = m.getLatLng();
    setPosition({ lat: ll.lat, lng: ll.lng });
    fetchLocationName(ll.lat, ll.lng);
  };

  const handleSearchSubmit = async (e: any) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q.length < 2) return;
    Swal.fire({ title: 'กำลังค้นหา...', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });
    try {
      const res = await fetch(`/api/geocode?mode=search&q=${encodeURIComponent(q)}&limit=5`);
      const d = await res.json();
      if (!d.ok || !d.results?.length) {
        Swal.fire({ icon: 'warning', title: 'ไม่พบสถานที่', text: d.error ?? 'กรุณาลองเปลี่ยนคำค้นหา', background: '#0f172a', color: '#fff' });
        return;
      }
      let target = d.results[0];
      if (d.results.length > 1) {
        const options: Record<string, string> = {};
        d.results.forEach((r: any, i: number) => { options[String(i)] = r.name || r.displayName; });
        const { value, isConfirmed } = await Swal.fire({
          title: 'พบหลายสถานที่', input: 'select', inputOptions: options, inputValue: '0',
          showCancelButton: true, confirmButtonText: 'เลือกจุดนี้', cancelButtonText: 'ยกเลิก',
          background: '#0f172a', color: '#fff', confirmButtonColor: '#0ea5e9',
        });
        if (!isConfirmed) return;
        target = d.results[Number(value)];
      }
      setPosition({ lat: target.lat, lng: target.lng });
      setLocationName(target.name || target.displayName);
      map?.flyTo([target.lat, target.lng], DEFAULT_MAP_ZOOM, { duration: 1.5 });
      Swal.close();
    } catch {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อระบบค้นหาได้', background: '#0f172a', color: '#fff' });
    }
  };

  const handleCurrentLocation = async () => {
    if (isLocating) return;

    if (!navigator.geolocation) {
      Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'เบราว์เซอร์ไม่รองรับ GPS', background: '#0f172a', color: '#fff' });
      return;
    }

    if (!window.isSecureContext) {
      const copy = geolocationFailureCopy({}, false);
      Swal.fire({ icon: 'error', ...copy, background: '#0f172a', color: '#fff' });
      return;
    }

    const getPosition = (options: PositionOptions) => new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

    setIsLocating(true);
    Swal.fire({ title: 'กำลังดึงพิกัด...', text: 'หากใช้คอมพิวเตอร์ พิกัดอาจอิงตามอินเทอร์เน็ตของท่าน', allowOutsideClick: false, background: '#0f172a', color: '#fff', didOpen: () => Swal.showLoading() });

    try {
      let pos: GeolocationPosition;
      try {
        pos = await getPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
      } catch (error) {
        const geoError = error as GeolocationPositionError;
        if (!shouldRetryGeolocation(geoError)) throw geoError;

        Swal.update({
          title: 'กำลังลองค้นหาตำแหน่งแบบสำรอง...',
          text: 'ใช้ตำแหน่งจากเครือข่ายเมื่อสัญญาณ GPS ไม่พร้อม',
        });
        pos = await getPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
      }

      const nLat = pos.coords.latitude;
      const nLng = pos.coords.longitude;
      setPosition({ lat: nLat, lng: nLng });
      fetchLocationName(nLat, nLng);
      map?.flyTo([nLat, nLng], CURRENT_LOCATION_ZOOM, { duration: 1.5 });
      Swal.close();
    } catch (error) {
      const copy = geolocationFailureCopy(error as GeolocationPositionError);
      Swal.fire({ icon: 'warning', ...copy, confirmButtonText: 'เข้าใจแล้ว', background: '#0f172a', color: '#fff' });
    } finally {
      setIsLocating(false);
    }
  };

  const handleResetToCenter = () => {
    setPosition({ lat: INITIAL_LAT, lng: INITIAL_LNG });
    setLocationName('ตำบลบ่อหลวง • อำเภอฮอด • จังหวัดเชียงใหม่');
    map?.flyTo([INITIAL_LAT, INITIAL_LNG], DEFAULT_MAP_ZOOM, { duration: 1.5 });
  };

  /* ---------- ค่าที่ใช้แสดงผล ---------- */
  const cur = data?.current;
  const aqiStatus = getAqiStatus(data?.aqi?.us_aqi);
  const alert = data?.alert;
  const nowcast = data?.nowcast;
  const st = ALERT_STYLE[alert?.level ?? 'GREEN'];
  const radarFreshness = data?.radar?.freshness;
  const radarFreshnessBadge = freshnessLabel(radarFreshness?.status);
  const weatherFreshnessBadge = freshnessLabel(data?.sources?.weather?.freshness?.status);
  const airFreshnessBadge = freshnessLabel(data?.sources?.air?.freshness?.status);
  const modelConfidence = data?.modelComparison?.confidence === 'high'
    ? 'สูง'
    : data?.modelComparison?.confidence === 'medium'
      ? 'ปานกลาง'
      : 'ต่ำ';
  const activeFrame = shownFrames[Math.min(frameIdx, Math.max(0, shownFrames.length - 1))];
  const frameTime = activeFrame?.time
    ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const radarDegraded = radarOn && mapZoom > RADAR_MAX_NATIVE_ZOOM;
  const nwpModels = Object.fromEntries((nwp?.models ?? []).map((model: any) => [model.id, model]));
  const nwpChart = (nwp?.hourly ?? []).map((item: any) => ({
    ...item,
    label: new Intl.DateTimeFormat('th-TH', { weekday: 'short', hour: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(item.time)),
  }));
  const nwpAgreementTone = nwp?.consensus?.agreement === 'high' ? 'emerald' : nwp?.consensus?.agreement === 'medium' ? 'sky' : 'amber';

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
          <span>⬅️</span><span>กลับหน้าแผนที่หลัก</span>
        </Link>
      </header>

      <main className="p-4 md:p-6 w-full space-y-6 flex-1">

        {err && (
          <div className="bg-red-50 border border-red-300 rounded-2xl p-4 text-red-700 font-bold text-sm">
            ⚠️ {err} — ระบบจะพยายามดึงข้อมูลใหม่อัตโนมัติใน 5 นาที
          </div>
        )}

        {data?.sources && (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-label="สถานะแหล่งข้อมูล">
            <div className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-slate-800">สภาพอากาศและพยากรณ์</p>
                <SourceBadge label={weatherFreshnessBadge.text} tone={weatherFreshnessBadge.tone} />
              </div>
              <p className="mt-2 text-xs text-slate-600">แบบจำลอง • {data.sources.weather.provider}</p>
              <p className="mt-1 text-[10px] text-slate-500">เวลาแหล่งข้อมูล: <DataAge iso={data.sources.weather.freshness?.observedAt} /></p>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-slate-800">PM2.5 และ AQI</p>
                <SourceBadge label={airFreshnessBadge.text} tone={airFreshnessBadge.tone} />
              </div>
              <p className="mt-2 text-xs text-slate-600">แบบจำลองคุณภาพอากาศ • {data.sources.air.provider}</p>
              <p className="mt-1 text-[10px] text-slate-500">เวลาแหล่งข้อมูล: <DataAge iso={data.sources.air.freshness?.observedAt} /></p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-slate-800">เรดาร์ตรวจกลุ่มฝน</p>
                <SourceBadge label={radarFreshnessBadge.text} tone={radarFreshnessBadge.tone} />
              </div>
              <p className="mt-2 text-xs text-slate-600">ภาพเรดาร์ • {data.sources.radar.provider}</p>
              <p className="mt-1 text-[10px] text-slate-500">ไม่มีสถานีวัดฝนของเทศบาลที่เชื่อมต่อและยืนยันแล้ว</p>
            </div>
          </section>
        )}

        {/* 🚨 แถบเตือนภัย */}
        {loading && !data ? <Skeleton h="h-28" /> : alert && (
          <div className={`${st.bg} border ${st.ring} rounded-2xl p-5 md:p-6 shadow-md flex items-start space-x-4`}>
            <div className={`mt-1 text-2xl flex-shrink-0 ${alert.level === 'RED' ? 'animate-pulse' : ''}`}>{st.icon}</div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`${st.text} font-extrabold text-lg md:text-xl tracking-wide`}>{alert.title}</h3>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md text-white" style={{ backgroundColor: alert.color }}>ระดับ {alert.level}</span>
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

        {/* ⏱️ Nowcast */}
        {nowcast && (
          <div className="bg-gradient-to-r from-[#0f172a] to-[#1e293b] rounded-2xl p-5 md:p-6 border border-[#334155] shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <span className="text-4xl">{nowcast.status === 'RAINING_NOW' ? '🌧️' : nowcast.status === 'INCOMING' ? '⏱️' : nowcast.status === 'UNAVAILABLE' ? '⚠️' : '🌤️'}</span>
              <div>
                <div className="text-[#38bdf8] font-extrabold text-sm tracking-widest">NOWCAST • ภาพเรดาร์ล่าสุด</div>
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
            <button onClick={handleResetToCenter} className="flex-1 md:flex-none bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-3 rounded-xl font-bold text-sm md:text-base flex items-center justify-center space-x-2 shadow-sm">
              <span>🏠</span><span className="whitespace-nowrap">กลับบ่อหลวง</span>
            </button>
            <button type="button" onClick={handleCurrentLocation} disabled={isLocating} aria-busy={isLocating}
              className="flex-1 md:flex-none bg-sky-100 hover:bg-sky-200 text-sky-800 px-5 py-3 rounded-xl font-bold text-sm md:text-base flex items-center justify-center space-x-2 shadow-sm disabled:cursor-wait disabled:opacity-60">
              <span>{isLocating ? '⏳' : '📍'}</span><span className="whitespace-nowrap">{isLocating ? 'กำลังระบุ...' : 'พิกัดปัจจุบัน'}</span>
            </button>
          </div>
        </div>

        {/* 🗺️ แผนที่ + เรดาร์ */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-gray-50 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between border-b border-gray-200 gap-3">
            <div className="flex items-center space-x-2 text-gray-800 font-extrabold text-sm md:text-base">
              <span>🛰️</span><span>แผนที่ดาวเทียม + เรดาร์ฝน (คลิก / ลากหมุด เพื่อเลือกพิกัด)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <SourceBadge label={radarFreshnessBadge.text} tone={radarFreshnessBadge.tone} />
              <button onClick={() => setRadarOn(v => !v)} className={`px-3 py-2 rounded-lg font-bold ${radarOn ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                📡 เรดาร์ {radarOn ? 'เปิด' : 'ปิด'}
              </button>
              <button onClick={() => setPlaying(p => !p)} disabled={!radarOn} className="px-3 py-2 rounded-lg font-bold bg-gray-800 text-white disabled:opacity-40">
                {playing ? '⏸ หยุด' : '▶ เล่น'}
              </button>
              <span className="px-3 py-2 rounded-lg bg-white border border-gray-300 font-bold text-gray-700">🕒 {frameTime}</span>
              {radarDegraded && (
                <span className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-700 font-bold">
                  ⚠️ ภาพเรดาร์ขยายจาก z{RADAR_MAX_NATIVE_ZOOM}
                </span>
              )}
              <a href={`https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`} target="_blank" rel="noopener noreferrer"
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-4 py-2 rounded-lg font-bold shadow-sm">Google Maps ↗</a>
            </div>
          </div>

          <div className="h-[350px] md:h-[500px] w-full relative z-0">
            <MapContainer center={[INITIAL_LAT, INITIAL_LNG]} zoom={DEFAULT_MAP_ZOOM} maxZoom={20} zoomControl attributionControl={false}
              className="w-full h-full bg-gray-100" ref={setMap as any}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} maxNativeZoom={19} />
              {pinIcon && (
                <Marker draggable position={[position.lat, position.lng]} icon={pinIcon} ref={markerRef}
                  eventHandlers={{ dragend: handleMarkerDragEnd }} />
              )}
            </MapContainer>
          </div>

          {(radarFreshness?.status === 'expired' || radarFreshness?.status === 'unknown') && (
            <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs font-bold text-amber-800" role="status">
              ⚠️ ระงับชั้นเรดาร์ เนื่องจากข้อมูลหมดอายุหรือไม่สามารถยืนยันเวลาอัปเดตได้ โดยระบบจะไม่ตีความเป็น “ไม่มีฝน”
            </div>
          )}

          {radarOn && shownFrames.length > 1 && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center gap-3">
              <input type="range" min={0} max={shownFrames.length - 1} value={Math.min(frameIdx, shownFrames.length - 1)}
                onChange={(e) => { setPlaying(false); setFrameIdx(Number(e.target.value)); }}
                className="w-full accent-[#0ea5e9]" />
              <span className={`text-[11px] font-bold whitespace-nowrap px-2 py-1 rounded ${activeFrame?.isForecast ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                {activeFrame?.isForecast ? 'พยากรณ์' : 'ย้อนหลัง'}
              </span>
            </div>
          )}

          <div className="bg-gray-50 px-5 py-3 text-[12px] md:text-[13px] text-gray-600 font-bold border-t border-gray-200">
            💡 คลิกที่แผนที่หรือลากหมุด 📍 เพื่อปักตำแหน่งใหม่ ระบบจะดึงข้อมูลสภาพอากาศของจุดนั้นให้อัตโนมัติ
            {radarDegraded && <span className="text-amber-700"> • ภาพเรดาร์มีความละเอียดสูงสุดที่ระดับซูม {RADAR_MAX_NATIVE_ZOOM} การซูมลึกกว่านี้เป็นการขยายภาพเดิม</span>}
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
            <span>{loading ? <span className="text-yellow-400 font-bold">กำลังอัปเดต…</span> : <>ข้อมูล ณ <DataAge iso={data?.updatedAt} /></>}</span>
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
                <div className="mt-3"><SourceBadge label="แบบจำลอง • Open-Meteo" tone="sky" /></div>
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
            <div className="mt-4"><SourceBadge label="แบบจำลอง CAMS • ไม่ใช่สถานีตรวจวัด" tone="slate" /></div>
          </div>

          <div className="col-span-1 bg-white p-6 md:p-7 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-center space-y-6 min-h-[160px]">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center"><span className="text-blue-500 text-xl">💨</span></div>
              <div>
                <div className="text-xs md:text-sm text-gray-500 font-bold">ความเร็วลม (จากทิศ{cur?.wind_direction_text ?? 'ไม่มีข้อมูล'})</div>
                <div className="text-2xl font-extrabold text-gray-800">{Number.isFinite(cur?.wind_speed_10m) ? (cur.wind_speed_10m / 3.6).toFixed(1) : '--'} <span className="text-xs font-normal text-gray-500">ม./วินาที</span></div>
              </div>
            </div>
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center"><span className="text-cyan-500 text-xl">💧</span></div>
              <div>
                <div className="text-xs md:text-sm text-gray-500 font-bold">ความชื้นสัมพัทธ์</div>
                <div className="text-2xl font-extrabold text-gray-800">{cur?.relative_humidity_2m ?? '--'}<span className="text-xs font-normal text-gray-500">%</span></div>
              </div>
            </div>
            <SourceBadge label="แบบจำลอง • Open-Meteo" tone="sky" />
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
            <SourceBadge label="แบบจำลอง • Open-Meteo" tone="sky" />
          </div>

          {/* ฝนรายชั่วโมง */}
          <div className="col-span-1 md:col-span-4 bg-white p-5 md:p-7 rounded-3xl border border-gray-200 shadow-sm h-[320px] md:h-[360px] flex flex-col">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center"><span className="text-xl mr-2">⏳</span><h3 className="text-gray-800 text-base md:text-lg font-extrabold">ฝนรายชั่วโมง 24 ชั่วโมงข้างหน้า (มม. / โอกาสเกิดฝน %)</h3></div>
              <SourceBadge label="แบบจำลองหลายแหล่ง • กรณีฝนสูงสุด" tone="sky" />
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

          <section id="nwp" className="col-span-1 md:col-span-4 overflow-hidden rounded-3xl border border-sky-200 bg-white shadow-sm" aria-labelledby="nwp-heading">
            <div className="border-b border-sky-100 bg-gradient-to-r from-[#071f3a] to-[#0f4a8a] p-5 text-white md:p-7">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <p className="text-xs font-black tracking-[.16em] text-sky-200">NUMERICAL WEATHER PREDICTION</p>
                  <h3 id="nwp-heading" className="mt-1 text-xl font-black md:text-2xl">เปรียบเทียบแบบจำลองฝน 24–72 ชั่วโมง</h3>
                  <p className="mt-2 max-w-3xl text-xs leading-relaxed text-sky-100 md:text-sm">ECMWF และ GFS จากรอบรันเดียวกัน ใช้ดูแนวโน้มพื้นที่ ไม่ใช่เรดาร์ สถานีตรวจวัด หรือค่าฝนรายหมู่บ้าน</p>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกแบบจำลองที่แสดง">
                  {([['overview', 'ภาพรวม'], ['ecmwf', 'ECMWF'], ['gfs', 'GFS']] as const).map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={nwpView === value} onClick={() => setNwpView(value)} className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-bold ${nwpView === value ? 'border-white bg-white text-[#0f4a8a]' : 'border-white/30 bg-white/10 text-white hover:bg-white/20'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">รอบรัน: {nwp?.runAt ? new Date(nwp.runAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }) : 'ไม่พร้อม'}</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{nwp?.consensus?.label ?? 'เปรียบเทียบไม่ได้'}</span>
                <span className="rounded-full border border-amber-300/50 bg-amber-300/10 px-3 py-1.5 text-amber-100">ไม่สร้างคำเตือนอัตโนมัติ</span>
              </div>
            </div>

            {!nwp ? (
              <div className="m-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800" role="status">ผล ECMWF/GFS ยังไม่ครบ ระบบระงับการเปรียบเทียบและไม่ตีความว่าไม่มีฝน</div>
            ) : (
              <div className="space-y-5 p-5 md:p-7">
                <div className="grid gap-3 md:grid-cols-3">
                  {[0, 1, 2].map((index) => {
                    const left = nwpModels.ecmwf?.windows?.[index];
                    const right = nwpModels.gfs?.windows?.[index];
                    return <article key={left?.key ?? index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-extrabold text-slate-500">ช่วง {left?.label ?? '—'}</p>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div><p className="text-[10px] font-bold text-sky-700">ECMWF</p><p className="text-2xl font-black text-[#0f4a8a]">{left?.totalMm?.toFixed(1) ?? '—'} <span className="text-xs">มม.</span></p></div>
                        <div><p className="text-[10px] font-bold text-emerald-700">GFS</p><p className="text-2xl font-black text-emerald-700">{right?.totalMm?.toFixed(1) ?? '—'} <span className="text-xs">มม.</span></p></div>
                      </div>
                    </article>;
                  })}
                </div>

                <div className="h-[300px] w-full" role="img" aria-label="กราฟเปรียบเทียบฝนรายชั่วโมงจาก ECMWF และ GFS ใน 72 ชั่วโมงข้างหน้า">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={nwpChart} margin={{ top: 10, right: 10, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={10} interval={11} />
                      <YAxis stroke="#64748b" fontSize={11} width={56} tickFormatter={(value: number) => value.toFixed(1)} unit=" มม." />
                      <RechartsTooltip labelFormatter={(_, rows) => rows?.[0]?.payload?.time ? new Date(rows[0].payload.time).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : ''} contentStyle={{ borderRadius: 12 }} />
                      {(nwpView === 'overview' || nwpView === 'ecmwf') && <Area type="monotone" name="ECMWF (มม.)" dataKey="ecmwfMm" stroke="#0369a1" fill="#38bdf833" strokeWidth={3} connectNulls={false} />}
                      {(nwpView === 'overview' || nwpView === 'gfs') && <Area type="monotone" name="GFS (มม.)" dataKey="gfsMm" stroke="#059669" fill="#34d39922" strokeWidth={3} connectNulls={false} />}
                      <Legend />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2"><SourceBadge label={nwp.consensus.label} tone={nwpAgreementTone} /><span className="text-xs text-slate-500">ความสอดคล้องไม่ใช่การรับรองความแม่นยำ</span></div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">{nwp.consensus.summary}</p>
                    <p className="mt-2 text-[10px] text-slate-500">ECMWF: {nwpFreshnessLabel(nwpModels.ecmwf?.freshness)} ({nwpModels.ecmwf?.ageHours ?? '—'} ชม.) · GFS: {nwpFreshnessLabel(nwpModels.gfs?.freshness)} ({nwpModels.gfs?.ageHours ?? '—'} ชม.)</p>
                    <p className="mt-1 text-[10px] text-slate-500">กริด ECMWF {nwpModels.ecmwf?.gridLatitude?.toFixed(3)}, {nwpModels.ecmwf?.gridLongitude?.toFixed(3)} · GFS {nwpModels.gfs?.gridLatitude?.toFixed(3)}, {nwpModels.gfs?.gridLongitude?.toFixed(3)} · ดึงข้อมูล {new Date(nwp.generatedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href="https://www.windy.com/?rain,18.163,98.374,9" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-extrabold text-sky-800">ตรวจแผนที่ Windy ↗</a>
                    <a href="https://www.tropicaltidbits.com/analysis/models/" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-extrabold text-slate-700">ตรวจ Tropical Tidbits ↗</a>
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="col-span-1 md:col-span-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">ความสอดคล้องของแบบจำลองฝน 3 ชั่วโมง</h3>
                <p className="mt-1 text-xs text-slate-600">
                  เปรียบเทียบ {data?.modelComparison?.modelCount ?? 0} แบบจำลอง • ช่วงคาดการณ์ {data?.modelComparison?.minMm ?? '--'}–{data?.modelComparison?.maxMm ?? '--'} มม. • ค่ากระจาย {data?.modelComparison?.spreadMm ?? '--'} มม.
                </p>
              </div>
              <SourceBadge label={`ความเชื่อมั่น ${modelConfidence}`} tone={data?.modelComparison?.confidence === 'high' ? 'emerald' : data?.modelComparison?.confidence === 'medium' ? 'sky' : 'amber'} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">ความเชื่อมั่นนี้สะท้อนความสอดคล้องระหว่างแบบจำลอง ไม่ใช่การรับรองความแม่นยำระดับจุดหรือหมู่บ้าน</p>
          </div>

          {/* อุณหภูมิ 7 วัน */}
          <div className="col-span-1 md:col-span-2 bg-white p-5 md:p-7 rounded-3xl border border-gray-200 shadow-sm h-[350px] md:h-[400px] flex flex-col">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center"><span className="text-xl mr-2">📈</span>
              <h3 className="text-gray-800 text-base md:text-lg font-extrabold">พยากรณ์อุณหภูมิ 7 วันล่วงหน้า (°C)</h3></div><SourceBadge label="แบบจำลอง • Open-Meteo" tone="sky" /></div>
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center"><span className="text-xl mr-2">🌧️</span>
              <h3 className="text-gray-800 text-base md:text-lg font-extrabold">พยากรณ์ปริมาณน้ำฝน 7 วัน (มม.)</h3></div><SourceBadge label="แบบจำลอง • Open-Meteo" tone="sky" /></div>
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

          {/* Windy เป็นเครื่องมือสำรองภายนอก ไม่โหลด iframe/WebGL พร้อมหน้าหลัก */}
          <div className="col-span-1 mt-4 rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-5 shadow-sm md:col-span-4 md:p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🛰️</span>
                  <h3 className="text-lg font-extrabold text-[#0f4a8a]">Windy — แผนที่สำรองภายนอก</h3>
                </div>
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-600 md:text-sm">
                  หน้านี้ใช้แผนที่และเรดาร์ภายในเป็นแหล่งหลัก จึงไม่โหลด Windy iframe อัตโนมัติ ลดการใช้ข้อมูลและป้องกันปัญหา WebGL บนอุปกรณ์รุ่นเก่า หากต้องการตรวจสอบชั้นข้อมูลเพิ่มเติมให้เปิด Windy ในแท็บใหม่
                </p>
              </div>
              <a
                href={`https://www.windy.com/?${windyLayer},${position.lat.toFixed(3)},${position.lng.toFixed(3)},9`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0f4a8a] px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0b3768] focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
              >
                เปิด Windy ชั้น {WINDY_LAYERS.find(layer => layer.id === windyLayer)?.label} ↗
              </a>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide" aria-label="เลือกชั้นข้อมูลสำหรับเปิดใน Windy">
              {WINDY_LAYERS.map(layer => (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setWindyLayer(layer.id)}
                  aria-pressed={windyLayer === layer.id}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition ${windyLayer === layer.id ? 'border-[#0f4a8a] bg-[#0f4a8a] text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {layer.icon} {layer.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ⚖️ ข้อความสงวนสิทธิ์ */}
        <div className="bg-gray-100 border border-gray-300 rounded-2xl p-4 md:p-5 text-[11px] md:text-xs text-gray-600 leading-relaxed">
          <span className="font-extrabold text-gray-700">⚖️ ข้อจำกัดความรับผิดชอบ: </span>
          ข้อมูลในหน้านี้เป็นการประมวลผลอัตโนมัติจากแบบจำลองพยากรณ์อากาศ (ECMWF และ NOAA GFS ผ่าน Open-Meteo) และภาพเรดาร์ตรวจอากาศ (RainViewer) โดย Windy และ Tropical Tidbits เป็นลิงก์ตรวจสอบภายนอกเท่านั้น
          เพื่อใช้ประกอบการตัดสินใจเบื้องต้นเท่านั้น <span className="font-bold">มิใช่ประกาศเตือนภัยอย่างเป็นทางการ</span>
          การแจ้งเตือนภัยอย่างเป็นทางการให้ยึดตามประกาศของกรมอุตุนิยมวิทยาและกรมป้องกันและบรรเทาสาธารณภัยเป็นสำคัญ
          หากพบความผิดปกติของระบบ โปรดแจ้งเจ้าหน้าที่ผู้ดูแลระบบ เทศบาลตำบลบ่อหลวง อำเภอฮอด จังหวัดเชียงใหม่
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
