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

// 🛡️ API Resilience
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
// 🌀 2. Mock Storm Data
// ==========================================
interface TrackPoint { lat: number; lon: number; time: string | null; wind: number; gust: number; pressure: number; }
interface StormInfo {
  name: string; source: string; points: TrackPoint[]; closest: TrackPoint; closestIdx: number;
  nearestKm: number; etaHours: number | null; etaText: string; movement: string;
  windAtNearest: number; maxWindKmh: number; cat: { label: string; color: string };
}

const getMockStorm = (): StormInfo | null => {
  const pts: TrackPoint[] = [
    { lat: 14.0, lon: 112.0, time: new Date(Date.now() - 86400000).toISOString(), wind: 50, gust: 70, pressure: 995 },
    { lat: 15.5, lon: 109.5, time: new Date(Date.now()).toISOString(), wind: 75, gust: 95, pressure: 985 },
    { lat: 16.8, lon: 105.0, time: new Date(Date.now() + 86400000).toISOString(), wind: 65, gust: 85, pressure: 990 }, 
    { lat: 18.2, lon: 101.5, time: new Date(Date.now() + 172800000).toISOString(), wind: 40, gust: 60, pressure: 1000 },
  ];
  let nearestKm = Infinity, closest = pts[0], closestIdx = 0;
  pts.forEach((p, i) => {
    const d = calculateDistance(BO_LUANG_LAT, BO_LUANG_LNG, p.lat, p.lon);
    if (d < nearestKm) { nearestKm = d; closest = p; closestIdx = i; }
  });
  const etaHours = Math.round((new Date(closest.time!).getTime() - Date.now()) / 3.6e6);
  const maxWindKmh = 75;
  return {
    name: 'MOCK-STORM', source: 'Simulated', points: pts, closest, closestIdx,
    nearestKm, etaHours, etaText: `อีก ${(etaHours / 24).toFixed(1)} วัน`, movement: 'กำลังเคลื่อนเข้าใกล้พื้นที่ (จำลอง)',
    windAtNearest: closest.wind, maxWindKmh,
    cat: { label: 'พายุโซนร้อน', color: '#facc15' }
  };
};

// ==========================================
// 🚀 3. Main Executive Dashboard
// ==========================================

