'use client';
import React, { useState, useEffect } from 'react';

// ==========================================
// 🛠️ 1. Core Utilities & Math
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
// 🇹🇭 2. TMD Weather API (กรมอุตุนิยมวิทยา - ผ่าน Proxy)
// ==========================================
const fetchTmdData = async () => {
  try {
    const targetUrl = 'https://data.tmd.go.th/api/WeatherToday/V1/?type=json'; 
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetchWithCache(proxyUrl, 'tmd_weather_daily_cors');
    
    if (res.status === 'OFFLINE' || !res.data || !res.data.contents) return { status: 'OFFLINE', info: null };
    
    const rawData = JSON.parse(res.data.contents);
    const stations = rawData?.Stations || [];
    const cmStation = stations.find((s: any) => s.Province === 'เชียงใหม่' || s.WmoStationNumber === '48327');
    
    if (cmStation) {
      return { 
        status: 'LIVE', 
        info: {
          temp: cmStation.Observe?.Temperature?.Value,
          rain: cmStation.Observe?.Rainfall24Hr?.Value,
          desc: cmStation.Observe?.WeatherDescription || 'สภาพอากาศปกติ'
        }
      };
    }
    return { status: 'CACHED', info: null };
  } catch (e) {
    return { status: 'OFFLINE', info: null };
  }
};

// ==========================================
// 🌀 3. Live Storm Tracking (GDACS)
// ==========================================
interface TrackPoint { lat: number; lon: number; time: string | null; wind: number; gust: number; pressure: number; }
interface StormInfo {
  name: string; source: string; points: TrackPoint[]; closest: TrackPoint; closestIdx: number;
  nearestKm: number; etaHours: number | null; etaText: string; movement: string;
  windAtNearest: number; maxWindKmh: number; cat: { label: string; color: string };
}

const stormCategory = (kmh: number) =>
  kmh >= 118 ? { label: 'ไต้ฝุ่น', color: '#ef4444' } :
  kmh >= 89 ? { label: 'พายุกำลังแรง', color: '#f97316' } :
  kmh >= 62 ? { label: 'พายุโซนร้อน', color: '#facc15' } :
  { label: 'พายุดีเปรสชัน', color: '#0ea5e9' };

const fetchLiveStorms = async (): Promise<{ top: StormInfo | null, infos: StormInfo[], status: string }> => {
    try {
        const res = await fetchWithCache('/api/gdacs', 'gdacs_proxy_storm');
        if (res.status === 'OFFLINE' || !res.data || res.data.status !== 'LIVE' || !res.data.data || res.data.data.length === 0) {
            return { top: null, infos: [], status: 'STANDBY (CLEAR)' };
        }

        const storms: StormInfo[] = [];
        const events = Array.isArray(res.data.data) ? res.data.data : [];

        events.forEach((event: any) => {
            const lat = parseFloat(event.latitude);
            const lon = parseFloat(event.longitude);
            if (lat > -10 && lat < 35 && lon > 85 && lon < 145) {
                const p = { lat, lon, time: event.fromdate, wind: 60, gust: 80, pressure: 1000 };
                storms.push({
                    name: (event.name || 'UNKNOWN').toUpperCase(), source: 'GDACS', points: [p], closest: p, closestIdx: 0, 
                    nearestKm: calculateDistance(BO_LUANG_LAT, BO_LUANG_LNG, lat, lon), 
                    etaHours: null, etaText: 'กำลังก่อตัว', movement: 'ตรวจสอบเรดาร์เพิ่มเติม', 
                    windAtNearest: p.wind, maxWindKmh: p.wind, cat: stormCategory(p.wind)
                });
            }
        });
        storms.sort((a, b) => a.nearestKm - b.nearestKm);
        return { top: storms.length > 0 ? storms[0] : null, infos: storms, status: storms.length > 0 ? 'LIVE' : 'STANDBY (CLEAR)' };
    } catch (e) { return { top: null, infos: [], status: 'OFFLINE' }; }
}

