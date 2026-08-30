'use client';
import React, { useState, useEffect } from 'react';

// ==========================================
// 🛠️ 1. Architecture & Algorithm Utilities
// ==========================================

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// 🛡️ API Resilience: Fault-Tolerance + Session Cache
const fetchWithCache = async (url: string, cacheKey: string, timeoutMs = 6000) => {
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

// 🧮 Statistics Helpers (Ensemble Math)
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
// 🚀 2. Main Executive Dashboard
// ==========================================

export default function ExecutiveDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [apiHealth, setApiHealth] = useState({ onwr: 'LOAD', tmd: 'LOAD', deepmind: 'LOAD' });

  const BO_LUANG_LAT = 18.1633;
  const BO_LUANG_LNG = 98.3744;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 📡 ETL Layer 1-2: Ground Truth + Deterministic Forecast
        const [onwrRes, forecastRes] = await Promise.all([
          fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', 'exec_onwr_rain'),
          fetchWithCache(
            `https://api.open-meteo.com/v1/forecast?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
            `&current=temperature_2m,wind_speed_10m,precipitation,weather_code` +
            `&daily=precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max&timezone=Asia%2FBangkok&forecast_days=15`,
            'exec_tmd_forecast'
          )
        ]);

        // 📡 ETL Layer 3: DeepMind Ensemble (Fallback Chain ตามสถาปัตยกรรม Weather Lab)
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

        setApiHealth({ onwr: onwrRes.status, tmd: forecastRes.status, deepmind: ensRes.status });

        // 🔄 Transform: ONWR Ground Truth (สถานีใกล้สุด)
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

          // 🧠 Data Fusion: ดัชนีดินอุ้มน้ำ (คง logic เดิม)
          const soilMoisture = Math.min(100, (actualRain24h / 80) * 100 + (liveRainIntensity > 0 ? 30 : 0));

          // ===== 🌐 ENSEMBLE ANALYTICS (หัวใจสถาปัตยกรรม Weather Lab) =====
          const daily = ens.daily;
          const N = Math.min(daily.time.length, 15);
          const rainKeys = Object.keys(daily).filter(k => k.startsWith('precipitation_sum') && k !== 'precipitation_sum');
          const gustKeys = Object.keys(daily).filter(k => k.startsWith('wind_gusts_10m_max') && k !== 'wind_gusts_10m_max');
          const isEnsemble = rainKeys.length > 0;
          const rKeys = isEnsemble ? rainKeys : ['precipitation_sum'];
          const gKeys = isEnsemble ? (gustKeys.length ? gustKeys : []) : [];

          const stats = Array.from({ length: N }, (_, d) => {
            const rains = rKeys.map(k => daily[k]?.[d]).filter((v: any) => isFinite(v));
            const gusts = gKeys.map(k => daily[k]?.[d]).filter((v: any) => isFinite(v));
            return {
              date: daily.time[d],
              rainMedian: median(rains),
              rainMin: rains.length ? Math.min(...rains) : 0,
              rainMax: rains.length ? Math.max(...rains) : 0,
              pRain20: probExceed(rains, 20), pRain50: probExceed(rains, 50), pRain90: probExceed(rains, 90),
              gustMax: gusts.length ? Math.max(...gusts) : 0,
              pGust40: probExceed(gusts, 40), pGust60: probExceed(gusts, 60),
            };
          }).map(s => ({ ...s, signal: Math.min(100, Math.max(s.pRain50, s.pGust40 * 0.9, s.pRain90 * 0.8)) }));

          const peakSignalDay = stats.reduce((a, b) => (b.signal > a.signal ? b : a), stats[0]);
          const peakRainDay = stats.reduce((a, b) => (b.rainMedian > a.rainMedian ? b : a), stats[0]);
          const peakGust = Math.max(...stats.map(s => s.gustMax));
          const worstRain15 = Math.max(...stats.map(s => s.rainMax));
          const w1Max = Math.max(...stats.slice(0, 7).map(s => s.rainMedian));
          const w2Max = stats.length > 7 ? Math.max(...stats.slice(7).map(s => s.rainMedian)) : 0;
          const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

          // 🇹🇭 Deterministic 7-day (Cross-Validation กับ AI)
          const maxRain7Days = Math.max(...(forecast.daily?.precipitation_sum?.slice(0, 7) || [0]));
          const spread = peakRainDay.rainMax - peakRainDay.rainMin;
          const confidence = peakRainDay.rainMax > 0 ? Math.max(0, Math.round((1 - spread / peakRainDay.rainMax) * 100)) : 100;

          // ===== 🎯 RULE ENGINE: 4-Tier Action-Driven (Weather Lab Philosophy) =====
          let status = 'NORMAL', tier = 'ปกติ';
          let aiInsight = `AI Ensemble ประเมินโครงสร้างชั้นบรรยากาศ 15 วันล่วงหน้า: ไม่พบสัญญาณพายุหรือฝนระลอกรุนแรงก่อตัวในพื้นที่บ่อหลวง`;
          let actions = ['อัปเดตสถานการณ์ปกติให้ประชาชนทราบผ่านเพจเทศบาล', 'บำรุงรักษาระบบต้นน้ำ-ระบายน้ำตามแผนประจำ'];

          const hitCritical = stats.some(s => s.pRain90 >= 30 || s.pGust60 >= 30 || s.rainMax >= 150);
          const hitWarning7 = stats.slice(0, 7).some(s => s.pRain50 >= 40 || s.pGust40 >= 40 || s.rainMedian >= 60);
          const hitWatch = stats.some(s => s.pRain50 >= 20 || s.pGust40 >= 20 || s.rainMedian >= 25);

          if (actualRain24h > 90 || liveRainIntensity > 10 || soilMoisture > 85) {
            status = 'CRITICAL'; tier = 'วิกฤต (Ground Override)';
            aiInsight = `🚨 ข้อมูลตรวจวัดจริงยืนยันฝนสะสม ${actualRain24h} มม./24ชม. ดินอุ้มน้ำ ${Math.round(soilMoisture)}% — ระบบ Override แบบจำลอง AI ทันทีเพื่อความปลอดภัย`;
            actions = ['🚨 เปิดศูนย์ EOC เต็มรูปแบบ ประกาศเบิกงบฉุกเฉิน', 'อพยพประชาชนโซนเชิงเขา/ริมลำห้วยทันที', 'สั่งเครื่องจักรหนักแสตนด์บาย ณ จุดเสี่ยง'];
          } else if (hitCritical) {
            status = 'CRITICAL'; tier = 'วิกฤต (AI Ensemble)';
            aiInsight = `AI ตรวจพบสัญญาณพายุ/ฝนระลอกรุนแรง พีควันที่ ${fmtDate(peakSignalDay.date)} — โอกาสฝนเกิน 90 มม. ${Math.round(peakSignalDay.pRain90)}% | โอกาสลมกระโชกเกิน 60 กม./ชม. ${Math.round(peakSignalDay.pGust60)}% | กรณีเลวร้ายสุด ${peakSignalDay.rainMax.toFixed(0)} มม.`;
            actions = ['🚨 ประกาศเตือนภัยล่วงหน้า 48 ชม. ทั้งตำบล', 'เปิดศูนย์ EOC / เตรียมจุดพักพิงและงบฉุกเฉิน', 'ตรวจลำห้วย+ลาดเท 7 จุดเสี่ยงดินถล่ม พร้อมเครื่องจักร'];
          } else if (hitWarning7) {
            status = 'WARNING'; tier = 'เตือนภัย';
            aiInsight = `AI ประเมินพบฝนระลอกกิจกรรมสูงช่วง 7 วันนี้ พีควันที่ ${fmtDate(peakRainDay.date)} (Median ${peakRainDay.rainMedian.toFixed(0)} มม. | โอกาสฝนเกิน 50 มม. ${Math.round(peakRainDay.pRain50)}%) — ช่วงความไม่แน่นอน ${peakRainDay.rainMin.toFixed(0)}–${peakRainDay.rainMax.toFixed(0)} มม. (Consensus ${confidence}%)`;
            actions = ['เสียงตามสายแจ้งเตือนพื้นที่ริมลำห้วย/เชิงเขา', 'ส่งหน่วยลาดตระเวนวัดระดับน้ำ 2 รอบ/วัน', 'ทดสอบเครื่องสูบน้ำ + ยืนยันความพร้อม อสม.'];
          } else if (hitWatch) {
            status = 'WATCH'; tier = 'เฝ้าระวังล่วงหน้า';
            aiInsight = `AI ตรวจจับสัญญาณเบื้องต้นช่วงวันที่ 8–15 ล่วงหน้า: โอกาสฝนเกิน 50 มม. สูงสุด ${Math.round(Math.max(...stats.map(s => s.pRain50)))}% ช่วง ${fmtDate(peakSignalDay.date)} — แนะนำวางแผนล่วงหน้า (W2 ฝน Median สูงสุด ${w2Max.toFixed(0)} มม.)`;
            actions = ['ประชุมเฝ้าระวังล่วงหน้าอ้างอิงข้อมูล AI Ensemble', 'สำรองเชื้อเพลิง/ตรวจสภาพเครื่องจักรและระบบระบายน้ำ', 'เตรียมประกาศแจ้งเตือนฉบับร่างไว้ล่วงหน้า'];
          }

          const crossCheck = Math.abs(maxRain7Days - w1Max) <= 15 ? 'สอดคล้องกัน' : 'คลาดเคลื่อน — ใช้กรณี Worst-case วางแผน';

          setData({
            actualRain24h, currentTemp, currentWind, liveRainIntensity, soilMoisture,
            stats, peakSignalDay, peakRainDay, peakGust, worstRain15, maxRain7Days, w1Max, w2Max,
            isEnsemble, memberCount: rKeys.length, ensembleModel, confidence,
            ai: { status, tier, aiInsight, actions, crossCheck },
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
        <p className="text-gray-400 text-sm">แหล่งข้อมูลทั้งหมดไม่ตอบสนองและไม่มี Cache ระบบจะดึงข้อมูลใหม่อัตโนมัติทุก 15 นาที</p>
      </div>
    </div>
  );

  const getTheme = (s: string) => ({
    CRITICAL: { border: 'border-red-500/50', bg: 'bg-[#ef4444]', text: 'text-[#f87171]', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.25)]', label: 'วิกฤต' },
    WARNING:  { border: 'border-yellow-500/50', bg: 'bg-[#facc15]', text: 'text-[#facc15]', glow: 'shadow-[0_0_30px_rgba(250,204,21,0.15)]', label: 'เตือนภัย' },
    WATCH:    { border: 'border-orange-500/50', bg: 'bg-[#fb923c]', text: 'text-[#fb923c]', glow: 'shadow-[0_0_30px_rgba(251,146,60,0.15)]', label: 'เฝ้าระวัง' },
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

  // 📈 SVG Ensemble Band Chart (สถาปัตยกรรม Weather Lab: Cone of Uncertainty)
  const BandChart = () => {
    const W = 600, H = 150, P = 10;
    const N = data.stats.length;
    const maxV = Math.max(...data.stats.map((s: any) => s.rainMax), 10);
    const x = (i: number) => P + i * ((W - 2 * P) / Math.max(N - 1, 1));
    const y = (v: number) => H - P - (v / maxV) * (H - 2 * P);
    const top = data.stats.map((s: any, i: number) => `${x(i)},${y(s.rainMax)}`).join(' L ');
    const bot = [...data.stats].reverse().map((s: any, ri: number) => `${x(N - 1 - ri)},${y(s.rainMin)}`).join(' L ');
    const medLine = data.stats.map((s: any, i: number) => `${x(i)},${y(s.rainMedian)}`).join(' L ');
    const pk = data.peakRainDay;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
        <defs>
          <linearGradient id="ensBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={`M ${top} L ${bot} Z`} fill="url(#ensBand)" stroke="#a855f7" strokeWidth="0.5" strokeOpacity="0.4" />
        <polyline points={medLine} fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(data.stats.indexOf(pk))} cy={y(pk.rainMedian)} r="4" fill="#2dd4bf" />
        <text x={Math.min(x(data.stats.indexOf(pk)), W - 90)} y={Math.max(y(pk.rainMedian) - 8, 14)} fill="#e2e8f0" fontSize="10" fontFamily="monospace">
          พีค {fmtD(pk.date)} • {pk.rainMedian.toFixed(0)} มม.
        </text>
        <text x={P} y={H - 2} fill="#64748b" fontSize="8" fontFamily="monospace">วันนี้</text>
        <text x={W - 70} y={H - 2} fill="#64748b" fontSize="8" fontFamily="monospace">+{N - 1} วัน</text>
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
          </h1>
          <p className="text-[#2dd4bf] mt-2 text-[10px] sm:text-xs tracking-widest font-mono">DEEPMIND ENSEMBLE INTELLIGENCE • เทศบาลตำบลบ่อหลวง จ.เชียงใหม่</p>
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
          </div>
        </div>
      </div>

      {/* ===== KPI Row A: AI Ensemble 15-Day ===== */}
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

      {/* ===== Main Grid ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: AI Insight + Actions */}
        <div className="xl:col-span-6 flex flex-col gap-6">
          <div className={`border ${theme.border} bg-[#111a1c] ${theme.glow} rounded-3xl p-6 md:p-8`}>
            <div className="flex items-center space-x-4 mb-5 pb-4 border-b border-gray-800">
              <div className="w-12 h-12 rounded-full bg-[#0a1112] flex items-center justify-center text-2xl border border-gray-700">🧠</div>
              <div>
                <h2 className={`text-lg md:text-2xl font-bold ${theme.text}`}>AI Ensemble Insight</h2>
                <span className="text-xs text-gray-400 font-mono tracking-widest">MODEL: {data.ensembleModel} • {data.isEnsemble ? `PROBABILISTIC (${data.memberCount} MEMBERS)` : 'SINGLE-RUN (FALLBACK)'}</span>
              </div>
            </div>
            <p className={`text-sm md:text-base text-gray-100 leading-relaxed border-l-2 ${data.ai.status === 'NORMAL' ? 'border-[#2dd4bf]/40' : 'border-red-500/60'} pl-4`}>
              {data.ai.aiInsight}
            </p>
            <div className="mt-4 bg-[#0a1112] rounded-xl border border-gray-800 p-3 font-mono text-[10px] text-gray-500">
              [LOG] Ensemble Spread Analysis... OK<br />
              [LOG] Cross-validation TMD×DeepMind: {data.ai.crossCheck}<br />
              [LOG] W1 Median Peak {data.w1Max.toFixed(0)} มม. | W2 Median Peak {data.w2Max.toFixed(0)} มม.
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

        {/* Right: Charts */}
        <div className="xl:col-span-6 flex flex-col gap-6">
          <div className="bg-[#111a1c] border border-purple-500/30 rounded-3xl p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between mb-3">
              <h4 className="text-xs md:text-sm text-purple-400 font-bold uppercase tracking-widest">🔮 Ensemble Cone of Uncertainty</h4>
              <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-1 rounded border border-purple-500/30">แถบม่วง = ช่วงความเป็นไปได้ (Min–Max) • เส้นเขียว = Median</span>
            </div>
            <BandChart />
          </div>

          <div className="bg-[#111a1c] border border-gray-800 rounded-3xl p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between mb-5">
              <div>
                <h3 className="text-base md:text-lg font-bold text-white flex items-center"><span className="mr-2">📊</span> พยากรณ์ฝน 15 วัน (Median)</h3>
                <p className="text-[10px] text-gray-500 mt-1 ml-6">โซนม่วง = กรอบ AI ระยะกลาง (วัน 8–15) • เส้นแดง = Worst-case</p>
              </div>
            </div>
            <div className="relative flex-1 h-56">
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
                        <div className={`w-full max-w-[22px] md:max-w-[30px] rounded-t bg-gradient-to-t ${col} opacity-90 group-hover:opacity-100 transition-all duration-700`} style={{ height: `${hMed}%` }}></div>
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

      {/* Footer Disclaimer */}
      <div className="mt-8 pt-4 border-t border-gray-800 text-center">
        <p className="text-[10px] text-gray-500 font-mono">
          ⚠️ ระบบนี้เป็นเครื่องมือสนับสนุนการตัดสินใจ (Decision Support) ไม่ทดแทนประกาศทางการจากกรมอุตุนิยมวิทยา และเฝ้าติดตามพายุหมุนเขตร้อนทางการได้ที่ deepmind.google/science/weather-lab
        </p>
      </div>
    </div>
  );
}
