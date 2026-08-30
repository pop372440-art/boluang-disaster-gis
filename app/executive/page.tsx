'use client';
import React, { useState, useEffect } from 'react';

// ==========================================
// 🛠️ 1. Core Utilities
// ==========================================

const BO_LUANG_LAT = 18.1633;
const BO_LUANG_LNG = 98.3744;

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// 🛡️ API Resilience (Fault-Tolerance + Session Cache)
const fetchWithCache = async (url: string, cacheKey: string, timeoutMs = 8000) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data })); } catch (e) {}
    return { data, status: 'LIVE' };
  } catch (error) {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return { data: JSON.parse(cached).data, status: 'CACHED' };
    return { data: null, status: 'OFFLINE' };
  }
};

const median = (arr: number[]) => {
  const s = arr.filter(v => isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const probExceed = (arr: number[], threshold: number) => {
  const valid = arr.filter(v => isFinite(v));
  if (!valid.length) return 0;
  return (valid.filter(v => v >= threshold).length / valid.length) * 100;
};

// ==========================================
// 🌀 2. Storm Track Utilities (Flexible Parser)
// ==========================================

interface TrackPoint { lat: number; lon: number; time: string | null; wind: number; gust: number; pressure: number; }
interface RawTrack { name: string; source: string; points: TrackPoint[]; }
interface StormInfo {
  name: string; source: string; points: TrackPoint[]; closest: TrackPoint; closestIdx: number;
  nearestKm: number; etaHours: number | null; etaText: string; movement: string;
  windAtNearest: number; maxWindKmh: number; cat: { label: string; color: string };
}

// 📡 จุดสแกนแอ่งพายุ (Open-Meteo Tropical API ค้นหารัศมี ~300 กม./จุด → สแกนหลายจุดครอบคลุมแอ่ง)
const TROPICAL_CENTERS = [
  { name: 'boluang', lat: 18.16, lng: 98.37 },
  { name: 'andaman', lat: 10.0, lng: 95.0 },
  { name: 'gulfofthailand', lat: 8.0, lng: 103.5 },
  { name: 'southchinasea', lat: 15.0, lng: 115.0 },
  { name: 'luzon', lat: 18.0, lng: 124.0 },
  { name: 'vietnam', lat: 12.0, lng: 109.0 },
];

const toNum = (v: any) => { const n = parseFloat(v); return isFinite(n) ? n : NaN; };
const getLat = (o: any) => toNum(o?.lat ?? o?.latitude ?? o?.lat_deg ?? o?.y);
const getLon = (o: any) => toNum(o?.lon ?? o?.lng ?? o?.longitude ?? o?.lon_deg ?? o?.x);
const getTime = (o: any) => o?.time ?? o?.valid_time ?? o?.validTime ?? o?.datetime ?? o?.forecast_time ?? null;
const getWind = (o: any) => toNum(o?.wind ?? o?.wind_speed ?? o?.surface_wind_speed ?? o?.max_wind) || 0;

// 🔄 Flexible Parser: รองรับทั้ง array-of-objects และ parallel-arrays (กัน schema เปลี่ยน)
const extractTracks = (json: any, source: string): RawTrack[] => {
  const found: RawTrack[] = [];
  const seen = new Set<string>();
  const pushTrack = (rawPts: any[]) => {
    const pts: TrackPoint[] = rawPts
      .map(p => ({
        lat: getLat(p), lon: getLon(p), time: getTime(p),
        wind: getWind(p),
        gust: toNum(p?.gust ?? p?.wind_gust ?? p?.surface_wind_gust) || 0,
        pressure: toNum(p?.pressure ?? p?.sea_level_pressure ?? p?.mslp ?? p?.slp) || 0,
      }))
      .filter(p => isFinite(p.lat) && isFinite(p.lon) && Math.abs(p.lat) <= 90)
      .map(p => ({ ...p, lon: p.lon > 180 ? p.lon - 360 : p.lon }));
    if (pts.length < 2) return;
    const allTimes = pts.every(p => p.time && !isNaN(new Date(p.time).getTime()));
    if (allTimes) pts.sort((a, b) => new Date(a.time!).getTime() - new Date(b.time!).getTime());
    const sig = `${pts[0].lat.toFixed(1)}|${pts[0].lon.toFixed(1)}|${pts.length}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    const nameRaw = rawPts.find(p => p?.name || p?.storm_name || p?.storm_id || p?.cyclone_name);
    const name = nameRaw ? String(nameRaw.name ?? nameRaw.storm_name ?? nameRaw.storm_id ?? nameRaw.cyclone_name).toUpperCase() : `STORM #${found.length + 1}`;
    found.push({ name, source, points: pts });
  };
  const walk = (node: any, depth = 0) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
      const geoPts = node.filter((p: any) => p && typeof p === 'object' && !Array.isArray(p) && isFinite(getLat(p)) && isFinite(getLon(p)));
      if (geoPts.length >= 2) pushTrack(geoPts);
      else node.forEach(n => walk(n, depth + 1));
    } else if (typeof node === 'object') {
      const lats = node.lat ?? node.latitude ?? node.track_lat ?? node.lats;
      const lons = node.lon ?? node.longitude ?? node.track_lon ?? node.lng ?? node.lons;
      if (Array.isArray(lats) && Array.isArray(lons) && lats.length >= 2) {
        const times = node.time ?? node.track_time ?? node.times ?? [];
        const winds = node.wind ?? node.wind_speed ?? node.surface_wind_speed ?? node.track_surface_wind_speed ?? [];
        const gusts = node.gust ?? node.wind_gust ?? node.surface_wind_gust ?? [];
        const press = node.pressure ?? node.sea_level_pressure ?? node.mslp ?? [];
        pushTrack(lats.map((la: any, i: number) => ({
          lat: la, lon: lons[i], time: Array.isArray(times) ? times[i] : null,
          wind: Array.isArray(winds) ? winds[i] : 0, gust: Array.isArray(gusts) ? gusts[i] : 0,
          pressure: Array.isArray(press) ? press[i] : 0,
          name: node.name ?? node.storm_name,
        })));
      }
      Object.values(node).forEach(v => walk(v, depth + 1));
    }
  };
  walk(json);
  return found;
};