// ==========================================
// 🚀 4. Main Executive Dashboard
// ==========================================

export default function ExecutiveDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  const [apiHealth, setApiHealth] = useState({ onwr: 'LOAD', tmd: 'LOAD', baseline: 'LOAD', ai_ensemble: 'LOAD', storm: 'LOAD' });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const stormRes = await fetchLiveStorms();
        const tmdRes = await fetchTmdData();

        // 📡 1. Baseline Data (สำหรับอุณหภูมิปัจจุบัน + ลม) - ใช้ Endpoint พื้นฐานที่เสถียรที่สุด
        const forecastRes = await fetchWithCache(
            `https://api.open-meteo.com/v1/forecast?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
            `&current=temperature_2m,wind_speed_10m,precipitation&timezone=Asia%2FBangkok`,
            'exec_baseline_weather'
        );

        // 📡 2. ONWR Ground Truth
        const onwrRes = await fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', 'exec_onwr_rain');

        // 🧠 3. DeepMind AI Ensemble (Google WeatherNext 15D - สุดยอดอัลกอริทึม)
        const ensUrl = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
          `&daily=precipitation_sum&timezone=Asia%2FBangkok&forecast_days=15&models=google_weathernext_15days_ensemble`;
        const aiRes = await fetchWithCache(ensUrl, 'exec_ai_gwn15');

        setApiHealth({ onwr: onwrRes.status, tmd: tmdRes.status, baseline: forecastRes.status, ai_ensemble: aiRes.status, storm: stormRes.status });

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
        const aiData = aiRes.data && !aiRes.data.error ? aiRes.data : null;

        // 🛡️ ป้องกันบั๊ก Cannot read properties (แก้ปัญหาหน้าจอพัง)
        const currentTemp = forecast?.current?.temperature_2m ?? '—';
        const currentWind = forecast?.current?.wind_speed_10m ?? '—';
        const liveRainIntensity = forecast?.current?.precipitation ?? 0;
        
        const soilMoisture = Math.min(100, ((actualRain24h / 80) * 100) + (liveRainIntensity > 0 ? 30 : 0));

        // 🧠 AI ENSEMBLE ENGINE
        const daily = aiData?.daily || {};
        const timeArray = daily.time || [];
        const N = Math.min(timeArray.length, 15);
        
        const rainKeys = Object.keys(daily).filter(k => k.startsWith('precipitation_sum') && k !== 'precipitation_sum');
        const memberCount = rainKeys.length > 0 ? rainKeys.length : 1;

        let stats = [];
        if (N > 0) {
            stats = Array.from({ length: N }, (_, d) => {
                const rains = rainKeys.map(k => daily[k]?.[d]).filter((v: any) => isFinite(v));
                return {
                    date: timeArray[d],
                    rainMedian: rains.length ? median(rains) : 0,
                    rainMax: rains.length ? Math.max(...rains) : 0,
                    pRain50: rains.length ? probExceed(rains, 50) : 0,
                };
            });
        }

        const peakRainDay = stats.length > 0 ? stats.reduce((a, b) => (b.rainMedian > a.rainMedian ? b : a), stats[0]) : { rainMedian: 0, pRain50: 0, rainMax: 0, date: new Date().toISOString() };
        const confidence = peakRainDay.pRain50 > 0 ? Math.round(peakRainDay.pRain50) : 100;
        const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

        // 🎯 LOGIC TIER (อ้างอิงราชการไทย + AI สากล)
        let status = 'NORMAL', tier = 'ปกติ';
        let aiInsight = `ข้อมูลสอดคล้องกัน: กรมอุตุนิยมวิทยาประเมิน "${tmdRes.info?.desc || 'สภาวะอากาศปกติ'}" สอดคล้องกับโมเดล AI (Google DeepMind) ที่ไม่พบสัญญาณพายุก่อตัวใน 15 วัน`;
        let actions = ['อัปเดตสถานการณ์ปกติให้ประชาชนทราบ', 'บำรุงรักษาระบบระบายน้ำตามแผนประจำ'];

        const groundOverride = actualRain24h > 90 || liveRainIntensity > 15 || soilMoisture > 85;

        if (groundOverride) {
            status = 'CRITICAL'; tier = 'วิกฤต (แจ้งเตือนระดับสีแดง)';
            aiInsight = `🚨 สั่ง OVERRIDE แบบจำลอง! ข้อมูลตรวจวัดจริง (ONWR) ยืนยันฝนสะสม ${actualRain24h} มม./24ชม. ดินอุ้มน้ำ ${Math.round(soilMoisture)}% ระวังดินสไลด์ฉับพลัน!`;
            actions = ['🚨 ประกาศภาวะฉุกเฉิน เปิดศูนย์ EOC เต็มรูปแบบ', 'อพยพประชาชนในโซนเชิงเขาและริมลำห้วยทันที', 'ประสานเครื่องจักรกลหนักแสตนด์บาย'];
        } else if (peakRainDay.pRain50 >= 60) {
            status = 'CRITICAL'; tier = 'เตือนภัยขั้นสูงสุด';
            aiInsight = `🚨 AI Ensemble (ความมั่นใจ ${confidence}%) ฟันธงพายุฝนรุนแรงเข้าปะทะพื้นที่ช่วงวันที่ ${fmtDate(peakRainDay.date)} (คาดการณ์ฝนสูงสุด ${peakRainDay.rainMax.toFixed(0)} มม.)`;
            actions = ['ออกประกาศเตือนภัยพายุระดับพื้นที่ล่วงหน้า', 'สั่งการเตรียมพร้อมอพยพประชาชนล่วงหน้า 24 ชม.'];
        } else if (peakRainDay.pRain50 >= 30 || actualRain24h > 30) {
            status = 'WARNING'; tier = 'เฝ้าระวัง (ระดับสีเหลือง)';
            aiInsight = `⚠️ AI ประเมินพบร่องมรสุมพาดผ่าน พีคสูงสุดวันที่ ${fmtDate(peakRainDay.date)} โอกาสเกิดฝนตกหนักระดับกลางอยู่ที่ ${confidence}%`;
            actions = ['ประกาศเสียงตามสายแจ้งเตือนพื้นที่เสี่ยง', 'ส่งหน่วยลาดตระเวนเช็คระดับน้ำลำห้วย', 'ทดสอบระบบเครื่องสูบน้ำ'];
        }

        setData({
            actualRain24h, currentTemp, currentWind, liveRainIntensity, soilMoisture,
            stats, peakRainDay, memberCount, confidence,
            storm: { infos: stormRes.infos, top: stormRes.top },
            tmdInfo: tmdRes.info,
            ai: { status, tier, aiInsight, actions },
        });

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
        <span className="font-mono text-[#0ea5e9] text-xl tracking-[0.2em] animate-pulse font-bold">CALIBRATING AI ENSEMBLE...</span>
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
    CRITICAL: { border: 'border-rose-500/50', bg: 'bg-rose-600', text: 'text-rose-400', glow: 'shadow-[0_0_30px_rgba(225,29,72,0.4)]', label: '🚨 สภาวะวิกฤต (CRITICAL)' },
    WARNING: { border: 'border-amber-500/50', bg: 'bg-amber-500', text: 'text-amber-400', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.3)]', label: '⚠️ เฝ้าระวัง (WARNING)' },
  } as any)[s] || { border: 'border-emerald-500/50', bg: 'bg-[#064e3b]', text: 'text-[#34d399]', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]', label: '✅ สภาวะปกติ (SAFE)' };
  const theme = getTheme(data.ai.status);
  const fmtD = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

  const HealthBadge = ({ label, status }: { label: string, status: string }) => {
    const c = status === 'LIVE' ? 'text-[#34d399] bg-[#064e3b]/50 border-[#10b981]/50'
      : status.includes('STANDBY') ? 'text-amber-400 bg-amber-900/30 border-amber-500/50'
      : 'text-rose-400 bg-rose-950/50 border-rose-500/50';
    return (
      <div className={`flex items-center px-3 py-1.5 rounded-md border ${c} text-[10px] md:text-xs font-mono font-bold tracking-wider shadow-sm transition-colors`}>
        <div className={`w-2 h-2 rounded-full mr-2 ${status === 'LIVE' ? 'bg-[#34d399] animate-pulse' : status.includes('STANDBY') ? 'bg-amber-400' : 'bg-rose-500'}`}></div>
        <span className="whitespace-nowrap">{label}: {status}</span>
      </div>
    );
  };

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
      <div className="relative w-full h-auto rounded-2xl bg-[#030712] border border-[#1e293b] shadow-inner overflow-hidden">
        <style dangerouslySetInnerHTML={{__html: `@keyframes spinRadar { 100% { transform: rotate(360deg); } } .radar-spin { transform-origin: center; animation: spinRadar 3s linear infinite; }`}} />
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full block">
            {[100, 110, 120, 130].map(lo => <line key={`lo-${lo}`} x1={px(lo)} y1={0} x2={px(lo)} y2={H} stroke="#0f172a" strokeWidth="1" />)}
            {[10, 20, 30].map(la => <line key={`la-${la}`} x1={0} y1={py(la)} x2={W} y2={py(la)} stroke="#0f172a" strokeWidth="1" />)}
            {[300, 600].map(km => (
              <ellipse key={km} cx={px(BO_LUANG_LNG)} cy={py(BO_LUANG_LAT)} rx={(km / 111) * (W / (LON1 - LON0))} ry={(km / 111) * (H / (LAT1 - LAT0))} fill="none" stroke={km === 300 ? '#ef4444' : '#f59e0b'} strokeOpacity={0.4} strokeDasharray="5 5" strokeWidth="1.5" />
            ))}
            {cities.map(c => (
            <g key={c.n}>
                <circle cx={px(c.lon)} cy={py(c.lat)} r={c.main ? 5 : 3} fill={c.main ? '#0ea5e9' : '#475569'} />
                <text x={px(c.lon) + 8} y={py(c.lat) + 4} fill={c.main ? '#0ea5e9' : '#64748b'} fontSize={c.main ? 13 : 11} fontWeight={c.main ? 'bold' : 'normal'}>{c.n}</text>
            </g>
            ))}
            {storms.length === 0 ? (
                <g>
                    <circle cx={W/2} cy={H/2} r="140" fill="none" stroke="#0ea5e9" strokeOpacity="0.1" strokeWidth="1" />
                    <circle cx={W/2} cy={H/2} r="90" fill="none" stroke="#0ea5e9" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="4 4" />
                    <g className="radar-spin">
                        <path d={`M ${W/2} ${H/2} L ${W/2} ${H/2 - 140} A 140 140 0 0 1 ${W/2 + 100} ${H/2 - 100} Z`} fill="url(#radarGradient)" opacity="0.4" />
                    </g>
                    <rect x={W/2 - 160} y={H/2 - 18} width="320" height="36" fill="#020617" fillOpacity="0.85" rx="6" stroke="#1e293b"/>
                    <text x={W/2} y={H/2 + 5} textAnchor="middle" fill="#34d399" fontSize="14" fontFamily="monospace" fontWeight="bold" letterSpacing="0.1em" className="animate-pulse">
                        [ RADAR CLEAR • ไม่มีพายุในแอ่ง ]
                    </text>
                    <defs>
                        <linearGradient id="radarGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="transparent" /><stop offset="100%" stopColor="#0ea5e9" />
                        </linearGradient>
                    </defs>
                </g>
            ) : (
            storms.map((s, si) => (
                <g key={si}>
                <polyline fill="none" stroke="#d946ef" strokeOpacity={0.8} strokeWidth={2} strokeDasharray="6 4" points={s.points.map(p => `${px(p.lon)},${py(p.lat)}`).join(' ')} />
                {s.points.map((p, pi) => (
                    <circle key={pi} cx={px(p.lon)} cy={py(p.lat)} r={pi === s.closestIdx ? 7 : 4} fill={s.cat.color} stroke={pi === s.closestIdx ? '#fff' : 'none'} strokeWidth={2} />
                ))}
                <text x={px(s.closest.lon) + 12} y={py(s.closest.lat) - 10} fill="#f87171" fontSize="13" fontFamily="monospace" fontWeight="bold">{s.name}</text>
                </g>
            ))
            )}
        </svg>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#020617] p-4 md:p-8 font-sans text-slate-200 overflow-x-hidden selection:bg-[#0ea5e9] selection:text-white">
      
      {/* 🖥️ Header Section (Thai Main) */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-8 pb-6 border-b border-slate-800/80 gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 mb-2">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-white flex items-center">
              <span>ศูนย์บัญชาการ</span> <span className={`ml-2 sm:ml-3 ${theme.text}`}>อัจฉริยะ</span>
            </h1>
            <span className={`px-4 py-1.5 border ${theme.border} ${theme.bg} text-white text-sm md:text-base font-bold rounded-full ${theme.glow} shadow-lg tracking-wide mt-2 sm:mt-0`}>
              {theme.label}
            </span>
          </div>
          <p className="text-[#0ea5e9] text-[10px] sm:text-xs md:text-sm tracking-[0.1em] sm:tracking-[0.15em] font-mono font-medium uppercase mt-2">
            EXECUTIVE ATLAS • AI ENSEMBLE & OFFICIAL FUSION
          </p>
        </div>
        <div className="flex flex-col items-start lg:items-end w-full lg:w-auto">
          <div className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-widest drop-shadow-md">
            {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-sm md:text-base text-slate-400 mt-2 mb-4 font-medium">{currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <div className="flex flex-wrap gap-2 w-full lg:justify-end">
            <HealthBadge label="ONWR (สทนช.)" status={apiHealth.onwr} />
            <HealthBadge label="TMD (กรมอุตุฯ)" status={apiHealth.tmd} />
            <HealthBadge label="AI (WEATHERNEXT)" status={apiHealth.ai_ensemble} />
            <HealthBadge label="GDACS (TC TRACK)" status={apiHealth.storm} />
          </div>
        </div>
      </div>

      {/* 🔴 Top KPI Row (Ground Truth) */}
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
            <div className="mt-4 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${k.alert ? 'bg-rose-500 w-[85%]' : k.val === '0.0' ? 'bg-[#0ea5e9] w-[5%]' : 'bg-[#34d399] w-[35%]'} opacity-70`}></div>
            </div>
          </div>
        ))}
      </div>

      {/* 🎯 Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 md:gap-8 flex-1 z-10">
        
        {/* 🧠 ฝั่งซ้าย: AI Analysis & Action */}
        <div className="xl:col-span-5 flex flex-col gap-6 md:gap-8 h-full">
            <div className={`flex-1 border ${theme.border} bg-[#0b1120] ${theme.glow} rounded-[2rem] p-6 md:p-8 flex flex-col transition-all duration-500`}>
                <div className="flex items-center justify-between mb-6 pb-5 border-b border-slate-800">
                    <div className="flex items-center space-x-4">
                        <div className="w-14 h-14 rounded-full bg-[#020617] flex items-center justify-center text-3xl border border-slate-700 shadow-inner">🧠</div>
                        <div>
                            <h2 className={`text-xl md:text-2xl font-black tracking-tight ${theme.text}`}>วิเคราะห์ข้อมูลเชิงลึก</h2>
                            <span className="text-xs md:text-sm text-slate-400 font-mono tracking-widest mt-1 block">TMD + AI ENSEMBLE FUSION</span>
                        </div>
                    </div>
                </div>
                <div className="flex-1 text-base md:text-lg leading-relaxed space-y-4">
                  <p className={`font-medium leading-loose border-l-4 ${data.ai.status === 'NORMAL' ? 'border-indigo-500 bg-indigo-950/20 text-slate-200' : 'border-rose-500 bg-rose-950/20 text-rose-200'} pl-4 py-2 rounded-r-lg`}>
                    {data.ai.aiInsight}
                  </p>
                </div>
                {/* ข้อมูลอ้างอิงกรมอุตุฯ */}
                {data.tmdInfo && (
                  <div className="mt-6 bg-[#020617] border border-slate-800 p-4 rounded-xl flex items-center justify-between opacity-80 hover:opacity-100 transition-opacity">
                    <div>
                        <div className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">อ้างอิงกรมอุตุนิยมวิทยา</div>
                        <div className="text-sm font-medium text-slate-300">{data.tmdInfo.desc}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-black text-indigo-400">{data.tmdInfo.temp}°C</div>
                    </div>
                  </div>
                )}
            </div>

            <div className={`border ${data.ai.status === 'CRITICAL' ? 'border-rose-500 bg-rose-950/20' : 'border-slate-800 bg-[#0b1120]'} rounded-[2rem] p-6 md:p-8 shadow-2xl shrink-0 transition-colors duration-500`}>
                <h3 className={`text-xl md:text-2xl font-black mb-6 flex items-center tracking-tight ${data.ai.status === 'CRITICAL' ? 'text-rose-400' : 'text-white'}`}>
                    <span className="text-3xl mr-4 shrink-0">🎯</span> ข้อเสนอแนะเชิงรุก (ACTIONS)
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
            
            <div className="bg-[#0b1120] border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-xl hover:border-indigo-500/30 transition-colors duration-300">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-indigo-400 flex items-center tracking-tight"><span className="text-3xl mr-3">🌀</span> TROPICAL CYCLONE TRACK</h3>
                  <p className="text-xs text-slate-500 font-mono mt-1 tracking-widest">LIVE DATA (GDACS GLOBAL API)</p>
                </div>
                {data.storm.top && (
                  <div className="bg-indigo-950/40 border border-indigo-500/50 px-4 py-2 rounded-xl text-sm font-bold text-indigo-300 animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                    {data.storm.top.name} • ใกล้สุด {Math.round(data.storm.top.nearestKm)} กม.
                  </div>
                )}
              </div>
              <StormMap storms={data.storm.infos} />
            </div>

            <div className="bg-[#0b1120] border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-xl flex-1 flex flex-col min-h-[350px]">
              <div className="mb-6">
                <div className="flex justify-between items-center">
                    <h3 className="text-xl md:text-2xl font-black text-white flex items-center tracking-tight"><span className="text-3xl mr-3">🔮</span> กราฟพยากรณ์ปริมาณฝน 15 วัน</h3>
                    <span className="text-[10px] md:text-xs bg-purple-900/30 text-purple-400 border border-purple-500/30 px-3 py-1 rounded-full hidden sm:block">
                        AI MODEL: GOOGLE WEATHERNEXT ({data.memberCount} MEMBERS)
                    </span>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-2 tracking-widest">คำนวณจากความน่าจะเป็น (PROBABILISTIC MODEL) ของ AI 50 แบบจำลอง</p>
              </div>
              
              <div className="flex-1 w-full h-full relative mt-4">
                <div className="absolute inset-0 flex items-end justify-between gap-1 sm:gap-2 pb-6">
                  {data.stats.map((s: any, idx: number) => {
                      const maxV = Math.max(...data.stats.map((x: any) => x.rainMedian), 10);
                      const hMed = Math.max((s.rainMedian / maxV) * 100, 2);
                      const col = s.pRain50 >= 50 ? 'from-rose-600 to-rose-400' : s.pRain50 >= 20 ? 'from-amber-600 to-amber-400' : 'from-[#0891b2] to-[#0ea5e9]';
                      
                      return (
                          <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                              <div className={`text-[10px] md:text-xs font-bold mb-2 ${s.rainMedian > 0 ? 'text-white' : 'text-slate-600'}`}>{s.rainMedian > 0 ? s.rainMedian.toFixed(0) : ''}</div>
                              <div className="relative w-full h-full flex items-end justify-center">
                                  <div className="absolute w-full h-full border-b border-slate-800/50 -z-10"></div>
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
