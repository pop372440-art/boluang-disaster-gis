'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { useMapEvents } from 'react-leaflet';
import { createClient } from '@supabase/supabase-js';

/* ════════════════════════ SUPABASE ════════════════════════ */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then((m) => m.GeoJSON), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), { ssr: false });

const ClickableMap = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
};

/* ════════════════════ GEO HELPERS (ไม่พึ่ง turf) ════════════════════ */
const ringsOf = (geom: any): number[][][] => {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
  return [];
};

/** centroid แบบ area-weighted (fallback เป็นค่าเฉลี่ยจุดถ้า area = 0) */
const polygonCentroid = (geom: any): [number, number] => {
  const rings = ringsOf(geom);
  let cx = 0, cy = 0, area = 0;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j], [x1, y1] = ring[i];
      const f = x0 * y1 - x1 * y0;
      area += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
  }
  if (Math.abs(area) < 1e-12) {
    const pts = rings.flat();
    if (!pts.length) return [98.3744, 18.1633];
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  }
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
};

const pointInPolygon = (lng: number, lat: number, geom: any) => {
  let inside = false;
  for (const ring of ringsOf(geom)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
};

/** ดึงชื่อ/หมู่ จาก property ได้หลายรูปแบบ (block.json ของแต่ละที่ตั้งชื่อไม่เหมือนกัน) */
const NAME_KEYS = ['name_th', 'NAME_TH', 'village', 'VILLAGE', 'name', 'NAME', 'ban', 'BAN', 'vill_name', 'Name', 'title', 'zone', 'ZONE'];
const MOO_KEYS = ['moo', 'MOO', 'Moo', 'mu', 'MU', 'village_no', 'VILLAGE_NO', 'no', 'NO', 'id', 'ID', 'block', 'BLOCK', 'gid'];

const getMoo = (p: any = {}, idx = 0) => {
  for (const k of MOO_KEYS) if (p?.[k] !== undefined && p?.[k] !== null && `${p[k]}`.trim() !== '') return `${p[k]}`.replace(/[^0-9]/g, '') || `${idx + 1}`;
  return `${idx + 1}`;
};
const getName = (p: any = {}, idx = 0) => {
  for (const k of NAME_KEYS) if (p?.[k] && `${p[k]}`.trim() !== '') return `${p[k]}`;
  return `หมู่ ${getMoo(p, idx)}`;
};
const getNum = (p: any = {}, keys: string[]) => {
  for (const k of keys) { const v = Number(p?.[k]); if (!isNaN(v) && v > 0) return v; }
  return 0;
};

/* ════════════════════ เกณฑ์เตือนภัย (ปรับสำหรับพื้นที่ลาดชัน) ════════════════════ */
const LEVELS = [
  { key: 'normal', name: 'ปกติ',      max: 10,       color: '#22C55E', glow: 'rgba(34,197,94,.8)',  act: 'เฝ้าติดตามตามปกติ' },
  { key: 'watch',  name: 'เฝ้าระวัง',  max: 35,       color: '#FACC15', glow: 'rgba(250,204,21,.8)', act: 'แจ้งผู้ใหญ่บ้าน ตรวจลำห้วย/ทางน้ำ' },
  { key: 'warn',   name: 'เตือนภัย',   max: 60,       color: '#F97316', glow: 'rgba(249,115,22,.8)', act: 'ประกาศเสียงตามสาย เตรียมกลุ่มเปราะบาง' },
  { key: 'danger', name: 'อันตราย',    max: 90,       color: '#EF4444', glow: 'rgba(239,68,68,.9)',  act: 'อพยพจุดเสี่ยงดินถล่ม/ริมห้วยทันที' },
  { key: 'crisis', name: 'วิกฤต',      max: Infinity, color: '#A855F7', glow: 'rgba(168,85,247,.9)', act: 'อพยพเต็มรูปแบบไปจุดปลอดภัย' },
];
const classify = (mm: number) => LEVELS.find((l) => mm < l.max) || LEVELS[LEVELS.length - 1];

/* ════════════════════════ PAGE ════════════════════════ */
export default function RadarPage() {
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [radarData, setRadarData] = useState<any>(null);

  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const [mapStyle, setMapStyle] = useState<'light' | 'terrain' | 'satellite' | 'dark'>('dark');
  const [showRadar, setShowRadar] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.7);
  const [showBoluang, setShowBoluang] = useState(true);
  const [showBlock, setShowBlock] = useState(true);
  const [showRisk, setShowRisk] = useState(true);          // ระบายสีเสี่ยงรายหมู่บ้าน
  const [showLabels, setShowLabels] = useState(true);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(true);
  const [isTablePanelOpen, setIsTablePanelOpen] = useState(true);
  const [isSheetOpen, setIsSheetOpen] = useState(false);   // mobile bottom sheet
  const [scope, setScope] = useState<'village' | 'tambon'>('village');

  const [clickedLocation, setClickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [forecastData, setForecastData] = useState<any>(null);
  const [isFetchingForecast, setIsFetchingForecast] = useState(false);
  const [selectedVillage, setSelectedVillage] = useState<any>(null);

  const [villageRisk, setVillageRisk] = useState<any[]>([]);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskUpdatedAt, setRiskUpdatedAt] = useState<Date | null>(null);
  const [alertDismissed, setAlertDismissed] = useState(false);

  const [isTopHeaderVisible, setIsTopHeaderVisible] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [realStats, setRealStats] = useState({ totalVisits: 0, totalUniqueVisitors: 0, todayVisits: 0, todayUniqueVisitors: 0, isLoading: true });

  const mapRef = useRef<any>(null);
  const center = { lat: 18.1633, lng: 98.3744 };

  /* ─────────── โหลด GeoJSON + เรดาร์ ─────────── */
  useEffect(() => {
    fetch('/geojson/boluang.json').then((r) => r.json()).then(setGeoBoluang).catch(() => {});
    fetch('/geojson/block.json').then((r) => r.json()).then(setGeoBlock).catch(() => {});

    const loadRadar = () =>
      fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then((r) => r.json())
        .then((d) => {
          const frames = [...(d.radar.past || []), ...(d.radar.nowcast || [])];
          setRadarData({ host: d.host, frames, pastCount: d.radar.past.length });
          setCurrentFrameIndex(d.radar.past.length - 1);
        })
        .catch(console.error);

    loadRadar();
    const t = setInterval(loadRadar, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  /* ─────────── หัวใจ: คำนวณความเสี่ยงรายหมู่บ้าน ─────────── */
  const computeVillageRisk = useCallback(async (fc: any) => {
    const feats: any[] = fc?.features || [];
    if (!feats.length) return;
    setRiskLoading(true);
    try {
      const cents = feats.map((f) => polygonCentroid(f.geometry));
      const lat = cents.map((c) => c[1].toFixed(4)).join(',');
      const lon = cents.map((c) => c[0].toFixed(4)).join(',');
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=precipitation,precipitation_probability,weathercode` +
        `&daily=precipitation_sum&past_days=7&forecast_days=2&timezone=Asia%2FBangkok`;

      const raw = await (await fetch(url)).json();
      const arr = Array.isArray(raw) ? raw : [raw];
      const now = Date.now();

      const rows = feats.map((f, i) => {
        const d = arr[i] || arr[0];
        const props = f.properties || {};
        const times: string[] = d?.hourly?.time || [];
        const prec: number[] = d?.hourly?.precipitation || [];
        const prob: number[] = d?.hourly?.precipitation_probability || [];

        // index ชั่วโมงปัจจุบัน (เวลาเป็น local Bangkok → บวก +07:00 ให้ชัดเจน)
        let idx = times.findIndex((t) => new Date(`${t}:00+07:00`).getTime() >= now);
        if (idx < 0) idx = Math.max(times.length - 4, 0);

        const hours = [1, 2, 3].map((k) => ({
          time: times[idx + k] ? new Date(`${times[idx + k]}:00+07:00`) : null,
          rain: prec[idx + k] ?? 0,
          prob: prob[idx + k] ?? 0,
        }));

        const rain3h = hours.reduce((s, h) => s + (h.rain || 0), 0);
        const rain1h = prec[idx] ?? 0;
        const rain24h = prec.slice(Math.max(idx - 24, 0), idx).reduce((s, v) => s + (v || 0), 0);
        const maxProb = Math.max(0, ...hours.map((h) => h.prob || 0));
        const peakHour = hours.reduce((a, b) => ((b.rain || 0) > (a.rain || 0) ? b : a), hours[0]);

        // ดัชนีดินอิ่มน้ำ 7 วันย้อนหลัง (Antecedent Precipitation Index)
        const api7 = (d?.daily?.precipitation_sum || []).slice(0, 7).reduce((s: number, v: number) => s + (v || 0), 0);
        const soilFactor = 1 + Math.min(api7 / 120, 0.5);            // สูงสุด ×1.5
        const slope = getNum(props, ['slope_deg', 'slope', 'SLOPE']);
        const terrainFactor = slope > 20 ? 1.25 : slope > 12 ? 1.1 : 1.0;

        const riskIndex = rain3h * soilFactor * terrainFactor;
        const level = classify(riskIndex);

        return {
          id: `${i}`,
          moo: getMoo(props, i),
          name: getName(props, i),
          households: getNum(props, ['households', 'house', 'HOUSE', 'hh']),
          population: getNum(props, ['population', 'pop', 'POP']),
          centroid: cents[i],
          rain1h, rain3h, rain24h, maxProb, api7, soilFactor, terrainFactor, riskIndex, level,
          peak: peakHour?.time ? peakHour.time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--',
          hours,
          raw: props,
        };
      });

      rows.sort((a, b) => b.riskIndex - a.riskIndex);
      setVillageRisk(rows);
      setRiskUpdatedAt(new Date());
      setAlertDismissed(false);
    } catch (e) {
      console.error('village risk error', e);
    } finally {
      setRiskLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!geoBlock) return;
    computeVillageRisk(geoBlock);
    const t = setInterval(() => computeVillageRisk(geoBlock), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [geoBlock, computeVillageRisk]);

  const riskByKey = useMemo(() => {
    const m = new Map<string, any>();
    villageRisk.forEach((v) => m.set(`${v.moo}|${v.name}`, v));
    return m;
  }, [villageRisk]);

  const tambonSummary = useMemo(() => {
    if (!villageRisk.length) return null;
    const mean = villageRisk.reduce((s, v) => s + v.rain3h, 0) / villageRisk.length;
    const peak = Math.max(...villageRisk.map((v) => v.rain3h));
    const affected = villageRisk.filter((v) => v.rain3h > 1).length;
    const worst = villageRisk[0];
    return {
      mean, peak, affected, worst,
      pctArea: Math.round((affected / villageRisk.length) * 100),
      level: classify(worst.riskIndex),
    };
  }, [villageRisk]);

  const alertVillages = useMemo(
    () => villageRisk.filter((v) => ['warn', 'danger', 'crisis'].includes(v.level.key)),
    [villageRisk]
  );

  /* ─────────── สถิติ Supabase ─────────── */
  useEffect(() => {
    if (!isStatsModalOpen) return;
    (async () => {
      setRealStats((p) => ({ ...p, isLoading: true }));
      try {
        const { data: logs, error } = await supabase.from('visitor_logs').select('session_id, visited_at');
        if (error) throw error;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayLogs = logs.filter((l: any) => new Date(l.visited_at) >= today);
        setRealStats({
          totalVisits: logs.length,
          totalUniqueVisitors: new Set(logs.map((l: any) => l.session_id)).size,
          todayVisits: todayLogs.length,
          todayUniqueVisitors: new Set(todayLogs.map((l: any) => l.session_id)).size,
          isLoading: false,
        });
      } catch (e) { console.error(e); setRealStats((p) => ({ ...p, isLoading: false })); }
    })();
  }, [isStatsModalOpen]);

  /* ─────────── Timeline player ─────────── */
  useEffect(() => {
    let iv: any;
    if (isPlaying && radarData?.frames?.length) {
      iv = setInterval(() => {
        setCurrentFrameIndex((p) => {
          const n = p + 1;
          if (n >= radarData.frames.length) { setIsPlaying(false); return p; }
          return n;
        });
      }, 1200);
    }
    return () => clearInterval(iv);
  }, [isPlaying, radarData]);

  const getBasemapUrl = () => {
    switch (mapStyle) {
      case 'light': return 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
      case 'terrain': return 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}';
      case 'satellite': return 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
      default: return 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    }
  };

  /* ─────────── คลิกแผนที่ = รู้ว่าอยู่หมู่บ้านไหน + พยากรณ์จุดนั้น ─────────── */
  const handleMapClick = async (lat: number, lng: number) => {
    setClickedLocation({ lat, lng });
    setIsFetchingForecast(true);
    setForecastData(null);

    const hit = (geoBlock?.features || []).findIndex((f: any) => pointInPolygon(lng, lat, f.geometry));
    if (hit >= 0) {
      const props = geoBlock.features[hit].properties || {};
      setSelectedVillage(riskByKey.get(`${getMoo(props, hit)}|${getName(props, hit)}`) || null);
    } else setSelectedVillage(null);

    try {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation,weathercode&timezone=Asia%2FBangkok&forecast_days=2`
      );
      const d = await r.json();
      const now = Date.now();
      let idx = d.hourly.time.findIndex((t: string) => new Date(`${t}:00+07:00`).getTime() >= now);
      if (idx < 0) idx = 0;
      const hours = [1, 2, 3].map((k) => ({
        time: new Date(`${d.hourly.time[idx + k]}:00+07:00`),
        rain: d.hourly.precipitation[idx + k] ?? 0,
        code: d.hourly.weathercode[idx + k],
      }));
      const total = hours.reduce((s, h) => s + h.rain, 0);
      setForecastData({ isRaining: total > 0.5, totalRain: total, hours });
    } catch (e) { console.error(e); } finally { setIsFetchingForecast(false); }
  };

  const flyToVillage = (v: any) => {
    setSelectedVillage(v);
    mapRef.current?.flyTo([v.centroid[1], v.centroid[0]], 14, { duration: 1.2 });
    setIsSheetOpen(false);
  };

  const getRainText = (mm: number) => {
    if (mm <= 0.1) return { text: 'ไม่มีฝน', color: 'text-gray-400', icon: '☀️' };
    if (mm <= 2.5) return { text: 'ฝนเล็กน้อย', color: 'text-green-400', icon: '🌦️' };
    if (mm <= 10) return { text: 'ฝนปานกลาง', color: 'text-yellow-400', icon: '🌧️' };
    return { text: 'ฝนตกหนัก', color: 'text-red-500', icon: '⛈️' };
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleGoHome = () => mapRef.current?.flyTo([center.lat, center.lng], 12, { duration: 1.5 });

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const customPinIcon = L
    ? L.divIcon({
        className: 'bg-transparent border-none',
        html: `<div class="relative flex items-center justify-center w-8 h-8"><div class="absolute inset-0 bg-blue-500 rounded-full blur-[4px] opacity-60 animate-ping"></div><div class="relative flex items-center justify-center w-5 h-5 bg-[#38bdf8] border-2 border-white rounded-full shadow-lg z-10"></div></div>`,
        iconSize: [32, 32], iconAnchor: [16, 16],
      })
    : null;

  /* ─────────── สไตล์ polygon หมู่บ้านตามระดับเสี่ยง ─────────── */
  const blockStyle = useCallback(
    (feature: any) => {
      const idx = (geoBlock?.features || []).indexOf(feature);
      const p = feature.properties || {};
      const v = riskByKey.get(`${getMoo(p, idx)}|${getName(p, idx)}`);
      if (!showRisk || !v) return { color: '#F59E0B', weight: 1, fill: false, opacity: 0.5 };
      const isSel = selectedVillage && selectedVillage.moo === v.moo && selectedVillage.name === v.name;
      return {
        color: isSel ? '#FFFFFF' : v.level.color,
        weight: isSel ? 3 : 1.6,
        fillColor: v.level.color,
        fillOpacity: v.level.key === 'normal' ? 0.12 : 0.42,
        opacity: 0.95,
      };
    },
    [geoBlock, riskByKey, showRisk, selectedVillage]
  );

  const onEachBlock = useCallback(
    (feature: any, layer: any) => {
      const idx = (geoBlock?.features || []).indexOf(feature);
      const p = feature.properties || {};
      const key = `${getMoo(p, idx)}|${getName(p, idx)}`;
      const v = riskByKey.get(key);
      const name = getName(p, idx);
      if (showLabels) {
        layer.bindTooltip(
          `<div style="font-family:inherit"><b>${name}</b>${v ? ` · <span style="color:${v.level.color}">${v.rain3h.toFixed(1)} มม.</span>` : ''}</div>`,
          { permanent: showRisk, direction: 'center', className: 'village-label' }
        );
      }
      layer.on('click', (e: any) => {
        if (e?.originalEvent) e.originalEvent.stopPropagation?.();
        if (v) flyToVillage(v);
      });
    },
    [geoBlock, riskByKey, showLabels, showRisk]
  );

  const activeFrame = radarData?.frames[currentFrameIndex];
  const radarUrl = showRadar && activeFrame ? `${radarData.host}${activeFrame.path}/256/{z}/{x}/{y}/4/1_1.png` : '';
  const isNowcast = currentFrameIndex >= (radarData?.pastCount || 0);
  const displayDate = new Date().toLocaleDateString('en-GB');

  /* ════════════════════ UI PARTS ════════════════════ */
  const LayerToggle = ({ label, checked, onChange, badge, disabled }: any) => (
    <div className="flex items-center justify-between group py-1">
      <label className={`flex items-center space-x-3 flex-1 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
        <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="onwr-checkbox" />
        <span className="text-[12px] font-medium text-[#D1D5DB] group-hover:text-white transition-colors truncate">{label}</span>
      </label>
      {badge && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#4178F3]/15 text-[#4178F3] border border-[#4178F3]/30 font-bold shrink-0">{badge}</span>}
    </div>
  );

  const RankRow = ({ v, i }: any) => (
    <div
      onClick={() => flyToVillage(v)}
      className={`flex items-center text-[#D1D5DB] py-2.5 border-b border-[#333946]/30 hover:bg-[#232732] cursor-pointer rounded px-1 transition-colors ${
        selectedVillage?.moo === v.moo && selectedVillage?.name === v.name ? 'bg-[#232732] ring-1 ring-[#4178F3]/40' : ''
      }`}
    >
      <div className="w-8 text-center text-[#8B94A5] font-mono">{i + 1}</div>
      <div className="w-1.5 h-6 rounded-full mr-2 shrink-0" style={{ background: v.level.color, boxShadow: `0 0 8px ${v.level.glow}` }} />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[#E5E7EB] truncate">{v.name}</div>
        <div className="text-[9.5px] text-[#8B94A5] font-mono">หมู่ {v.moo} · {v.level.name}</div>
      </div>
      <div className="w-16 text-right font-mono text-white font-bold">{v.rain3h.toFixed(1)}</div>
      <div className="w-14 text-right font-mono text-[#8B94A5]">{Math.round(v.maxProb)}%</div>
      <div className="w-14 text-right font-mono pr-1">{v.peak}</div>
    </div>
  );

  const RankTable = ({ height = 'h-[330px]' }: any) => (
    <div className="w-full text-[11.5px]">
      <div className="flex font-bold text-[#8B94A5] border-b border-[#333946] pb-2.5 mb-1">
        <div className="w-8 text-center">#</div>
        <div className="w-1.5 mr-2" />
        <div className="flex-1 pl-1">หมู่บ้าน</div>
        <div className="w-16 text-right text-[#4178F3]">3 ชม.</div>
        <div className="w-14 text-right">โอกาส</div>
        <div className="w-14 text-right pr-1">Peak</div>
      </div>
      <div className={`overflow-y-auto ${height} onwr-scroll pr-2`}>
        {riskLoading && !villageRisk.length ? (
          <div className="py-10 text-center text-[#8B94A5] text-[12px] animate-pulse">กำลังประมวลผลรายหมู่บ้าน...</div>
        ) : villageRisk.length ? (
          villageRisk.map((v, i) => <RankRow key={v.id} v={v} i={i} />)
        ) : (
          <div className="py-10 text-center text-[#8B94A5] text-[12px]">ไม่พบข้อมูลขอบเขตหมู่บ้าน (/geojson/block.json)</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative w-screen h-screen bg-[#111319] overflow-hidden font-sans text-white flex flex-col select-none">
      <style dangerouslySetInnerHTML={{ __html: `
        .leaflet-container { background:#111319 !important; cursor:crosshair !important; }
        .dark-map { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%); }
        .onwr-panel { background:#1A1D24; border:1px solid #333946; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.7); }
        .onwr-checkbox { appearance:none; width:14px; height:14px; border:2px solid #4B5563; border-radius:4px; background:transparent; cursor:pointer; position:relative; transition:.2s; }
        .onwr-checkbox:checked { background:#4178F3; border-color:#4178F3; }
        .onwr-checkbox:checked::after { content:''; position:absolute; left:3.5px; top:.5px; width:4px; height:8px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }
        .onwr-slider { -webkit-appearance:none; width:100%; height:4px; background:#333946; border-radius:2px; outline:none; }
        .onwr-slider::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#4178F3; cursor:pointer; border:2px solid #1A1D24; box-shadow:0 0 8px rgba(65,120,243,.8); }
        .onwr-scroll::-webkit-scrollbar { width:6px; }
        .onwr-scroll::-webkit-scrollbar-track { background:#111319; border-radius:4px; }
        .onwr-scroll::-webkit-scrollbar-thumb { background:#333946; border-radius:4px; }
        .village-label { background:rgba(17,19,25,.82) !important; border:1px solid #333946 !important; color:#E5E7EB !important; font-size:10px !important; padding:2px 6px !important; border-radius:6px !important; box-shadow:none !important; }
        .village-label::before { display:none !important; }
        @keyframes fadeIn { from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:none} }
        .animate-fade-in { animation: fadeIn .25s ease-out; }
      `}} />

      {/* ══ TOP BAR ══ */}
      <div className="absolute top-0 left-0 w-full h-8 z-[1999]" onMouseEnter={() => setIsTopHeaderVisible(true)} />
      <header
        className={`absolute top-0 left-1/2 -translate-x-1/2 w-[98%] max-w-[1200px] h-[76px] bg-[#1A1D24]/90 backdrop-blur-xl rounded-b-2xl z-[2000] flex items-center justify-between px-6 shadow-[0_15px_50px_rgba(0,0,0,.6)] transition-transform duration-500 border-b border-x border-[#333946] ${isTopHeaderVisible ? 'translate-y-0' : '-translate-y-full'}`}
        onMouseLeave={() => setIsTopHeaderVisible(false)}
      >
        <div className="flex items-center space-x-5">
          <div className="w-11 h-11 bg-[#111319] rounded-full border border-[#333946] flex items-center justify-center p-1.5 shadow-inner">
            <img src="/Logogis3.png" alt="Logo" className="w-full h-full object-contain opacity-90" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-[15px] md:text-[16px] font-extrabold tracking-wide text-[#E5E7EB]">
              RADAR COMPOSITE <span className="text-[#4178F3] mx-1">•</span>
              <span className="font-medium text-[#D1D5DB]">NOWCAST 3 ชม. รายหมู่บ้าน</span>
            </h1>
            <p className="text-[11px] text-[#8B94A5] mt-1 font-mono">เทศบาลตำบลบ่อหลวง อ.ฮอด จ.เชียงใหม่</p>
          </div>
        </div>
        <div className="flex items-center space-x-4 text-sm">
          <div className="hidden lg:flex items-center space-x-3">
            <span className="text-[#8B94A5] font-bold text-[11px] uppercase">อัปเดต</span>
            <div className="px-3.5 py-1.5 bg-[#111319] border border-[#333946] text-[#4178F3] rounded-lg font-mono font-bold shadow-inner">{displayDate}</div>
            <div className="px-3.5 py-1.5 bg-[#111319] border border-[#333946] text-[#4178F3] rounded-lg font-mono font-bold min-w-[90px] text-center shadow-inner">
              {riskUpdatedAt ? riskUpdatedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'} น.
            </div>
          </div>
          <button onClick={() => geoBlock && computeVillageRisk(geoBlock)} className="flex items-center px-4 py-2 bg-[#232732] border border-[#333946] text-[#D1D5DB] hover:bg-[#2D323B] rounded-xl font-bold space-x-2 transition-colors">
            <svg className={`w-4 h-4 ${riskLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M19.418 9A7.003 7.003 0 006 7.293M4.582 15A7.003 7.003 0 0018 16.707" /></svg>
            <span className="text-[12px]">รีเฟรช</span>
          </button>
          <button onClick={() => setIsStatsModalOpen(true)} className="flex items-center px-4 py-2 bg-[#4178F3]/10 border border-[#4178F3]/30 text-[#4178F3] hover:bg-[#4178F3]/20 rounded-xl font-bold space-x-2 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            <span className="text-[12px]">สถิติ</span>
          </button>
        </div>
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-16 h-4 bg-[#1A1D24] rounded-b-xl border-b border-x border-[#333946] flex items-center justify-center cursor-pointer">
          <div className="w-5 h-1 bg-[#4B5563] rounded-full" />
        </div>
      </header>
      {!isTopHeaderVisible && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-4 bg-[#1A1D24]/80 backdrop-blur-md rounded-b-xl border-b border-x border-[#333946] flex items-center justify-center cursor-pointer z-[1500] hover:bg-[#232732]" onMouseEnter={() => setIsTopHeaderVisible(true)}>
          <div className="w-6 h-1 bg-[#8B94A5]/50 rounded-full" />
        </div>
      )}

      <div className="relative flex-1">
        {/* ══ MAP ══ */}
        <div className="absolute inset-0 z-0">
          <MapContainer center={[center.lat, center.lng]} zoom={12} maxZoom={20} zoomControl={false} attributionControl={false} className="w-full h-full" ref={mapRef}>
            <TileLayer url={getBasemapUrl()} maxZoom={20} className={mapStyle === 'dark' ? 'dark-map' : ''} />
            {radarUrl && <TileLayer key={activeFrame?.path} url={radarUrl} opacity={radarOpacity} zIndex={100} maxNativeZoom={12} maxZoom={20} />}
            {showBoluang && geoBoluang && <GeoJSON data={geoBoluang} style={{ color: '#E5E7EB', weight: 1.8, fill: false, opacity: 0.85, dashArray: '4,4' }} />}
            {showBlock && geoBlock && (
              <GeoJSON key={`block-${villageRisk.length}-${showRisk}-${showLabels}-${riskUpdatedAt?.getTime()}-${selectedVillage?.moo || 'x'}`} data={geoBlock} style={blockStyle as any} onEachFeature={onEachBlock} />
            )}
            <ClickableMap onMapClick={handleMapClick} />
            {clickedLocation && customPinIcon && <Marker position={[clickedLocation.lat, clickedLocation.lng]} icon={customPinIcon} />}
          </MapContainer>
        </div>

        {/* ══ ALERT BANNER ══ */}
        {alertVillages.length > 0 && !alertDismissed && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1400] w-[92%] max-w-[640px] animate-fade-in pointer-events-auto">
            <div className="rounded-2xl border px-4 py-3 flex items-center gap-3 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,.6)]"
              style={{ background: 'rgba(26,29,36,.93)', borderColor: alertVillages[0].level.color }}>
              <span className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0" style={{ background: alertVillages[0].level.color, boxShadow: `0 0 12px ${alertVillages[0].level.glow}` }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-extrabold" style={{ color: alertVillages[0].level.color }}>
                  ⚠️ {alertVillages[0].level.name} — {alertVillages.length} หมู่บ้านเสี่ยงใน 3 ชม. ข้างหน้า
                </div>
                <div className="text-[11px] text-[#D1D5DB] truncate mt-0.5">
                  {alertVillages.slice(0, 3).map((v) => `${v.name} ${v.rain3h.toFixed(0)} มม.`).join(' · ')}
                  {alertVillages.length > 3 ? ` และอีก ${alertVillages.length - 3} แห่ง` : ''} — {alertVillages[0].level.act}
                </div>
              </div>
              <button onClick={() => setAlertDismissed(true)} className="text-[#8B94A5] hover:text-white shrink-0 p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* ══ LAYER PANEL ══ */}
        {isLayerMenuOpen ? (
          <div className="absolute top-5 left-5 z-[1000] w-[286px] onwr-panel flex-col pointer-events-auto hidden md:flex">
            <div className="px-5 py-3.5 border-b border-[#333946] flex justify-between items-center bg-[#232732] rounded-t-xl">
              <h3 className="text-[13px] font-bold text-[#E5E7EB] flex items-center">
                <svg className="w-4 h-4 mr-2 text-[#4178F3]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                จัดการชั้นข้อมูล
              </h3>
              <button onClick={() => setIsLayerMenuOpen(false)} className="text-[#8B94A5] hover:text-white">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex flex-col max-h-[calc(100vh-160px)]">
              <div className="p-4 border-b border-[#333946]">
                <div className="grid grid-cols-4 gap-2.5">
                  {[{ id: 'light', name: 'Light', bg: 'bg-[#E5E7EB]' }, { id: 'terrain', name: 'Terrain', bg: 'bg-[#8F9779]' }, { id: 'satellite', name: 'Satellite', bg: 'bg-[#2D4C1E]' }, { id: 'dark', name: 'Dark', bg: 'bg-[#111319]' }].map((b) => (
                    <div key={b.id} onClick={() => setMapStyle(b.id as any)} className={`flex flex-col items-center p-1.5 rounded-xl border cursor-pointer transition-all ${mapStyle === b.id ? 'bg-[#292E38] border-[#4178F3]' : 'border-[#333946] hover:border-[#4B5563]'}`}>
                      <div className={`w-full h-7 ${b.bg} rounded-md border border-[#333946] mb-1.5 shadow-inner`} />
                      <span className={`text-[10px] font-bold ${mapStyle === b.id ? 'text-[#4178F3]' : 'text-[#8B94A5]'}`}>{b.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 overflow-y-auto onwr-scroll pr-2 rounded-b-xl">
                <LayerToggle label="เรดาร์คอมโพสิต" checked={showRadar} onChange={(e: any) => setShowRadar(e.target.checked)} badge="LIVE" />
                <div className="pl-7 pr-1 pb-2 pt-1">
                  <input type="range" min="0.2" max="1" step="0.05" value={radarOpacity} onChange={(e) => setRadarOpacity(parseFloat(e.target.value))} className="onwr-slider" />
                </div>
                <LayerToggle label="ฝนสะสมคาดการณ์ 3 ชม. (รายหมู่บ้าน)" checked={showRisk} onChange={(e: any) => setShowRisk(e.target.checked)} badge="NOWCAST" />
                <LayerToggle label="ป้ายชื่อหมู่บ้าน" checked={showLabels} onChange={(e: any) => setShowLabels(e.target.checked)} />
                <div className="border-t border-[#333946] my-3" />
                <LayerToggle label="ขอบเขตตำบลบ่อหลวง" checked={showBoluang} onChange={(e: any) => setShowBoluang(e.target.checked)} />
                <LayerToggle label={`ขอบเขตหมู่บ้าน (${geoBlock?.features?.length || 0} โซน)`} checked={showBlock} onChange={(e: any) => setShowBlock(e.target.checked)} />
                <div className="border-t border-[#333946] my-3" />
                <div className="text-[10px] text-[#8B94A5] leading-relaxed bg-[#111319] border border-[#333946] rounded-lg p-2.5">
                  ระดับเสี่ยงคำนวณจาก <b className="text-[#D1D5DB]">ฝนคาดการณ์ 3 ชม. × ดัชนีดินอิ่มน้ำ 7 วัน × ความลาดชัน</b>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setIsLayerMenuOpen(true)} className="absolute top-5 left-5 z-[1000] p-2.5 bg-[#1A1D24]/90 backdrop-blur-md border border-[#333946] rounded-xl hover:bg-[#232732] text-[#E5E7EB] hidden md:block">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
        )}

        {/* ══ RANKING PANEL (desktop) ══ */}
        {isTablePanelOpen ? (
          <div className="absolute top-5 right-5 z-[900] w-[404px] onwr-panel flex-col pointer-events-auto hidden xl:flex overflow-hidden">
            <div className="flex border-b border-[#333946] bg-[#111319]">
              <button onClick={() => setScope('village')} className={`px-5 py-3 text-[12px] font-bold transition-colors ${scope === 'village' ? 'text-[#4178F3] border-b-2 border-[#4178F3] bg-[#1A1D24]' : 'text-[#8B94A5] hover:text-[#E5E7EB]'}`}>รายหมู่บ้าน</button>
              <button onClick={() => setScope('tambon')} className={`px-5 py-3 text-[12px] font-bold transition-colors ${scope === 'tambon' ? 'text-[#4178F3] border-b-2 border-[#4178F3] bg-[#1A1D24]' : 'text-[#8B94A5] hover:text-[#E5E7EB]'}`}>สรุประดับตำบล</button>
              <button onClick={() => setIsTablePanelOpen(false)} className="ml-auto px-4 text-[#8B94A5] hover:text-[#EF4444]">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" /></svg>
              </button>
            </div>

            <div className="p-5">
              {scope === 'village' ? (
                <>
                  <h3 className="text-[13.5px] font-bold text-[#E5E7EB] mb-1">ประมาณการฝนสะสม 3 ชั่วโมงล่วงหน้า</h3>
                  <p className="text-[10.5px] text-[#8B94A5] mb-4">เรียงตามดัชนีความเสี่ยง · หน่วย มม. · คลิกเพื่อซูมไปหมู่บ้าน</p>
                  <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-[#333946]">
                    {LEVELS.map((l) => (
                      <span key={l.key} className="flex items-center text-[9.5px] text-[#8B94A5] px-1.5 py-0.5 rounded bg-[#111319] border border-[#333946]">
                        <span className="w-2 h-2 rounded-full mr-1" style={{ background: l.color }} />{l.name}
                      </span>
                    ))}
                  </div>
                  <RankTable />
                </>
              ) : tambonSummary ? (
                <div className="space-y-4">
                  <h3 className="text-[13.5px] font-bold text-[#E5E7EB]">ภาพรวม ต.บ่อหลวง (3 ชม. ล่วงหน้า)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { l: 'ฝนเฉลี่ยทั้งตำบล', v: `${tambonSummary.mean.toFixed(1)} มม.`, c: '#4178F3' },
                      { l: 'ฝนสูงสุดรายหมู่บ้าน', v: `${tambonSummary.peak.toFixed(1)} มม.`, c: tambonSummary.level.color },
                      { l: '% พื้นที่มีฝน', v: `${tambonSummary.pctArea}%`, c: '#22C55E' },
                      { l: 'หมู่บ้านเฝ้าระวัง+', v: `${alertVillages.length} แห่ง`, c: '#F97316' },
                    ].map((s) => (
                      <div key={s.l} className="bg-[#111319] border border-[#333946] rounded-xl p-3">
                        <p className="text-[10.5px] text-[#8B94A5] mb-1">{s.l}</p>
                        <p className="text-[20px] font-black font-mono" style={{ color: s.c }}>{s.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border p-3.5" style={{ borderColor: tambonSummary.level.color, background: `${tambonSummary.level.color}14` }}>
                    <p className="text-[12px] font-bold" style={{ color: tambonSummary.level.color }}>สถานะตำบล: {tambonSummary.level.name}</p>
                    <p className="text-[11px] text-[#D1D5DB] mt-1">พื้นที่เสี่ยงสูงสุด: <b>{tambonSummary.worst.name}</b> ({tambonSummary.worst.rain3h.toFixed(1)} มม.)</p>
                    <p className="text-[11px] text-[#8B94A5] mt-1.5">แนวปฏิบัติ: {tambonSummary.level.act}</p>
                  </div>
                  <div className="bg-[#111319] border border-[#333946] rounded-xl p-3 text-[11px] text-[#8B94A5]">
                    ดัชนีดินอิ่มน้ำเฉลี่ย 7 วัน:{' '}
                    <b className="text-[#D1D5DB] font-mono">
                      {(villageRisk.reduce((s, v) => s + v.api7, 0) / (villageRisk.length || 1)).toFixed(0)} มม.
                    </b>{' '}
                    (ตัวคูณเสี่ยง ×{(villageRisk.reduce((s, v) => s + v.soilFactor, 0) / (villageRisk.length || 1)).toFixed(2)})
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-[#8B94A5] text-[12px] animate-pulse">กำลังคำนวณ...</div>
              )}
            </div>
          </div>
        ) : (
          <button onClick={() => setIsTablePanelOpen(true)} className="absolute top-5 right-5 z-[900] px-4 py-2.5 bg-[#1A1D24]/90 backdrop-blur-md border border-[#333946] rounded-xl text-[12px] font-bold text-[#E5E7EB] hidden xl:block hover:bg-[#232732]">
            อันดับหมู่บ้านเสี่ยง
          </button>
        )}

        {/* ══ VILLAGE DETAIL POPUP ══ */}
        {selectedVillage && (
          <div className="absolute top-24 right-5 xl:right-[430px] z-[1050] w-[330px] onwr-panel pointer-events-auto animate-fade-in hidden md:block" style={{ borderColor: `${selectedVillage.level.color}66` }}>
            <div className="px-5 py-4 border-b border-[#333946] flex justify-between items-center bg-[#232732] rounded-t-xl">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center border text-[13px] font-black shrink-0"
                  style={{ background: `${selectedVillage.level.color}22`, borderColor: `${selectedVillage.level.color}88`, color: selectedVillage.level.color }}>
                  {selectedVillage.moo}
                </div>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-bold text-[#E5E7EB] truncate">{selectedVillage.name}</h3>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: selectedVillage.level.color }}>ระดับ{selectedVillage.level.name}</p>
                </div>
              </div>
              <button onClick={() => setSelectedVillage(null)} className="text-[#8B94A5] hover:text-[#EF4444] p-1.5 rounded-lg border border-[#333946] shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { l: '1 ชม.', v: selectedVillage.rain1h },
                  { l: '3 ชม. (คาด)', v: selectedVillage.rain3h },
                  { l: '24 ชม. ผ่านมา', v: selectedVillage.rain24h },
                ].map((s) => (
                  <div key={s.l} className="bg-[#111319] border border-[#333946] rounded-xl p-2.5 text-center">
                    <p className="text-[9px] text-[#8B94A5]">{s.l}</p>
                    <p className="text-[16px] font-black font-mono text-[#E5E7EB] mt-0.5">{s.v.toFixed(1)}</p>
                    <p className="text-[8.5px] text-[#8B94A5]">มม.</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#8B94A5] mb-2">พยากรณ์รายชั่วโมง</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {selectedVillage.hours.map((h: any, i: number) => {
                    const r = getRainText(h.rain);
                    return (
                      <div key={i} className="bg-[#232732] border border-[#333946] rounded-xl p-2.5 text-center">
                        <span className="text-[9px] text-[#8B94A5] font-bold">+{i + 1} ชม.</span>
                        <div className="text-[18px] my-0.5">{r.icon}</div>
                        <div className="text-[10px] font-mono text-[#E5E7EB]">{h.time ? h.time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</div>
                        <div className={`text-[10px] font-bold mt-0.5 ${r.color}`}>{h.rain.toFixed(1)} มม.</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: selectedVillage.level.color, background: `${selectedVillage.level.color}12` }}>
                <p className="text-[11.5px] font-bold" style={{ color: selectedVillage.level.color }}>แนวปฏิบัติ</p>
                <p className="text-[11px] text-[#D1D5DB] mt-1">{selectedVillage.level.act}</p>
              </div>
              <div className="text-[10px] text-[#8B94A5] font-mono grid grid-cols-2 gap-y-1 border-t border-[#333946] pt-3">
                <span>ดินอิ่มน้ำ 7 วัน</span><span className="text-right text-[#D1D5DB]">{selectedVillage.api7.toFixed(0)} มม. (×{selectedVillage.soilFactor.toFixed(2)})</span>
                <span>ดัชนีเสี่ยงรวม</span><span className="text-right text-[#D1D5DB]">{selectedVillage.riskIndex.toFixed(1)}</span>
                {selectedVillage.households > 0 && (<><span>ครัวเรือน</span><span className="text-right text-[#D1D5DB]">{selectedVillage.households}</span></>)}
                <span>พิกัด</span><span className="text-right text-[#D1D5DB]">{selectedVillage.centroid[1].toFixed(4)}, {selectedVillage.centroid[0].toFixed(4)}</span>
              </div>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selectedVillage.centroid[1]},${selectedVillage.centroid[0]}`}
                target="_blank" rel="noreferrer"
                className="block w-full text-center py-2.5 rounded-xl bg-[#4178F3]/15 border border-[#4178F3]/40 text-[#4178F3] text-[12px] font-bold hover:bg-[#4178F3]/25 transition-colors"
              >นำทางไปยังหมู่บ้าน</a>
            </div>
          </div>
        )}

        {/* ══ POINT FORECAST POPUP ══ */}
        {clickedLocation && !selectedVillage && (
          <div className="absolute top-24 right-5 xl:right-[430px] z-[1040] w-[320px] onwr-panel pointer-events-auto animate-fade-in hidden md:block">
            <div className="px-5 py-4 border-b border-[#333946] flex justify-between items-center bg-[#232732] rounded-t-xl">
              <div>
                <h3 className="text-[13px] font-bold text-[#E5E7EB]">พิกัดที่เลือก (นอกเขตหมู่บ้าน)</h3>
                <p className="text-[10px] text-[#4178F3] font-mono mt-0.5">{clickedLocation.lat.toFixed(5)}, {clickedLocation.lng.toFixed(5)}</p>
              </div>
              <button onClick={() => setClickedLocation(null)} className="text-[#8B94A5] hover:text-[#EF4444] p-1.5 rounded-lg border border-[#333946]">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5">
              {isFetchingForecast ? (
                <p className="text-[12px] text-[#8B94A5] text-center py-8 animate-pulse">กำลังดึงข้อมูลพยากรณ์...</p>
              ) : forecastData ? (
                <div className="grid grid-cols-3 gap-2.5">
                  {forecastData.hours.map((h: any, i: number) => {
                    const r = getRainText(h.rain);
                    return (
                      <div key={i} className="bg-[#232732] border border-[#333946] rounded-xl p-2.5 text-center">
                        <span className="text-[9px] text-[#8B94A5] font-bold">+{i + 1} ชม.</span>
                        <div className="text-[18px] my-0.5">{r.icon}</div>
                        <div className={`text-[10px] font-bold ${r.color}`}>{h.rain.toFixed(1)} มม.</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ══ MAP TOOLS ══ */}
        <div className="absolute bottom-[150px] md:bottom-28 right-5 z-[900] flex flex-col space-y-2 pointer-events-auto">
          <div className="bg-[#1A1D24]/90 backdrop-blur-md border border-[#333946] rounded-xl flex flex-col overflow-hidden">
            <button onClick={handleGoHome} className="w-11 h-11 flex items-center justify-center text-[#8B94A5] hover:text-white hover:bg-[#2D323B] border-b border-[#333946]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </button>
            <button onClick={handleZoomIn} className="w-11 h-11 flex items-center justify-center text-[#8B94A5] hover:text-white hover:bg-[#2D323B] border-b border-[#333946]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m-6-6h12" /></svg>
            </button>
            <button onClick={handleZoomOut} className="w-11 h-11 flex items-center justify-center text-[#8B94A5] hover:text-white hover:bg-[#2D323B]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
            </button>
          </div>
        </div>

        {/* ══ LEGEND ══ */}
        <div className="absolute bottom-8 left-5 z-[900] pointer-events-auto items-end space-x-4 hidden lg:flex">
          <div className="onwr-panel px-3.5 py-4 w-[132px] bg-[#1A1D24]/95 backdrop-blur-md">
            <div className="text-center mb-4">
              <h3 className="text-[11.5px] font-bold text-[#E5E7EB]">Radar Composite</h3>
              <p className="text-[9px] text-[#8B94A5] mt-0.5">mm/hr</p>
            </div>
            <div className="flex pl-1">
              <div className="w-3 rounded-full mr-3.5 border border-[#333946]" style={{ background: 'linear-gradient(to bottom,#990099,#FF0000,#FF6600,#FFCC00,#33CC33,#0099FF,#00FFFF)', height: '160px' }} />
              <div className="flex flex-col justify-between h-[160px] text-[10px] font-mono text-[#8B94A5]">
                <span className="text-[#990099] font-bold">100+</span><span className="text-[#FF0000] font-bold">50</span><span className="text-[#FF6600] font-bold">25</span><span className="text-[#FFCC00] font-bold">10</span><span className="text-[#33CC33]">2.5</span><span className="text-[#0099FF]">1.0</span><span className="text-[#00FFFF]">0.1</span>
              </div>
            </div>
          </div>
          <div className="onwr-panel p-4 w-[290px] bg-[#1A1D24]/95 backdrop-blur-md">
            <h3 className="text-[12.5px] font-bold text-[#E5E7EB] mb-3">ระดับเสี่ยงรายหมู่บ้าน · ฝนสะสม 3 ชม.</h3>
            <div className="space-y-1.5">
              {LEVELS.map((l, i) => (
                <div key={l.key} className="flex items-center text-[10.5px]">
                  <span className="w-4 h-3 rounded mr-2.5 shrink-0" style={{ background: l.color }} />
                  <span className="text-[#E5E7EB] font-bold w-[62px]">{l.name}</span>
                  <span className="text-[#8B94A5] font-mono w-[68px]">{i === 0 ? '< 10' : l.max === Infinity ? '≥ 90' : `${LEVELS[i - 1].max}–${l.max}`} มม.</span>
                  <span className="text-[#8B94A5] truncate flex-1">{l.act}</span>
                </div>
              ))}
            </div>
            <p className="text-[9.5px] text-[#8B94A5] mt-3 pt-2.5 border-t border-[#333946]">* เกณฑ์ปรับตามดินอิ่มน้ำและความลาดชันอัตโนมัติ</p>
          </div>
        </div>

        {/* ══ TIMELINE PLAYER ══ */}
        <div className="absolute bottom-[88px] md:bottom-8 left-1/2 -translate-x-1/2 w-[92%] max-w-[580px] z-[1000] pointer-events-auto">
          <div className="onwr-panel py-3 px-5 flex items-center justify-between space-x-4 bg-[#1A1D24]/95 backdrop-blur-md">
            <div className="flex flex-col shrink-0">
              <span className="text-[12.5px] font-extrabold text-[#E5E7EB]">Radar Timeline</span>
              <div className="flex items-center mt-1 space-x-2">
                <span className={`w-2 h-2 rounded-full ${isNowcast ? 'bg-[#F59E0B]' : 'bg-[#4178F3]'} ${isPlaying ? 'animate-pulse' : ''}`} />
                <span className={`text-[10px] font-bold uppercase ${isNowcast ? 'text-[#F59E0B]' : 'text-[#4178F3]'}`}>{isNowcast ? 'Nowcast' : 'Past'}</span>
              </div>
            </div>
            <div className="flex items-center flex-1 space-x-3">
              <button
                onClick={() => { setIsPlaying(!isPlaying); if (!isPlaying && currentFrameIndex >= radarData?.frames?.length - 1) setCurrentFrameIndex(0); }}
                className="text-[#E5E7EB] hover:text-[#4178F3] bg-[#232732] p-1.5 rounded-full border border-[#333946] shrink-0"
              >
                {isPlaying ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg> : <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <div className="flex-1 relative flex items-center h-8">
                <input type="range" min="0" max={(radarData?.frames?.length || 1) - 1} value={currentFrameIndex}
                  onChange={(e) => { setIsPlaying(false); setCurrentFrameIndex(parseInt(e.target.value)); }}
                  className="w-full onwr-slider z-10" />
                {radarData && <div className="absolute h-4 w-[2px] bg-[#F59E0B] z-0 rounded-full" style={{ left: `${((radarData.pastCount - 1) / (radarData.frames.length - 1)) * 100}%` }} />}
              </div>
              <div className="text-[#4178F3] font-mono font-bold text-[14px] min-w-[62px] text-right bg-[#111319] px-2 py-1 rounded border border-[#333946] shrink-0">
                {activeFrame ? new Date(activeFrame.time * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </div>
            </div>
          </div>
        </div>

        {/* ══ MOBILE BOTTOM SHEET ══ */}
        <div className={`md:hidden absolute left-0 right-0 bottom-0 z-[1200] transition-transform duration-300 ${isSheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-72px)]'}`}>
          <div className="bg-[#1A1D24]/97 backdrop-blur-xl border-t border-[#333946] rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,.7)] max-h-[72vh] flex flex-col">
            <div onClick={() => setIsSheetOpen(!isSheetOpen)} className="py-3 px-5 cursor-pointer">
              <div className="w-10 h-1 bg-[#4B5563] rounded-full mx-auto mb-2.5" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ background: villageRisk[0]?.level.color || '#4178F3' }} />
                  <span className="text-[12.5px] font-bold text-[#E5E7EB] truncate">
                    {villageRisk.length ? `เสี่ยงสุด: ${villageRisk[0].name} ${villageRisk[0].rain3h.toFixed(1)} มม.` : 'กำลังประมวลผล...'}
                  </span>
                </div>
                <span className="text-[10px] text-[#8B94A5] shrink-0 ml-2">{isSheetOpen ? 'ปิด' : 'ดูทั้งหมด'}</span>
              </div>
            </div>
            <div className="px-4 pb-6 overflow-hidden">
              <div className="flex gap-2 mb-3">
                <button onClick={() => setShowRisk(!showRisk)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${showRisk ? 'bg-[#4178F3]/15 border-[#4178F3]/40 text-[#4178F3]' : 'border-[#333946] text-[#8B94A5]'}`}>ชั้นเสี่ยง</button>
                <button onClick={() => setShowRadar(!showRadar)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${showRadar ? 'bg-[#4178F3]/15 border-[#4178F3]/40 text-[#4178F3]' : 'border-[#333946] text-[#8B94A5]'}`}>เรดาร์</button>
                <button onClick={() => geoBlock && computeVillageRisk(geoBlock)} className="flex-1 py-2 rounded-lg text-[11px] font-bold border border-[#333946] text-[#D1D5DB]">รีเฟรช</button>
              </div>
              <RankTable height="h-[42vh]" />
            </div>
          </div>
        </div>
      </div>

      {/* ══ STATS MODAL ══ */}
      {isStatsModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-[90%] max-w-[520px] shadow-2xl overflow-hidden animate-fade-in">
            <div className="px-6 py-5 flex justify-between items-center border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-[17px] font-extrabold text-gray-800">สถิติการใช้งาน</h2>
              <button onClick={() => setIsStatsModalOpen(false)} className="text-gray-400 hover:text-white bg-gray-100 hover:bg-red-500 p-1.5 rounded-lg transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">
              {realStats.isLoading ? (
                <p className="py-12 text-center text-gray-500 text-[13px] font-bold animate-pulse">กำลังเชื่อมต่อฐานข้อมูล...</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { l: 'ยอดเข้าชมสะสม', v: realStats.totalVisits, u: 'ครั้ง', c: 'blue' },
                    { l: 'ผู้เข้าชมสะสม', v: realStats.totalUniqueVisitors, u: 'คน', c: 'emerald' },
                    { l: 'ยอดเข้าชมวันนี้', v: realStats.todayVisits, u: 'ครั้ง', c: 'purple' },
                    { l: 'ผู้เข้าชมวันนี้', v: realStats.todayUniqueVisitors, u: 'คน', c: 'orange' },
                  ].map((s) => (
                    <div key={s.l} className={`bg-${s.c}-50/80 border border-${s.c}-100 rounded-2xl p-4`}>
                      <p className={`text-[12px] text-${s.c}-600 font-bold mb-1`}>{s.l}</p>
                      <p className="text-[26px] font-black text-gray-800">{s.v.toLocaleString()}</p>
                      <p className="text-[11px] text-gray-500 mt-1">{s.u}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