const dedupeTracks = (tracks: RawTrack[]) => {
  const map = new Map<string, RawTrack>();
  tracks.forEach(t => {
    const sig = `${t.points[0].lat.toFixed(1)}|${t.points[0].lon.toFixed(1)}`;
    const prev = map.get(sig);
    if (!prev || t.points.length > prev.points.length) map.set(sig, t);
  });
  return [...map.values()];
};

// 🏷️ หมวดพายุตามเกณฑ์ลม (กม./ชม.)
const stormCategory = (kmh: number) =>
  kmh >= 118 ? { label: 'ไต้ฝุ่น', color: '#ef4444' } :
  kmh >= 89 ? { label: 'พายุกำลังแรง', color: '#f97316' } :
  kmh >= 62 ? { label: 'พายุโซนร้อน', color: '#facc15' } :
  { label: 'หย่อมเขตร้อน', color: '#2dd4bf' };

const analyzeStorm = (t: RawTrack): StormInfo | null => {
  const pts = t.points.filter(p => p.lat > -10 && p.lat < 35 && p.lon > 85 && p.lon < 145);
  if (pts.length < 2) return null;
  let nearestKm = Infinity, closest = pts[0], closestIdx = 0;
  pts.forEach((p, i) => {
    const d = calculateDistance(BO_LUANG_LAT, BO_LUANG_LNG, p.lat, p.lon);
    if (d < nearestKm) { nearestKm = d; closest = p; closestIdx = i; }
  });
  const tMs = closest.time ? new Date(closest.time).getTime() : NaN;
  const etaHours = isFinite(tMs) ? Math.round((tMs - Date.now()) / 3.6e6) : null;
  const etaText = etaHours === null ? '—' : etaHours < 0 ? 'ผ่านจุดใกล้สุดแล้ว' : etaHours < 24 ? `อีก ${etaHours} ชม.` : `อีก ${(etaHours / 24).toFixed(1)} วัน`;
  const maxWindKmh = Math.max(...pts.map(p => p.wind || 0));
  const movement = closestIdx === 0 ? 'กำลังเคลื่อนออกห่างพื้นที่'
    : closestIdx >= pts.length - 1 ? 'กำลังเคลื่อนเข้าใกล้พื้นที่'
    : 'จะโคจรเข้าใกล้พื้นที่สุดแล้วเคลื่อนออก';
  return {
    name: t.name, source: t.source, points: pts, closest, closestIdx,
    nearestKm, etaHours, etaText, movement,
    windAtNearest: closest.wind || 0, maxWindKmh, cat: stormCategory(maxWindKmh),
  };
};

// 📡 ETL ข้อมูลพายุ: TMD Proxy → Open-Meteo Tropical (Fallback date ย้อน 1 วัน)
const fetchStormData = async () => {
  let tmdStatus = 'OFFLINE';
  const tmdTracks: RawTrack[] = [];
  try {
    const tmd = await fetchWithCache('/api/tmd/storm', 'storm_tmd_proxy');
    tmdStatus = tmd.data?.error ? 'OFFLINE' : tmd.status;
    if (tmd.data && !tmd.data.error) extractTracks(tmd.data.data ?? tmd.data, 'TMD').forEach(t => tmdTracks.push(t));
  } catch (e) {}

  let omStatus = 'OFFLINE';
  const omTracks: RawTrack[] = [];
  for (const d of ['latest', new Date(Date.now() - 86400000).toISOString().slice(0, 10)]) {
    const results = await Promise.all(TROPICAL_CENTERS.map(c =>
      fetchWithCache(`https://api.open-meteo.com/v1/tropical?latitude=${c.lat}&longitude=${c.lng}&windthreshold=33&date=${d}`, `storm_om_${c.name}_${d}`)));
    const got: RawTrack[] = [];
    results.forEach(r => { if (r.data && !r.data.error) extractTracks(r.data, 'ECMWF/GFS').forEach(t => omTracks.push(t)); });
    const live = results.some(r => r.status === 'LIVE');
    omStatus = live ? 'LIVE' : results.some(r => r.status === 'CACHED') ? 'CACHED' : 'OFFLINE';
    if (got.length || live) break;
  }

  // 🛡️ Unit Guard: หากค่าลมทั้งหมด < 40 ถือว่าเป็น m/s → แปลงเป็น กม./ชม.
  const all = [...tmdTracks, ...omTracks];
  const gmax = Math.max(0, ...all.flatMap(t => t.points.map(p => p.wind)));
  if (gmax > 0 && gmax < 40) all.forEach(t => t.points.forEach(p => { p.wind *= 3.6; p.gust *= 3.6; }));

  return { tracks: dedupeTracks(all), tmdStatus, omStatus };
};

// ==========================================
// 🚀 3. Main Executive Dashboard
// ==========================================