export default function ExecutiveDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  const [apiHealth, setApiHealth] = useState({ onwr: 'LOAD', ecmwf: 'LOAD', deepmind: 'LOAD', storm: 'MOCK' });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 📡 เปลี่ยนไปดึงโมเดล ECMWF ความละเอียดสูง 9km (มาตรฐานเดียวกับ Windy)
        const [onwrRes, forecastRes] = await Promise.all([
          fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', 'exec_onwr_rain'),
          fetchWithCache(
            `https://api.open-meteo.com/v1/ecmwf?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
            `&current=temperature_2m,wind_speed_10m,precipitation,weather_code` +
            `&daily=precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max&timezone=Asia%2FBangkok&forecast_days=15`,
            'exec_ecmwf_forecast'),
        ]);

        const ensUrl = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
          `&daily=precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max&timezone=Asia%2FBangkok&forecast_days=15&models=icon_seamless`;
        const ensRes = await fetchWithCache(ensUrl, 'exec_ens_stable');

        const stormTop = getMockStorm();
        const stormInfos = [stormTop];

        setApiHealth({ onwr: onwrRes.status, ecmwf: forecastRes.status, deepmind: ensRes.status, storm: 'MOCK' });

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

          const daily = ens.daily;
          const N = Math.min(daily.time.length, 15);
          const rKeys = Object.keys(daily).filter(k => k.startsWith('precipitation_sum') && k !== 'precipitation_sum');
          const gKeys = Object.keys(daily).filter(k => k.startsWith('wind_gusts_10m_max') && k !== 'wind_gusts_10m_max');
          
          const stats = Array.from({ length: N }, (_, d) => {
            const rains = rKeys.map(k => daily[k]?.[d]).filter((v: any) => isFinite(v));
            const gusts = gKeys.map(k => daily[k]?.[d]).filter((v: any) => isFinite(v));
            return {
              date: daily.time[d],
              // ใช้ข้อมูลจาก ECMWF (ที่แม่นยำกว่า) เป็นตัวหลักสำหรับ rainMedian
              rainMedian: forecast.daily?.precipitation_sum?.[d] || (rains.length ? median(rains) : 0),
              rainMin: rains.length ? Math.min(...rains) : 0, 
              rainMax: rains.length ? Math.max(...rains) : (forecast.daily?.precipitation_sum?.[d] || 0),
              pRain50: rains.length ? probExceed(rains, 50) : 0, pRain90: rains.length ? probExceed(rains, 90) : 0,
              gustMax: gusts.length ? Math.max(...gusts) : 0, pGust40: gusts.length ? probExceed(gusts, 40) : 0,
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

          let status = 'NORMAL', tier = 'ปกติ';
          let aiInsight = `ระบบ Data Fusion เชื่อมโยงโมเดล ECMWF (ยุโรป) ความละเอียด 9 กม. เข้ากับ AI Ensemble: ไม่พบสัญญาณพายุรุนแรงใน 15 วัน`;
          let actions = ['อัปเดตสถานการณ์ปกติให้ประชาชนทราบ', 'บำรุงรักษาระบบระบายน้ำตามแผนประจำ'];

          const groundOverride = actualRain24h > 90 || liveRainIntensity > 10 || soilMoisture > 85;
          const hitWarning7 = stats.slice(0, 7).some(s => s.pRain50 >= 40 || s.rainMedian >= 60);

          if (groundOverride) {
            status = 'CRITICAL'; tier = 'วิกฤต (Ground Override)';
            aiInsight = `🚨 ข้อมูลตรวจวัดจริงยืนยันฝนสะสม ${actualRain24h} มม./24ชม. ดินอุ้มน้ำ ${Math.round(soilMoisture)}% — สั่ง Override โมเดลพยากรณ์ทันที`;
            actions = ['🚨 เปิดศูนย์ EOC เต็มรูปแบบ ประกาศเบิกงบฉุกเฉิน', 'อพยพประชาชนโซนเชิงเขา/ริมลำห้วยทันที'];
          } else if (hitWarning7) {
            status = 'WARNING'; tier = 'เตือนภัย (ECMWF Alert)';
            aiInsight = `โมเดล ECMWF ประเมินฝนระดับเฝ้าระวัง พีคสุดวันที่ ${fmtDate(peakRainDay.date)} (โอกาสเกิดจริง ${Math.round(peakRainDay.pRain50)}%)`;
            actions = ['เสียงตามสายแจ้งเตือนพื้นที่ริมลำห้วย/เชิงเขา', 'ทดสอบเครื่องสูบน้ำ'];
          }

          setData({
            actualRain24h, currentTemp, currentWind, liveRainIntensity, soilMoisture,
            stats, peakSignalDay, peakRainDay, peakGust, w1Max, w2Max,
            memberCount: rKeys.length || 1, confidence, stormCount: stormInfos.length,
            storm: { infos: stormInfos, top: stormTop },
            ai: { status, tier, aiInsight, actions },
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
    <div className="flex h-screen items-center justify-center bg-[#020617] text-white">
      <div className="flex flex-col items-center">
        <div className="w-20 h-20 border-4 border-[#0891b2] border-t-transparent border-b-transparent rounded-full animate-spin mb-6 shadow-[0_0_20px_#0891b2]"></div>
        <span className="font-mono text-[#0ea5e9] text-xl tracking-[0.2em] animate-pulse font-bold">CALIBRATING ECMWF MODEL...</span>
      </div>
    </div>
  );
  if (!data) return (
    <div className="flex h-screen items-center justify-center bg-[#020617] text-white">
      <div className="text-center border border-red-500/40 bg-red-950/20 rounded-3xl p-10 max-w-lg shadow-[0_0_30px_rgba(239,68,68,0.1)]">
        <div className="text-6xl mb-4">📡</div>
        <h2 className="text-red-400 font-black text-2xl mb-3 tracking-widest">CONNECTION FAILED</h2>
        <p className="text-gray-400 text-sm leading-relaxed">ไม่สามารถเชื่อมต่อ Data Nodes หลักได้ ระบบจะทำการ Re-establish อัตโนมัติในภายหลัง</p>
      </div>
    </div>
  );

  const getTheme = (s: string) => ({
    CRITICAL: { border: 'border-red-500/50', bg: 'bg-red-500', text: 'text-red-400', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.2)]', label: 'วิกฤต' },
    WARNING: { border: 'border-amber-500/50', bg: 'bg-amber-500', text: 'text-amber-400', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.15)]', label: 'เตือนภัย' },
  } as any)[s] || { border: 'border-[#0891b2]/40', bg: 'bg-[#0891b2]', text: 'text-[#0ea5e9]', glow: 'shadow-[0_0_20px_rgba(8,145,178,0.1)]', label: 'สถานการณ์ปกติ' };
  const theme = getTheme(data.ai.status);
  const fmtD = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

  const HealthBadge = ({ label, status }: { label: string, status: string }) => {
    const c = status === 'LIVE' ? 'text-[#34d399] bg-[#064e3b]/50 border-[#10b981]/50'
      : status === 'MOCK' ? 'text-amber-400 bg-amber-900/30 border-amber-500/50'
      : 'text-red-400 bg-red-900/30 border-red-500/50';
    return (
      <div className={`flex items-center px-3 py-1.5 rounded-md border ${c} text-[10px] md:text-xs font-mono font-bold tracking-wider shadow-sm`}>
        <div className={`w-2 h-2 rounded-full mr-2 ${status === 'LIVE' ? 'bg-[#34d399] animate-pulse' : status === 'MOCK' ? 'bg-amber-400' : 'bg-red-400'}`}></div>
        <span className="whitespace-nowrap">{label}: {status}</span>
      </div>
    );
  };

  // 🗺️ SVG Mini-Map
  const StormMap = ({ storms }: { storms: StormInfo[] }) => {
    const W = 760, H = 400, LON0 = 90, LON1 = 138, LAT0 = 0, LAT1 = 32;
    const px = (lon: number) => ((lon - LON0) / (LON1 - LON0)) * W;
    const py = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * H;
    const cities = [
      { n: 'บ่อหลวง', lat: 18.1633, lon: 98.3744, main: true },
      { n: 'เชียงใหม่', lat: 18.79, lon: 98.98 }, { n: 'กรุงเทพฯ', lat: 13.75, lon: 100.52 },
      { n: 'มะนิลา', lat: 14.60, lon: 120.98 },
    ];
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-2xl bg-[#030712] border border-[#1e293b] shadow-inner">
        {[100, 110, 120, 130].map(lo => <line key={`lo-${lo}`} x1={px(lo)} y1={0} x2={px(lo)} y2={H} stroke="#0f172a" strokeWidth="1" />)}
        {[10, 20, 30].map(la => <line key={`la-${la}`} x1={0} y1={py(la)} x2={W} y2={py(la)} stroke="#0f172a" strokeWidth="1" />)}
        
        {[300, 600].map(km => (
          <ellipse key={km} cx={px(BO_LUANG_LNG)} cy={py(BO_LUANG_LAT)}
            rx={(km / 111) * (W / (LON1 - LON0))} ry={(km / 111) * (H / (LAT1 - LAT0))}
            fill="none" stroke={km === 300 ? '#ef4444' : '#f59e0b'}
            strokeOpacity={0.4} strokeDasharray="5 5" strokeWidth="1.5" />
        ))}
        {cities.map(c => (
          <g key={c.n}>
            <circle cx={px(c.lon)} cy={py(c.lat)} r={c.main ? 5 : 3} fill={c.main ? '#0ea5e9' : '#475569'} />
            <text x={px(c.lon) + 8} y={py(c.lat) + 4} fill={c.main ? '#0ea5e9' : '#64748b'} fontSize={c.main ? 13 : 11} fontWeight={c.main ? 'bold' : 'normal'}>{c.n}</text>
          </g>
        ))}
        {storms.map((s, si) => (
          <g key={si}>
            <polyline fill="none" stroke="#d946ef" strokeOpacity={0.8} strokeWidth={2} strokeDasharray="6 4"
              points={s.points.map(p => `${px(p.lon)},${py(p.lat)}`).join(' ')} />
            {s.points.map((p, pi) => (
              <circle key={pi} cx={px(p.lon)} cy={py(p.lat)} r={pi === s.closestIdx ? 7 : 4} fill={s.cat.color} stroke={pi === s.closestIdx ? '#fff' : 'none'} strokeWidth={2} />
            ))}
            <text x={px(s.closest.lon) + 12} y={py(s.closest.lat) - 10} fill="#f87171" fontSize="13" fontFamily="monospace" fontWeight="bold">
              {s.name}
            </text>
          </g>
        ))}
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-[#020617] p-4 md:p-8 font-sans text-slate-200 overflow-x-hidden selection:bg-[#0ea5e9] selection:text-white">
      
      {/* ===== 🖥️ Header Section ===== */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-8 pb-6 border-b border-slate-800/80 gap-6">
        <div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter text-white flex flex-wrap items-center gap-x-4 mb-2">
            <span>EXECUTIVE</span> <span className={theme.text}>ATLAS</span>
            <span className={`px-4 py-1.5 border ${theme.border} ${theme.bg} text-white text-sm md:text-base font-bold rounded-full ${theme.glow}`}>{theme.label}</span>
          </h1>
          <p className="text-[#0ea5e9] text-xs sm:text-sm md:text-base tracking-[0.15em] font-mono font-medium">HIGH-RES ECMWF & ENSEMBLE FUSION</p>
        </div>
        <div className="flex flex-col items-start lg:items-end w-full lg:w-auto">
          <div className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-widest drop-shadow-md">
            {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-sm md:text-base text-slate-400 mt-2 mb-4 font-medium">{currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <div className="flex flex-wrap gap-2 w-full lg:justify-end">
            <HealthBadge label="ONWR (GROUND)" status={apiHealth.onwr} />
            <HealthBadge label="ECMWF-9KM (GLOBAL)" status={apiHealth.ecmwf} />
            <HealthBadge label="DEEPMIND (AI)" status={apiHealth.deepmind} />
            <HealthBadge label="STORM TRACK" status={apiHealth.storm} />
          </div>
        </div>
      </div>

      {/* ===== 🔴 Top KPI Row (Ground Truth) ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-8">
        {[
          { icon: '📡', label: 'ฝน ณ วินาทีนี้ (LIVE)', val: data.liveRainIntensity.toFixed(1), unit: 'มม./ชม.', alert: data.liveRainIntensity > 0, color: 'text-rose-400', bColor: 'border-rose-500/40' },
          { icon: '🇹🇭', label: 'ฝนสะสม 24 ชม. (ONWR)', val: data.actualRain24h, unit: 'มม.', alert: data.actualRain24h > 20, color: 'text-[#34d399]', bColor: 'border-[#0ea5e9]/30' },
          { icon: '⛰️', label: 'ดัชนีดินอุ้มน้ำ (โมเดล)', val: `${Math.round(data.soilMoisture)}%`, unit: '', alert: data.soilMoisture > 75, color: data.soilMoisture > 75 ? 'text-rose-400' : 'text-[#0ea5e9]', bColor: data.soilMoisture > 75 ? 'border-rose-500/40' : 'border-[#0ea5e9]/30' },
        ].map((k, i) => (
          <div key={i} className={`bg-[#0b1120] border ${k.alert ? k.bColor + ' shadow-[0_0_20px_rgba(244,63,94,0.15)]' : 'border-slate-800'} rounded-3xl p-6 md:p-8 flex flex-col justify-center transition-all duration-300 hover:border-slate-600`}>
            <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><span className="text-xl">{k.icon}</span> {k.label}</h3>
            <div className="flex items-baseline space-x-2">
              <span className={`text-5xl md:text-6xl font-black ${k.color} ${k.alert ? 'animate-pulse' : ''}`}>{k.val}</span>
              <span className="text-sm md:text-base text-slate-500 font-bold">{k.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 🎯 Main Grid Layout ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 md:gap-8 flex-1 z-10">
        
        {/* 🧠 ฝั่งซ้าย: AI Analysis & Action */}
        <div className="xl:col-span-5 flex flex-col gap-6 md:gap-8 h-full">
            <div className={`flex-1 border ${theme.border} bg-[#0b1120] ${theme.glow} rounded-[2rem] p-6 md:p-8 flex flex-col transition-all duration-500`}>
                <div className="flex items-center space-x-4 mb-6 pb-5 border-b border-slate-800">
                    <div className="w-14 h-14 rounded-full bg-[#020617] flex items-center justify-center text-3xl border border-slate-700 shadow-inner">🧠</div>
                    <div>
                        <h2 className={`text-xl md:text-3xl font-black tracking-tight ${theme.text}`}>ECMWF Data Fusion</h2>
                        <span className="text-xs md:text-sm text-slate-400 font-mono tracking-widest mt-1 block">STATUS: <span className="text-white font-bold">{data.ai.tier}</span></span>
                    </div>
                </div>
                <div className="flex-1 text-base md:text-lg leading-relaxed space-y-4">
                  <p className="text-slate-200 font-medium">{data.ai.aiInsight}</p>
                </div>
            </div>

            <div className={`border ${data.ai.status === 'CRITICAL' ? 'border-rose-500 bg-rose-950/20' : 'border-slate-800 bg-[#0b1120]'} rounded-[2rem] p-6 md:p-8 shadow-2xl shrink-0 transition-colors duration-500`}>
                <h3 className={`text-xl md:text-2xl font-black mb-6 flex items-center tracking-tight ${data.ai.status === 'CRITICAL' ? 'text-rose-400' : 'text-white'}`}>
                    <span className="text-3xl mr-4 shrink-0">🎯</span> PROACTIVE ACTIONS
                </h3>
                <ul className="space-y-4">
                    {data.ai.actions.map((action: string, idx: number) => (
                        <li key={idx} className="flex items-start bg-[#020617] p-5 rounded-2xl border border-slate-800/80 shadow-sm">
                            <div className={`w-3 h-3 rounded-full ${theme.bg} mr-4 mt-1.5 flex-shrink-0`}></div>
                            <span className="text-base md:text-lg text-slate-200 font-medium">{action}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        {/* 📊 ฝั่งขวา: Graphs & Storms */}
        <div className="xl:col-span-7 flex flex-col gap-6 md:gap-8">
            
            {/* 🌀 Storm Track Map */}
            <div className="bg-[#0b1120] border border-indigo-500/30 rounded-[2rem] p-6 md:p-8 shadow-xl">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-indigo-400 flex items-center tracking-tight"><span className="text-3xl mr-3">🌀</span> TROPICAL CYCLONE TRACK</h3>
                  <p className="text-xs text-slate-500 font-mono mt-1 tracking-widest">MOCK DATA (SIMULATION MODE)</p>
                </div>
                {data.storm.top && (
                  <div className="bg-indigo-950/40 border border-indigo-500/50 px-4 py-2 rounded-xl text-sm font-bold text-indigo-300">
                    {data.storm.top.name} • ใกล้สุด {Math.round(data.storm.top.nearestKm)} กม.
                  </div>
                )}
              </div>
              <StormMap storms={data.storm.infos} />
            </div>

            {/* 🔮 15-Day Chart */}
            <div className="bg-[#0b1120] border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-xl flex-1 flex flex-col min-h-[350px]">
              <div className="mb-6">
                <h3 className="text-xl md:text-2xl font-black text-white flex items-center tracking-tight"><span className="text-3xl mr-3">🔮</span> ECMWF 15-DAY PREDICTIVE VISION</h3>
                <p className="text-xs text-slate-500 font-mono mt-1 tracking-widest">HIGH-RESOLUTION (9 KM) MODEL INCORPORATED</p>
              </div>
              
              <div className="flex-1 w-full h-full relative">
                <div className="absolute inset-0 flex items-end justify-between gap-1 sm:gap-2 pb-6">
                  {data.stats.map((s: any, idx: number) => {
                      const maxV = Math.max(...data.stats.map((x: any) => x.rainMax), 10);
                      const hMed = Math.max((s.rainMedian / maxV) * 100, 2);
                      const hWorst = (s.rainMax / maxV) * 100;
                      const col = s.pRain50 >= 50 ? 'from-rose-600 to-rose-400' : s.pRain50 >= 25 ? 'from-amber-600 to-amber-400' : 'from-[#0891b2] to-[#0ea5e9]';
                      
                      return (
                          <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                              <div className={`text-[10px] md:text-xs font-bold mb-2 ${s.rainMedian > 0 ? 'text-white' : 'text-slate-600'}`}>{s.rainMedian > 0 ? s.rainMedian.toFixed(0) : ''}</div>
                              <div className="relative w-full h-full flex items-end justify-center">
                                  <div className="absolute w-[1px] md:w-[2px] bg-rose-500/50 rounded" style={{ height: `${hWorst}%`, bottom: 0 }}></div>
                                  <div className={`w-full max-w-[20px] md:max-w-[32px] rounded-t-sm md:rounded-t-md bg-gradient-to-t ${col} opacity-80 group-hover:opacity-100 transition-all`} style={{ height: `${hMed}%` }}></div>
                              </div>
                              <div className="mt-4 text-center">
                                  <div className="text-[9px] md:text-[11px] font-bold text-slate-400">{fmtD(s.date).split(' ')[0]}</div>
                              </div>
                          </div>
                      );
                  })}
                </div>
              </div>
            </div>
        </div>
      </div>

    </div>
  );
}