export default function ExecutiveDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [apiHealth, setApiHealth] = useState({ onwr: 'LOAD', tmd: 'LOAD', deepmind: 'LOAD', storm: 'LOAD', tmdStorm: 'LOAD' });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const stormPromise = fetchStormData();

        // 📡 ETL: Ground Truth + Deterministic + Ensemble
        const [onwrRes, forecastRes] = await Promise.all([
          fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', 'exec_onwr_rain'),
          fetchWithCache(
            `https://api.open-meteo.com/v1/forecast?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
            `&current=temperature_2m,wind_speed_10m,precipitation,weather_code` +
            `&daily=precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max&timezone=Asia%2FBangkok&forecast_days=15`,
            'exec_tmd_forecast'),
        ]);

        const ensBase = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
          `&daily=precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max&timezone=Asia%2FBangkok&forecast_days=15`;
        const candidates = [
          { url: `${ensBase}&models=google_weathernext2_ensemble`, key: 'exec_ens_gwn2', label: 'WEATHERNEXT-2 ENS' },
          { url: `${ensBase}&models=google_weathernext_15days_ensemble`, key: 'exec_ens_gwn15', label: 'WEATHERNEXT-15D ENS' },
          { url: ensBase, key: 'exec_ens_default', label: 'OPEN-METEO ENS' },
        ];
        const ensResults = await Promise.all(candidates.map(c => fetchWithCache(c.url, c.key)));
        let ensRes = ensResults[0], ensembleModel = '—';
        for (let i = 0; i < candidates.length; i++) {
          const d = ensResults[i]?.data;
          if (d && !d.error && d.daily?.time?.length > 7) { ensRes = ensResults[i]; ensembleModel = candidates[i].label; break; }
        }

        // 🌀 Storm Track Analytics
        const stormRes = await stormPromise;
        const stormInfos = stormRes.tracks.map(analyzeStorm).filter((s): s is StormInfo => !!s)
          .sort((a, b) => a.nearestKm - b.nearestKm);
        const stormTop = stormInfos.find(s => s.nearestKm <= 1500) || null;

        setApiHealth({ onwr: onwrRes.status, tmd: forecastRes.status, deepmind: ensRes.status, storm: stormRes.omStatus, tmdStorm: stormRes.tmdStatus });

        // 🔄 Transform: ONWR Ground Truth
        let actualRain24h = 0;
        if (onwrRes.data) {
          const arrData = onwrRes.data?.data?.data || onwrRes.data?.data || [];
          let minDistance = Infinity;
          arrData.forEach((station: any) => {
            const lat = parseFloat(station?.station?.tele_station_lat || station?.lat);
            const lng = parseFloat(station?.station?.tele_station_long || station?.lng);
            if (lat && lng) {
              const dist = calculateDistance(BO_LUANG_LAT, BO_LUANG_LNG, lat, lng);
              if (dist < minDistance) { minDistance = dist; actualRain24h = parseFloat(station?.rain_24h) || 0; }
            }
          });
        }

        const forecast = forecastRes.data && !forecastRes.data.error ? forecastRes.data : null;
        const ens = ensRes.data && !ensRes.data.error ? ensRes.data : null;

        if (forecast && ens) {
          const currentTemp = forecast.current?.temperature_2m ?? '—';
          const currentWind = forecast.current?.wind_speed_10m ?? '—';
          const liveRainIntensity = forecast.current?.precipitation || 0;
          const soilMoisture = Math.min(100, (actualRain24h / 80) * 100 + (liveRainIntensity > 0 ? 30 : 0));

          // ===== 🌐 ENSEMBLE ANALYTICS =====
          const daily = ens.daily;
          const N = Math.min(daily.time.length, 15);
          const rainKeys = Object.keys(daily).filter(k => k.startsWith('precipitation_sum') && k !== 'precipitation_sum');
          const gustKeys = Object.keys(daily).filter(k => k.startsWith('wind_gusts_10m_max') && k !== 'wind_gusts_10m_max');
          const isEnsemble = rainKeys.length > 0;
          const rKeys = isEnsemble ? rainKeys : ['precipitation_sum'];
          const gKeys = isEnsemble ? gustKeys : [];

          const stats = Array.from({ length: N }, (_, d) => {
            const rains = rKeys.map(k => daily[k]?.[d]).filter((v: any) => isFinite(v));
            const gusts = gKeys.map(k => daily[k]?.[d]).filter((v: any) => isFinite(v));
            return {
              date: daily.time[d],
              rainMedian: median(rains), rainMin: rains.length ? Math.min(...rains) : 0, rainMax: rains.length ? Math.max(...rains) : 0,
              pRain20: probExceed(rains, 20), pRain50: probExceed(rains, 50), pRain90: probExceed(rains, 90),
              gustMax: gusts.length ? Math.max(...gusts) : 0,
              pGust40: probExceed(gusts, 40), pGust60: probExceed(gusts, 60),
            };
          }).map(s => ({ ...s, signal: Math.min(100, Math.max(s.pRain50, s.pGust40 * 0.9, s.pRain90 * 0.8)) }));

          const peakSignalDay = stats.reduce((a, b) => (b.signal > a.signal ? b : a), stats[0]);
          const peakRainDay = stats.reduce((a, b) => (b.rainMedian > a.rainMedian ? b : a), stats[0]);
          const peakGust = Math.max(...stats.map(s => s.gustMax));
          const w1Max = Math.max(...stats.slice(0, 7).map(s => s.rainMedian));
          const w2Max = stats.length > 7 ? Math.max(...stats.slice(7).map(s => s.rainMedian)) : 0;
          const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

          const maxRain7Days = Math.max(...(forecast.daily?.precipitation_sum?.slice(0, 7) || [0]));
          const spread = peakRainDay.rainMax - peakRainDay.rainMin;
          const confidence = peakRainDay.rainMax > 0 ? Math.max(0, Math.round((1 - spread / peakRainDay.rainMax) * 100)) : 100;

          // ===== 🌀 STORM-TRACK SIGNALS (เพิ่มใหม่) =====
          const stormLine = stormTop
            ? `🌀 ตรวจพบ "${stormTop.name}" (${stormTop.cat.label}) — จุดใกล้บ่อหลวงสุด ~${Math.round(stormTop.nearestKm)} กม. • ${stormTop.movement} • เวลา ${stormTop.etaText} • ลมรอบศูนย์สูงสุด ${Math.round(stormTop.maxWindKmh)} กม./ชม.`
            : '';
          const etaOk = (s: StormInfo, h: number) => s.etaHours === null || (s.etaHours >= 0 && s.etaHours <= h);
          const stormCritical = !!(stormTop && stormTop.nearestKm <= 400 && stormTop.windAtNearest >= 62 && etaOk(stormTop, 72));
          const stormWarning = !!(stormTop && stormTop.nearestKm <= 600 && stormTop.windAtNearest >= 62 && etaOk(stormTop, 120));
          const stormWatch = !!(stormTop && stormTop.nearestKm <= 900);

          // ===== 🎯 RULE ENGINE: Track + Rain Fusion =====
          let status = 'NORMAL', tier = 'ปกติ';
          let aiInsight = `AI Ensemble ประเมินโครงสร้างชั้นบรรยากาศ 15 วันล่วงหน้า: ไม่พบสัญญาณฝนระลอกรุนแรงก่อตัว`;
          let actions = ['อัปเดตสถานการณ์ปกติให้ประชาชนทราบ', 'บำรุงรักษาระบบระบายน้ำตามแผนประจำ'];

          const hitCritical = stats.some(s => s.pRain90 >= 30 || s.pGust60 >= 30 || s.rainMax >= 150);
          const hitWarning7 = stats.slice(0, 7).some(s => s.pRain50 >= 40 || s.pGust40 >= 40 || s.rainMedian >= 60);
          const hitWatch = stats.some(s => s.pRain50 >= 20 || s.pGust40 >= 20 || s.rainMedian >= 25);
          const groundOverride = actualRain24h > 90 || liveRainIntensity > 10 || soilMoisture > 85;

          if (groundOverride) {
            status = 'CRITICAL'; tier = 'วิกฤต (Ground Override)';
            aiInsight = `🚨 ข้อมูลตรวจวัดจริงยืนยันฝนสะสม ${actualRain24h} มม./24ชม. ดินอุ้มน้ำ ${Math.round(soilMoisture)}% — Override แบบจำลอง AI ทันที`;
            actions = ['🚨 เปิดศูนย์ EOC เต็มรูปแบบ ประกาศเบิกงบฉุกเฉิน', 'อพยพประชาชนโซนเชิงเขา/ริมลำห้วยทันที', 'สั่งเครื่องจักรหนักแสตนด์บาย'];
          } else if (stormCritical || hitCritical) {
            status = 'CRITICAL'; tier = stormCritical ? 'วิกฤต (เส้นทางพายุ)' : 'วิกฤต (AI Ensemble)';
            aiInsight = stormCritical
              ? `🚨 เส้นทางพายุ (Track) ชี้เข้าหาพื้นที่! ระบบประสานกรอบประกาศ กรมอุตุนิยมวิทยา ให้เตรียมมาตรการทันที`
              : `AI ตรวจพบฝนระลอกรุนแรง พีควันที่ ${fmtDate(peakSignalDay.date)} — P(ฝน≥90มม.) ${Math.round(peakSignalDay.pRain90)}% | Worst-case ${peakSignalDay.rainMax.toFixed(0)} มม.`;
            actions = stormCritical
              ? ['🚨 ประกาศเตือนภัยตามเส้นทางพายุ ล่วงหน้า 48 ชม.', 'ห้ามออกเรือ/ปิดจุดท่องเที่ยวริมน้ำตามประกาศ ลท.', 'เปิดจุดพักพิง + ประสาน ปภ. ชุดสนาม']
              : ['🚨 ประกาศเตือนภัยล่วงหน้า 48 ชม. ทั้งตำบล', 'เปิดศูนย์ EOC / เตรียมจุดพักพิง', 'ตรวจลำห้วย 7 จุดเสี่ยงดินถล่ม พร้อมเครื่องจักร'];
          } else if (stormWarning || hitWarning7) {
            status = 'WARNING'; tier = 'เตือนภัย';
            aiInsight = stormWarning
              ? `⚠️ พายุเข้ารัศมี 600 กม. — เฝ้าระวังลมแรงและฝนตกหนักจากแถบพายุภายนอก (Outer Rainbands)`
              : `AI ประเมินฝนระลอกกิจกรรมสูง พีควันที่ ${fmtDate(peakRainDay.date)} (P(ฝน≥50มม.) ${Math.round(peakRainDay.pRain50)}% | Consensus ${confidence}%)`;
            actions = ['เสียงตามสายแจ้งเตือนพื้นที่ริมลำห้วย/เชิงเขา', 'ลาดตระเวนวัดระดับน้ำ 2 รอบ/วัน', 'ทดสอบเครื่องสูบน้ำ + ยืนยันความพร้อม อสม.'];
          } else if (stormWatch || hitWatch) {
            status = 'WATCH'; tier = 'เฝ้าระวังล่วงหน้า';
            aiInsight = stormWatch
              ? `🌀 พายุอยู่ในรัศมีเฝ้าตรวจ 900 กม. — ติดตามกรอบ Track ทุก 6 ชม.`
              : `AI ตรวจจับสัญญาณเบื้องต้นช่วงวันที่ 8–15: P(ฝน≥50มม.) สูงสุด ${Math.round(Math.max(...stats.map(s => s.pRain50)))}% ช่วง ${fmtDate(peakSignalDay.date)}`;
            actions = ['ประชุมเฝ้าระวังอ้างอิงข้อมูล AI + Track', 'สำรองเชื้อเพลิง/ตรวจเครื่องจักรและระบบระบายน้ำ', 'เตรียมประกาศแจ้งเตือนฉบับร่าง'];
          }

          const crossCheck = Math.abs(maxRain7Days - w1Max) <= 15 ? 'สอดคล้องกัน' : 'คลาดเคลื่อน — ใช้ Worst-case วางแผน';

          setData({
            actualRain24h, currentTemp, currentWind, liveRainIntensity, soilMoisture,
            stats, peakSignalDay, peakRainDay, peakGust, w1Max, w2Max,
            isEnsemble, memberCount: rKeys.length, ensembleModel, confidence, stormCount: stormInfos.length,
            storm: { infos: stormInfos.slice(0, 5), top: stormTop },
            ai: { status, tier, aiInsight, stormInsight: stormLine, actions, crossCheck },
          });
        }
      } catch (e) {
        console.error('ETL Pipeline Error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 900000);
    return () => clearInterval(interval);
  }, []);

  // ============ 🎨 UI ============
  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-[#0a1112] text-white">
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 border-4 border-[#2dd4bf] border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_#2dd4bf]"></div>
        <span className="font-mono text-[#2dd4bf] text-lg tracking-widest animate-pulse">Initializing WeatherLab Protocol...</span>
      </div>
    </div>
  );
  if (!data) return (
    <div className="flex h-screen items-center justify-center bg-[#0a1112] text-white">
      <div className="text-center border border-red-500/40 bg-red-500/5 rounded-2xl p-8 max-w-md">
        <div className="text-4xl mb-3">📡</div>
        <h2 className="text-red-400 font-bold text-xl mb-2">OFFLINE MODE</h2>
        <p className="text-gray-400 text-sm">แหล่งข้อมูลไม่ตอบสนองและไม่มี Cache — ระบบจะลองใหม่อัตโนมัติ</p>
      </div>
    </div>
  );

  const getTheme = (s: string) => ({
    CRITICAL: { border: 'border-red-500/50', bg: 'bg-[#ef4444]', text: 'text-[#f87171]', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.25)]', label: 'วิกฤต' },
    WARNING: { border: 'border-yellow-500/50', bg: 'bg-[#facc15]', text: 'text-[#facc15]', glow: 'shadow-[0_0_30px_rgba(250,204,21,0.15)]', label: 'เตือนภัย' },
    WATCH: { border: 'border-orange-500/50', bg: 'bg-[#fb923c]', text: 'text-[#fb923c]', glow: 'shadow-[0_0_30px_rgba(251,146,60,0.15)]', label: 'เฝ้าระวัง' },
  } as any)[s] || { border: 'border-[#2dd4bf]/40', bg: 'bg-[#0f766e]', text: 'text-[#2dd4bf]', glow: 'shadow-[0_0_20px_rgba(45,212,191,0.1)]', label: 'ปกติ' };
  const theme = getTheme(data.ai.status);
  const fmtD = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

  const HealthBadge = ({ label, status }: { label: string, status: string }) => {
    const c = status === 'LIVE' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      : status === 'CACHED' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
      : 'text-red-400 bg-red-500/10 border-red-500/30';
    return (
      <div className={`flex items-center px-2.5 py-1 rounded border ${c} text-[9px] font-mono font-bold tracking-wider`}>
        <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${status === 'LIVE' ? 'bg-emerald-400 animate-pulse' : status === 'CACHED' ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
        <span className="whitespace-nowrap">{label}: {status}</span>
      </div>
    );
  };

  // 🗺️ SVG Mini-Map: เส้นทางพายุ + วงอันตรายรอบบ่อหลวง (ไม่ต้องติดตั้ง Library)
  const StormMap = ({ storms }: { storms: StormInfo[] }) => {
    const W = 760, H = 400, LON0 = 90, LON1 = 138, LAT0 = 0, LAT1 = 32;
    const px = (lon: number) => ((lon - LON0) / (LON1 - LON0)) * W;
    const py = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * H;
    const cities = [
      { n: 'บ่อหลวง', lat: 18.1633, lon: 98.3744, main: true },
      { n: 'เชียงใหม่', lat: 18.79, lon: 98.98 }, { n: 'กรุงเทพฯ', lat: 13.75, lon: 100.52 },
      { n: 'ย่างกุ้ง', lat: 16.87, lon: 96.20 }, { n: 'ฮานอย', lat: 21.03, lon: 105.85 },
      { n: 'เว้', lat: 16.46, lon: 107.60 }, { n: 'โฮจิมินห์', lat: 10.82, lon: 106.63 },
      { n: 'มะนิลา', lat: 14.60, lon: 120.98 }, { n: 'ไทเป', lat: 25.03, lon: 121.56 },
    ];
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-[#0a1112] border border-gray-800">
        {[95, 100, 105, 110, 115, 120, 125, 130, 135].map(lo => (
          <g key={lo}>
            <line x1={px(lo)} y1={0} x2={px(lo)} y2={H} stroke="#1c2a2d" strokeWidth="1" />
            <text x={px(lo) + 3} y={H - 6} fill="#3f555a" fontSize="9" fontFamily="monospace">{lo}°E</text>
          </g>
        ))}
        {[5, 10, 15, 20, 25, 30].map(la => (
          <g key={la}>
            <line x1={0} y1={py(la)} x2={W} y2={py(la)} stroke="#1c2a2d" strokeWidth="1" />
            <text x={6} y={py(la) - 4} fill="#3f555a" fontSize="9" fontFamily="monospace">{la}°N</text>
          </g>
        ))}
        {/* วงอันตราย 300/600/900 กม. รอบบ่อหลวง */}
        {[300, 600, 900].map(km => (
          <ellipse key={km} cx={px(BO_LUANG_LNG)} cy={py(BO_LUANG_LAT)}
            rx={(km / 111) * (W / (LON1 - LON0))} ry={(km / 111) * (H / (LAT1 - LAT0))}
            fill="none" stroke={km === 300 ? '#ef4444' : km === 600 ? '#f97316' : '#facc15'}
            strokeOpacity={0.3} strokeDasharray="4 4" strokeWidth="1" />
        ))}
        {cities.map(c => (
          <g key={c.n}>
            <circle cx={px(c.lon)} cy={py(c.lat)} r={c.main ? 4 : 2.5} fill={c.main ? '#2dd4bf' : '#64748b'} />
            <text x={px(c.lon) + 6} y={py(c.lat) + 3} fill={c.main ? '#2dd4bf' : '#64748b'} fontSize={c.main ? 12 : 10} fontWeight={c.main ? 'bold' : 'normal'}>{c.n}</text>
          </g>
        ))}
        {storms.map((s, si) => (
          <g key={si}>
            <polyline fill="none" stroke="#a855f7" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="5 3"
              points={s.points.map(p => `${px(p.lon)},${py(p.lat)}`).join(' ')} />
            {s.points.map((p, pi) => {
              const c = stormCategory(p.wind || 0);
              const isClosest = pi === s.closestIdx;
              return <circle key={pi} cx={px(p.lon)} cy={py(p.lat)}
                r={isClosest ? 6 : (p.wind || 0) >= 118 ? 5 : (p.wind || 0) >= 62 ? 4 : 3}
                fill={c.color} fillOpacity={0.9} stroke={isClosest ? '#fff' : 'none'} strokeWidth={1.5} />;
            })}
            <circle cx={px(s.closest.lon)} cy={py(s.closest.lat)} r={11} fill="none" stroke="#ef4444" strokeWidth={1.5}>
              <animate attributeName="r" values="8;14;8" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <text x={Math.min(px(s.closest.lon) + 14, W - 150)} y={py(s.closest.lat) - 8} fill="#f87171" fontSize={11} fontFamily="monospace" fontWeight="bold">
              {s.name} • {Math.round(s.nearestKm)} กม.
            </text>
          </g>
        ))}
        {storms.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="#475569" fontSize={14}>
            ไม่พบพายุหมุนเขตร้อนในแอ่งเฝ้าตรวจ — สแกนอัตโนมัติทุก 15 นาที
          </text>
        )}
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a1112] p-4 md:p-8 font-sans text-gray-100 overflow-x-hidden">
      {/* ===== Header ===== */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-6 pb-4 border-b border-gray-800 gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white flex flex-wrap items-center gap-x-3">
            <span>EXECUTIVE</span> <span className={theme.text}>DASHBOARD</span>
            <span className={`px-3 py-1 border ${theme.border} ${theme.bg} text-white text-xs sm:text-sm font-bold rounded-full ${theme.glow}`}>{theme.label}</span>
            {data.storm?.top && (
              <span className="px-3 py-1 bg-orange-500/20 border border-orange-500 text-orange-400 text-xs font-bold rounded-full animate-pulse">
                🌀 {data.storm.top.name} • {Math.round(data.storm.top.nearestKm)} กม.
              </span>
            )}
          </h1>
          <p className="text-[#2dd4bf] mt-2 text-[10px] sm:text-xs tracking-widest font-mono">DEEPMIND ENSEMBLE + TROPICAL CYCLONE TRACK • เทศบาลตำบลบ่อหลวง จ.เชียงใหม่</p>
        </div>
        <div className="flex flex-col items-start lg:items-end">
          <div className="text-3xl sm:text-4xl font-mono font-bold text-white tracking-widest">
            {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-xs sm:text-sm text-gray-400 mt-1 mb-2">{currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <div className="flex flex-wrap gap-2">
            <HealthBadge label="ONWR (GROUND)" status={apiHealth.onwr} />
            <HealthBadge label="TMD (DETERMIN)" status={apiHealth.tmd} />
            <HealthBadge label="AI (DEEPMIND)" status={apiHealth.deepmind} />
            <HealthBadge label="TC TRACK (OM)" status={apiHealth.storm} />
            <HealthBadge label="TMD (PROXY)" status={apiHealth.tmdStorm} />
          </div>
        </div>
      </div>

      {/* ===== KPI Row A ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-4">
        <div className={`bg-[#111a1c] border ${theme.border} ${theme.glow} rounded-2xl p-5 md:p-6`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">🌩️ สัญญาณพายุ 15 วัน</h3>
            <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30">AI ENSEMBLE</span>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-4xl md:text-5xl font-black ${theme.text}`}>{Math.round(data.peakSignalDay.signal)}%</span>
            <span className="text-sm text-gray-500 font-bold">พีค {fmtD(data.peakSignalDay.date)}</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-mono">P(ฝน≥50มม.) {Math.round(data.peakSignalDay.pRain50)}% • P(ลม≥40) {Math.round(data.peakSignalDay.pGust40)}%</p>
        </div>
        <div className="bg-[#111a1c] border border-gray-800 rounded-2xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">🌧️ ฝนพีค (Median)</h3>
            <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30">{data.memberCount} สมาชิก</span>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl md:text-5xl font-black text-white">{data.peakRainDay.rainMedian.toFixed(0)}</span>
            <span className="text-sm text-gray-500 font-bold">มม. • {fmtD(data.peakRainDay.date)}</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-mono">Worst-case {data.peakRainDay.rainMax.toFixed(0)} มม. • Consensus {data.confidence}%</p>
        </div>
        <div className="bg-[#111a1c] border border-gray-800 rounded-2xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">💨 ลมกระโชกสูงสุด</h3>
            <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30">ENSEMBLE</span>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-4xl md:text-5xl font-black ${data.peakGust >= 60 ? 'text-red-400' : data.peakGust >= 40 ? 'text-yellow-400' : 'text-white'}`}>{data.peakGust.toFixed(0)}</span>
            <span className="text-sm text-gray-500 font-bold">กม./ชม.</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-mono">W2 (วัน 8–15) ฝน Median สูงสุด {data.w2Max.toFixed(0)} มม.</p>
        </div>
      </div>

      {/* ===== KPI Row B: Ground Truth ===== */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { icon: '📡', label: 'ฝน ณ วินาทีนี้', val: data.liveRainIntensity.toFixed(1), unit: 'มม./ชม.', alert: data.liveRainIntensity > 0 },
          { icon: '🇹🇭', label: 'ฝนสะสม 24 ชม. (จริง)', val: data.actualRain24h, unit: 'มม.', alert: data.actualRain24h > 20 },
          { icon: '⛰️', label: 'ดัชนีดินอุ้มน้ำ', val: `${Math.round(data.soilMoisture)}%`, unit: '', alert: data.soilMoisture > 75 },
        ].map((k, i) => (
          <div key={i} className={`bg-[#111a1c] border ${k.alert ? 'border-red-500/50' : 'border-gray-800'} rounded-2xl p-4 md:p-5`}>
            <h3 className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{k.icon} {k.label}</h3>
            <div className="flex items-baseline space-x-1">
              <span className={`text-2xl md:text-3xl font-black ${k.alert ? 'text-red-400 animate-pulse' : 'text-white'}`}>{k.val}</span>
              <span className="text-[10px] md:text-xs text-gray-500 font-bold">{k.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 🌀 NEW: Storm Track Intelligence Panel ===== */}
      <section className={`bg-[#111a1c] border ${data.storm?.top ? 'border-orange-500/40 shadow-[0_0_25px_rgba(249,115,22,0.1)]' : 'border-gray-800'} rounded-3xl p-6 md:p-8 mb-6`}>
        <div className="flex flex-wrap items-center justify-between mb-5 gap-2">
          <h2 className="text-lg md:text-xl font-bold text-white flex items-center">
            <span className="text-2xl mr-3">🌀</span> Storm Track Intelligence
            <span className="ml-3 text-[10px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-1 rounded">BEST TRACK + ECMWF/GFS (OPEN-METEO) • TMD (PROXY)</span>
          </h2>
          <span className="text-[9px] bg-gray-800 text-gray-400 px-2 py-1 rounded border border-gray-700">พบ {data.stormCount} เส้นทางในแอ่ง</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8"><StormMap storms={data.storm.infos} /></div>
          <div className="lg:col-span-4 flex flex-col gap-4">
            {data.storm.top ? (
              <div className="bg-[#0a1112] border border-orange-500/30 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold text-lg">{data.storm.top.name}</h3>
                  <span className="text-[10px] px-2 py-1 rounded border font-bold" style={{ color: data.storm.top.cat.color, borderColor: data.storm.top.cat.color + '66', background: data.storm.top.cat.color + '1a' }}>{data.storm.top.cat.label}</span>
                </div>
                <div className="flex items-baseline space-x-2 mb-1">
                  <span className="text-4xl font-black text-orange-400">{Math.round(data.storm.top.nearestKm)}</span>
                  <span className="text-sm text-gray-500 font-bold">กม. จากบ่อหลวง</span>
                </div>
                <p className="text-xs text-gray-300 font-mono leading-relaxed">
                  🧭 {data.storm.top.movement}<br />
                  ⏱️ ETA: {data.storm.top.etaText}<br />
                  💨 ลมรอบศูนย์ ณ จุดใกล้สุด {Math.round(data.storm.top.windAtNearest)} กม./ชม.<br />
                  📐 Track Points: {data.storm.top.points.length} จุด
                </p>
              </div>
            ) : (
              <div className="bg-[#0a1112] border border-emerald-500/20 rounded-2xl p-5 flex-1 flex flex-col justify-center">
                <div className="text-3xl mb-2">✅</div>
                <h3 className="text-emerald-400 font-bold mb-1">ไม่มีภัยพายุหมุนเขตร้อน</h3>
                <p className="text-xs text-gray-500 leading-relaxed">ระบบสแกน 6 จุดครอบคลุมแอ่งแปซิฟิกตะวันตก–อันดามัน ไม่พบพายุในรัศมีเฝ้าตรวจ 1,500 กม. แผงนี้จะเปิดใช้งานอัตโนมัติเมื่อพายุก่อตัว</p>
              </div>
            )}
            {data.storm.infos.length > 0 && (
              <div className="space-y-2">
                {data.storm.infos.map((s: StormInfo, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-[#0a1112] border border-gray-800 rounded-xl px-4 py-2.5 text-xs">
                    <span className="flex items-center font-bold text-gray-200">
                      <span className="w-2.5 h-2.5 rounded-full mr-2" style={{ background: s.cat.color }}></span>{s.name}
                    </span>
                    <span className="text-gray-500 font-mono">{s.cat.label} • {Math.round(s.nearestKm)} กม. • {s.etaText}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-[9px] font-mono text-gray-500">
              {['หย่อม <62', 'โซนร้อน 62–88', 'กำลังแรง 89–117', 'ไต้ฝุ่น ≥118'].map((l, i) => (
                <span key={l} className="flex items-center px-2 py-1 rounded border border-gray-800">
                  <span className="w-2 h-2 rounded-full mr-1.5" style={{ background: ['#2dd4bf', '#facc15', '#f97316', '#ef4444'][i] }}></span>{l} กม./ชม.
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Main Grid ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-6 flex flex-col gap-6">
          <div className={`border ${theme.border} bg-[#111a1c] ${theme.glow} rounded-3xl p-6 md:p-8`}>
            <div className="flex items-center space-x-4 mb-5 pb-4 border-b border-gray-800">
              <div className="w-12 h-12 rounded-full bg-[#0a1112] flex items-center justify-center text-2xl border border-gray-700">🧠</div>
              <div>
                <h2 className={`text-lg md:text-2xl font-bold ${theme.text}`}>AI Fusion Insight</h2>
                <span className="text-xs text-gray-400 font-mono tracking-widest">MODEL: {data.ensembleModel} • {data.isEnsemble ? `PROBABILISTIC (${data.memberCount} MEMBERS)` : 'SINGLE-RUN'}</span>
              </div>
            </div>
            {data.ai.stormInsight && (
              <p className="text-sm md:text-base text-orange-300 leading-relaxed border-l-2 border-orange-500/60 pl-4 mb-4 bg-orange-500/5 p-3 rounded-r-lg">{data.ai.stormInsight}</p>
            )}
            <p className={`text-sm md:text-base text-gray-100 leading-relaxed border-l-2 ${data.ai.status === 'NORMAL' ? 'border-[#2dd4bf]/40' : 'border-red-500/60'} pl-4`}>{data.ai.aiInsight}</p>
            <div className="mt-4 bg-[#0a1112] rounded-xl border border-gray-800 p-3 font-mono text-[10px] text-gray-500">
              [LOG] TC Track Sweep (6 Centers)... {apiHealth.storm}<br />
              [LOG] TMD Proxy... {apiHealth.tmdStorm}<br />
              [LOG] Cross-validation TMD×DeepMind: {data.ai.crossCheck}
            </div>
          </div>
          <div className={`border ${data.ai.status === 'CRITICAL' ? 'border-red-500 bg-[#3f0f0f]' : 'border-gray-800 bg-[#111a1c]'} rounded-3xl p-6 md:p-8`}>
            <h3 className={`text-lg md:text-xl font-bold mb-5 flex items-center ${data.ai.status === 'CRITICAL' ? 'text-red-400' : 'text-white'}`}>
              <span className="text-2xl mr-3">🎯</span> ข้อเสนอแนะเชิงรุก (Proactive Actions)
            </h3>
            <ul className="space-y-3">
              {data.ai.actions.map((a: string, i: number) => (
                <li key={i} className="flex items-center bg-[#0a1112]/80 p-4 rounded-xl border border-gray-700/50 hover:border-[#2dd4bf]/50 transition-colors">
                  <div className={`w-3 h-3 rounded-full ${theme.bg} mr-4 ${data.ai.status !== 'NORMAL' ? 'animate-pulse' : ''}`}></div>
                  <span className="text-sm md:text-base text-gray-100 font-semibold">{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="xl:col-span-6 flex flex-col gap-6">
          <div className="bg-[#111a1c] border border-purple-500/30 rounded-3xl p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between mb-3">
              <h4 className="text-xs md:text-sm text-purple-400 font-bold uppercase tracking-widest">🔮 Ensemble Cone of Uncertainty</h4>
              <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-1 rounded border border-purple-500/30">แถบม่วง = Min–Max • เส้นเขียว = Median</span>
            </div>
            <svg viewBox="0 0 600 150" className="w-full h-44">
              {(() => {
                const W = 600, H = 150, P = 10, N = data.stats.length;
                const maxV = Math.max(...data.stats.map((s: any) => s.rainMax), 10);
                const x = (i: number) => P + i * ((W - 2 * P) / Math.max(N - 1, 1));
                const y = (v: number) => H - P - (v / maxV) * (H - 2 * P);
                const top = data.stats.map((s: any, i: number) => `${x(i)},${y(s.rainMax)}`).join(' L ');
                const bot = [...data.stats].reverse().map((s: any, ri: number) => `${x(N - 1 - ri)},${y(s.rainMin)}`).join(' L ');
                const medLine = data.stats.map((s: any, i: number) => `${x(i)},${y(s.rainMedian)}`).join(' L ');
                const pk = data.peakRainDay, pkIdx = data.stats.indexOf(pk);
                return (<g>
                  <defs><linearGradient id="ensBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" /><stop offset="100%" stopColor="#a855f7" stopOpacity="0.05" />
                  </linearGradient></defs>
                  <path d={`M ${top} L ${bot} Z`} fill="url(#ensBand)" stroke="#a855f7" strokeWidth="0.5" strokeOpacity="0.4" />
                  <polyline points={medLine} fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeLinejoin="round" />
                  <circle cx={x(pkIdx)} cy={y(pk.rainMedian)} r="4" fill="#2dd4bf" />
                  <text x={Math.min(x(pkIdx), W - 90)} y={Math.max(y(pk.rainMedian) - 8, 14)} fill="#e2e8f0" fontSize="10" fontFamily="monospace">พีค {fmtD(pk.date)} • {pk.rainMedian.toFixed(0)} มม.</text>
                  <text x={P} y={H - 2} fill="#64748b" fontSize="8" fontFamily="monospace">วันนี้</text>
                  <text x={W - 70} y={H - 2} fill="#64748b" fontSize="8" fontFamily="monospace">+{N - 1} วัน</text>
                </g>);
              })()}
            </svg>
          </div>

          <div className="bg-[#111a1c] border border-gray-800 rounded-3xl p-6 md:p-8">
            <div className="mb-5">
              <h3 className="text-base md:text-lg font-bold text-white flex items-center"><span className="mr-2">📊</span> พยากรณ์ฝน 15 วัน (Median)</h3>
              <p className="text-[10px] text-gray-500 mt-1 ml-6">โซนม่วง = กรอบ AI ระยะกลาง (วัน 8–15) • เส้นแดง = Worst-case</p>
            </div>
            <div className="relative h-56">
              <div className="absolute right-0 top-0 bottom-8 w-[53%] bg-purple-500/5 border-x border-purple-500/20 rounded pointer-events-none"></div>
              <div className="relative flex items-end justify-between h-full gap-0.5 pb-8">
                {data.stats.map((s: any, idx: number) => {
                  const maxV = Math.max(...data.stats.map((x: any) => x.rainMax), 10);
                  const hMed = Math.max((s.rainMedian / maxV) * 100, 3);
                  const hWorst = (s.rainMax / maxV) * 100;
                  const col = s.pRain50 >= 50 ? 'from-[#9f1239] to-[#fb7185]' : s.pRain50 >= 25 || s.pRain20 >= 40 ? 'from-[#ca8a04] to-[#fde047]' : 'from-[#0f766e] to-[#2dd4bf]';
                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                      <div className={`text-[9px] md:text-[11px] font-bold mb-1 ${s.rainMedian > 0 ? 'text-white' : 'text-gray-600'}`}>{s.rainMedian > 0 ? s.rainMedian.toFixed(0) : ''}</div>
                      <div className="relative w-full h-full flex items-end justify-center">
                        <div className="absolute w-[2px] bg-red-500/70 rounded" style={{ height: `${hWorst}%`, bottom: 0 }}></div>
                        <div className={`w-full max-w-[22px] md:max-w-[30px] rounded-t bg-gradient-to-t ${col} opacity-90 transition-all duration-700`} style={{ height: `${hMed}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between gap-0.5">
                {data.stats.map((s: any, i: number) => (
                  <div key={i} className="flex-1 text-center">
                    <div className={`text-[7px] md:text-[9px] font-bold ${s.signal >= 50 ? 'text-red-400' : s.signal >= 25 ? 'text-yellow-400' : 'text-gray-500'}`}>{fmtD(s.date).split(' ')[0]}</div>
                    <div className="text-[6px] md:text-[8px] text-gray-600">{fmtD(s.date).split(' ')[1]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-gray-800 text-center">
        <p className="text-[10px] text-gray-500 font-mono">
          ⚠️ เครื่องมือสนับสนุนการตัดสินใจ — คำสั่งเฝ้าระวัง/เตือนภัยทางการให้อ้างอิงประกาศกรมอุตุนิยมวิทยาเป็นสำคัญ • Track: Open-Meteo Tropical API (ECMWF/GFS/Best Track) + TMD Proxy
        </p>
      </div>
    </div>
  );
}
