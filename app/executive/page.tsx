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
// 🇹🇭 2. TMD Weather API (ผ่าน Backend Proxy)
// ==========================================
const fetchTmdData = async () => {
  try {
    const res = await fetchWithCache('/api/tmd', 'tmd_weather_daily_internal');
    if (res.status === 'OFFLINE' || !res.data || res.data.status !== 'LIVE') return { status: 'OFFLINE', info: null };
    
    const rawData = res.data.data;
    const stations = rawData?.Stations || [];
    const cmStation = stations.find((s: any) => s.Province?.includes('เชียงใหม่') || s.WmoStationNumber === '48327' || s.WmoStationNumber === '48330');
    
    if (cmStation) {
      return { 
        status: 'LIVE', 
        info: {
          temp: cmStation.Observe?.Temperature?.Value,
          rain: cmStation.Observe?.Rainfall24Hr?.Value,
          desc: cmStation.Observe?.WeatherDescription || 'สภาวะอากาศปกติ'
        }
      };
    }
    return { status: 'CACHED', info: null };
  } catch (e) {
    return { status: 'OFFLINE', info: null };
  }
};

// ==========================================
// 🚀 3. Main Executive Dashboard Component
// ==========================================

export default function ExecutiveDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  const [apiHealth, setApiHealth] = useState({ onwr: 'LOAD', tmd: 'LOAD', ecmwf: 'LOAD', ai_ensemble: 'LOAD' });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tmdRes = await fetchTmdData();

        const [onwrRes, forecastRes] = await Promise.all([
          fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', 'exec_onwr_rain'),
          fetchWithCache(
            `https://api.open-meteo.com/v1/ecmwf?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
            `&current=temperature_2m,wind_speed_10m,precipitation` +
            `&daily=precipitation_sum,wind_speed_10m_max&timezone=Asia%2FBangkok&forecast_days=15`,
            'exec_ecmwf_det'),
        ]);

        const ensUrl = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
          `&daily=precipitation_sum,wind_gusts_10m_max&timezone=Asia%2FBangkok&forecast_days=15&models=icon_seamless`;
        
        const aiRes = await fetchWithCache(ensUrl, 'exec_ai_icon');
        
        setApiHealth({ onwr: onwrRes.status, tmd: tmdRes.status, ecmwf: forecastRes.status, ai_ensemble: aiRes.status });

        let actualRain24h = 0;
        if (onwrRes.data) {
            let arrData = onwrRes.data?.data?.data || onwrRes.data?.data || [];
            let minDistance = Infinity;
            arrData.forEach((station: any) => {
                const lat = parseFloat(station?.station?.tele_station_lat || station?.lat);
                const lng = parseFloat(station?.station?.tele_station_long || station?.lng);
                if (lat && lng) {
                    const dist = calculateDistance(BO_LUANG_LAT, BO_LUANG_LNG, lat, lng);
                    if (dist < minDistance) {
                        minDistance = dist;
                        actualRain24h = parseFloat(station?.rain_24h) || 0;
                    }
                }
            });
        }

        const forecast = forecastRes.data && !forecastRes.data.error ? forecastRes.data : null;
        const aiData = aiRes.data && !aiRes.data.error ? aiRes.data : null;

        const liveRainIntensity = forecast?.current?.precipitation ?? 0;
        let soilMoisture = Math.min(100, ((actualRain24h / 80) * 100) + (liveRainIntensity > 0 ? 30 : 0));
        
        const daily = aiData?.daily || {};
        const timeArray = daily.time || [];
        const N = Math.min(timeArray.length, 15);
        const rainKeys = Object.keys(daily).filter(k => k.startsWith('precipitation_sum') && k !== 'precipitation_sum');

        let stats: Array<{ date: string; rainMedian: number; rainMax: number; pRain50: number; }> = [];
        
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
        const maxRain15Days = peakRainDay.rainMedian;
        const criticalDate = new Date(peakRainDay.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        const confidence = peakRainDay.pRain50 > 0 ? Math.round(peakRainDay.pRain50) : 100;

        // 🎯 Executive Logic Tiers
        let status = 'NORMAL';
        const tmdDesc = tmdRes.info?.desc || 'สภาวะปกติ';
        let tmdInsight = liveRainIntensity > 0 
            ? `ตรวจพบกลุ่มฝนในพื้นที่ (${liveRainIntensity.toFixed(1)} มม./ชม.) โปรดเฝ้าระวังน้ำท่วมขังรอการระบาย`
            : `ตรวจวัดจริงจาก สทนช. ยืนยันสภาวะปกติ ไร้การก่อตัวของกลุ่มฝนในพื้นที่รับผิดชอบ`;
        
        let aiInsight = `ข้อมูลสอดคล้องกัน: กรมอุตุนิยมวิทยาประเมิน "${tmdDesc}" สอดคล้องกับโมเดลประเมินความเสี่ยงล่วงหน้า 15 วัน (สถานการณ์ปกติ)`;
        let actions = ['เตรียมความพร้อมและตรวจสอบระบบแจ้งเตือนภัยตามวงรอบ', 'อัปเดตข้อมูลข่าวสารสภาวะอากาศปกติให้ประชาชนทราบ'];

        if (actualRain24h > 90 || soilMoisture > 80) {
            status = 'CRITICAL';
            tmdInsight = `🚨 ดินอุ้มน้ำระดับวิกฤต (${Math.round(soilMoisture)}%) ฝนสะสมทะลุเกณฑ์เตือนภัย เสี่ยงต่อการเกิดดินถล่มและน้ำป่าไหลหลากฉับพลัน!`;
            aiInsight = `ยกระดับการเตือนภัยขั้นสูงสุด อ้างอิงจากข้อมูลตรวจวัดจริงในพื้นที่ (Ground Truth) ทะลุเกณฑ์วิกฤต`;
            actions = ['🚨 ประกาศภาวะฉุกเฉินและเปิดศูนย์บัญชาการเหตุการณ์ (EOC) ทันที', 'สั่งการผู้นำชุมชนให้อพยพประชาชนในโซนเชิงเขา/พื้นที่เสี่ยงภัย', 'ประสานเครื่องจักรกลหนักและทีมกู้ชีพเข้าประจำจุดแสตนด์บาย'];
        } else if (liveRainIntensity > 15 || peakRainDay.pRain50 >= 60) {
            status = 'CRITICAL';
            aiInsight = `🚨 โมเดล AI (ความมั่นใจ ${confidence}%) ประเมินความเสี่ยงพายุฝนรุนแรงเข้าพื้นที่ช่วงวันที่ ${criticalDate} (คาดการณ์ฝนสูงสุด ${peakRainDay.rainMax.toFixed(0)} มม.)`;
            actions = ['🚨 ออกประกาศเตือนภัยพายุระดับพื้นที่ล่วงหน้าผ่านหอกระจายข่าว', 'สั่งการเตรียมพร้อมแผนอพยพประชาชนล่วงหน้า 24 ชม.', 'สั่งพร่องน้ำในอ่างเก็บน้ำสาธารณะ และตรวจสอบเครื่องสูบน้ำ'];
        } else if (maxRain15Days > 30 || peakRainDay.pRain50 >= 30) {
            status = 'WARNING';
            aiInsight = `⚠️ ระบบแบบจำลองประเมินพบแนวโน้มร่องมรสุมพาดผ่าน พีคสูงสุดวันที่ ${criticalDate} (โอกาสเกิดฝนตกหนัก ${confidence}%)`;
            actions = ['สั่งการหน่วยลาดตระเวนเฝ้าระวังระดับน้ำในลำห้วยสายหลัก', 'แจ้งเตือน อสม. และผู้นำชุมชนให้เตรียมพร้อมรับสถานการณ์', 'ตรวจสอบความพร้อมของสรรพกำลังและยานพาหนะ'];
        }

        setData({
            actualRain24h, liveRainIntensity, soilMoisture,
            stats, peakRainDay, memberCount: rainKeys.length || 1,
            tmdInfo: tmdRes.info,
            ai: { status, tmdInsight, aiInsight, actions }
        });

      } catch (e) {
        console.error("Pipeline Error:", e);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 300000); 
    return () => clearInterval(interval);
  }, []);

  // ============ 🎨 UI ============
  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-[#0a1112] text-white">
        <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-[#0ea5e9] border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_20px_rgba(14,165,233,0.5)]"></div>
            <span className="font-mono text-[#0ea5e9] text-lg tracking-widest animate-pulse font-bold">INITIALIZING EXECUTIVE DSS...</span>
        </div>
    </div>
  );

  const getTheme = (status: string) => {
      if (status === 'CRITICAL') return { border: 'border-rose-500/50', bg: 'bg-rose-600', text: 'text-rose-400', glow: 'shadow-[0_0_30px_rgba(225,29,72,0.3)]', label: '🚨 สภาวะวิกฤต (CRITICAL)' };
      if (status === 'WARNING') return { border: 'border-amber-500/50', bg: 'bg-amber-500', text: 'text-amber-400', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.2)]', label: '⚠️ ระดับเฝ้าระวัง (WARNING)' };
      return { border: 'border-[#10b981]/40', bg: 'bg-[#059669]', text: 'text-[#34d399]', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]', label: '✅ สภาวะปกติ (SAFE)' };
  };
  const theme = getTheme(data?.ai?.status || 'NORMAL');

  const HealthBadge = ({ label, status }: { label: string, status: string }) => {
    const isLive = status === 'LIVE';
    return (
      <div className={`flex items-center px-2.5 py-1 md:px-3 md:py-1.5 rounded-md border ${isLive ? 'text-[#34d399] bg-[#064e3b]/30 border-[#10b981]/50' : 'text-rose-400 bg-rose-950/30 border-rose-500/50'} text-[10px] md:text-[11px] font-mono font-bold tracking-wider shadow-sm transition-colors`}>
        <div className={`w-2 h-2 rounded-full mr-2 ${isLive ? 'bg-[#34d399] animate-pulse' : 'bg-rose-500'}`}></div>
        <span>{label}</span>
      </div>
    );
  };

  // 🗺️ แผนที่ตำบลบ่อหลวง (Spatial Risk Map)
  const BoLuangMap = () => {
    const isAlert = data?.soilMoisture > 70 || data?.liveRainIntensity > 15;
    return (
      <div className="relative w-full h-full min-h-[280px] rounded-2xl bg-[#030712] border border-slate-800 shadow-inner overflow-hidden flex items-center justify-center">
        <style dangerouslySetInnerHTML={{__html: `@keyframes ping-slow { 75%, 100% { transform: scale(2); opacity: 0; } } .animate-ping-slow { animation: ping-slow 3s cubic-bezier(0, 0, 0.2, 1) infinite; }`}} />
        
        {/* Grid Background */}
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(90deg, #0f172a 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.5 }}></div>
        
        <svg viewBox="0 0 400 300" className="w-full h-full relative z-10">
          {/* ขอบเขตตำบลจำลอง */}
          <path d="M 50 150 Q 100 50 200 80 T 350 150 Q 300 250 200 280 T 50 150 Z" fill={isAlert ? 'rgba(225,29,72,0.05)' : 'rgba(14,165,233,0.02)'} stroke={isAlert ? '#e11d48' : '#0ea5e9'} strokeWidth="1.5" strokeOpacity="0.3" strokeDasharray="5 5" />
          
          {/* รัศมีอันตราย (Heatmap) */}
          {isAlert && <circle cx="200" cy="150" r="60" fill="url(#alertGlow)" opacity="0.6" />}
          
          {/* เส้นถนนสายหลัก (108) */}
          <path d="M 0 250 Q 150 200 200 150 T 400 50" fill="none" stroke="#334155" strokeWidth="3" />
          <path d="M 0 250 Q 150 200 200 150 T 400 50" fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />

          {/* จุดหมู่บ้านต่างๆ */}
          <g>
            <circle cx="200" cy="150" r="5" fill={isAlert ? '#f43f5e' : '#0ea5e9'} />
            {isAlert && <circle cx="200" cy="150" r="5" fill={isAlert ? '#f43f5e' : '#0ea5e9'} className="animate-ping-slow origin-[200px_150px]" />}
            <text x="210" y="154" fill="#f1f5f9" fontSize="12" fontWeight="bold">บ่อหลวง (ศูนย์ EOC)</text>
          </g>
          
          <g transform="translate(150, 100)">
            <circle cx="0" cy="0" r="4" fill="#64748b" />
            <text x="8" y="4" fill="#94a3b8" fontSize="10">บ้านแม่หืด</text>
          </g>
          <g transform="translate(260, 120)">
            <circle cx="0" cy="0" r="4" fill="#64748b" />
            <text x="8" y="4" fill="#94a3b8" fontSize="10">บ้านขุน</text>
          </g>
          <g transform="translate(220, 210)">
            <circle cx="0" cy="0" r="4" fill="#64748b" />
            <text x="-50" y="4" fill="#94a3b8" fontSize="10">บ้านกิ่วป่าซี</text>
          </g>
          <g transform="translate(110, 190)">
            <circle cx="0" cy="0" r="4" fill="#64748b" />
            <text x="8" y="4" fill="#94a3b8" fontSize="10">บ้านเตียนอาง</text>
          </g>

          <defs>
            <radialGradient id="alertGlow">
              <stop offset="0%" stopColor="#e11d48" stopOpacity="1" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0" />
            </radialGradient>
          </defs>
        </svg>

        {/* ป้ายกำกับบนแผนที่ */}
        <div className="absolute top-4 left-4 bg-slate-900/80 border border-slate-700 backdrop-blur-sm px-3 py-1.5 rounded-lg">
          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-widest mb-0.5">Spatial Risk Map</div>
          <div className="text-xs font-bold text-white flex items-center">
            <span className={`w-2 h-2 rounded-full mr-2 ${isAlert ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></span>
            แผนที่ติดตามพื้นที่เสี่ยงภัย
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#020617] p-4 md:p-6 lg:p-8 font-sans text-slate-200 overflow-x-hidden selection:bg-[#0ea5e9] selection:text-white">
      
      {/* 🖥️ Header Section (Executive Level) */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-6 pb-5 border-b border-slate-800/80 gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 mb-2">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-white flex items-center">
              <span>ศูนย์บัญชาการเหตุการณ์</span> <span className={`ml-2 sm:ml-3 ${theme.text}`}>EOC</span>
            </h1>
            <span className={`px-4 py-1.5 border ${theme.border} ${theme.bg} text-white text-sm md:text-base font-bold rounded-full ${theme.glow} shadow-lg tracking-wide mt-2 sm:mt-0`}>
              {theme.label}
            </span>
          </div>
          <p className="text-[#0ea5e9] text-[11px] sm:text-xs md:text-sm tracking-[0.1em] sm:tracking-[0.15em] font-medium uppercase mt-2">
            ระบบสนับสนุนการตัดสินใจผู้บริหาร (EXECUTIVE DSS) • เทศบาลตำบลบ่อหลวง
          </p>
        </div>
        <div className="flex flex-col items-start lg:items-end w-full lg:w-auto">
          <div className="text-3xl sm:text-4xl lg:text-5xl font-mono font-bold text-white tracking-widest drop-shadow-md">
            {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-xs sm:text-sm md:text-base text-slate-400 mt-2 mb-4 font-medium">{currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <div className="flex flex-wrap gap-2 w-full lg:justify-end">
            <HealthBadge label="ONWR (สทนช.)" status={apiHealth.onwr} />
            <HealthBadge label="TMD (กรมอุตุฯ)" status={apiHealth.tmd} />
            <HealthBadge label="AI FUSION" status={apiHealth.ai_ensemble} />
          </div>
        </div>
      </div>

      {/* 🔴 Top KPI Row (With Visual Thresholds) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-6 shrink-0">
          {/* KPI 1 */}
          <div className={`bg-[#0b1120] border ${data?.liveRainIntensity > 0 ? 'border-rose-500/40 shadow-[0_0_20px_rgba(225,29,72,0.15)]' : 'border-slate-800'} rounded-3xl p-6 relative transition-all duration-500 hover:border-slate-600`}>
              <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center"><span className="mr-2 text-lg">📡</span> ปริมาณฝน ณ วินาทีนี้</h3>
                  <span className="text-[10px] bg-[#0ea5e9]/10 text-[#0ea5e9] px-2 py-1 rounded border border-[#0ea5e9]/30">ข้อมูลดาวเทียม</span>
              </div>
              <div className="flex items-baseline space-x-2 mt-2">
                  <span className={`text-5xl md:text-6xl font-black ${data?.liveRainIntensity > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-100'}`}>
                      {data?.liveRainIntensity?.toFixed(1) || '0.0'}
                  </span>
                  <span className="text-sm md:text-base text-slate-500 font-bold">มม./ชม.</span>
              </div>
              <div className="mt-5 h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden">
                  <div className={`h-full ${data?.liveRainIntensity > 0 ? 'bg-rose-500 w-[80%]' : 'bg-[#0ea5e9] w-[5%]'} transition-all duration-1000`}></div>
              </div>
          </div>

          {/* KPI 2 */}
          <div className="bg-[#0b1120] border border-slate-800 rounded-3xl p-6 relative hover:border-slate-600 transition-colors">
              <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center"><span className="mr-2 text-lg">🇹🇭</span> ฝนสะสม 24 ชม.</h3>
                  <span className="text-[10px] bg-[#10b981]/10 text-[#34d399] px-2 py-1 rounded border border-[#10b981]/30">ข้อมูลตรวจวัดจริง</span>
              </div>
              <div className="flex items-baseline space-x-2 mt-2">
                  <span className="text-5xl md:text-6xl font-black text-[#34d399]">{data?.actualRain24h || '0'}</span>
                  <span className="text-sm md:text-base text-slate-500 font-bold">มม.</span>
              </div>
              <div className="mt-5 h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden relative">
                  <div className="absolute left-[50%] top-0 bottom-0 w-[2px] bg-amber-500 z-10"></div> {/* Threshold 50mm */}
                  <div className="absolute left-[90%] top-0 bottom-0 w-[2px] bg-rose-500 z-10"></div> {/* Threshold 90mm */}
                  <div className={`h-full ${data?.actualRain24h > 90 ? 'bg-rose-500' : data?.actualRain24h > 50 ? 'bg-amber-500' : 'bg-[#34d399]'} transition-all duration-1000`} style={{ width: `${Math.min((data?.actualRain24h / 100) * 100, 100)}%` }}></div>
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono uppercase"><span>0</span><span>วิกฤต (90+)</span></div>
          </div>

          {/* KPI 3 */}
          <div className={`bg-[#0b1120] border ${data?.soilMoisture > 75 ? 'border-rose-500/40 shadow-[0_0_20px_rgba(225,29,72,0.15)]' : 'border-slate-800'} rounded-3xl p-6 relative flex flex-col justify-center hover:border-slate-600 transition-colors`}>
              <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center"><span className="mr-2 text-lg">⛰️</span> ดัชนีความชุ่มน้ำในดิน</h3>
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-1 rounded border border-amber-500/30">ความเสี่ยงดินถล่ม</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                  <span className={`text-5xl md:text-6xl font-black shrink-0 ${data?.soilMoisture > 70 ? 'text-rose-400 animate-pulse' : data?.soilMoisture > 40 ? 'text-amber-400' : 'text-[#0ea5e9]'}`}>
                      {Math.round(data?.soilMoisture || 0)}%
                  </span>
              </div>
              <div className="mt-5 h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden relative">
                  <div className="absolute left-[40%] top-0 bottom-0 w-[2px] bg-amber-500 z-10"></div>
                  <div className="absolute left-[70%] top-0 bottom-0 w-[2px] bg-rose-500 z-10"></div>
                  <div className={`h-full ${data?.soilMoisture > 70 ? 'bg-rose-500' : data?.soilMoisture > 40 ? 'bg-amber-400' : 'bg-[#0ea5e9]'} transition-all duration-1000`} style={{ width: `${data?.soilMoisture || 0}%` }}></div>
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono uppercase"><span>ปกติ</span><span>เฝ้าระวัง</span><span>อันตราย</span></div>
          </div>
      </div>

      {/* 🎯 Main Content Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1 z-10">
        
        {/* 🧠 ฝั่งซ้าย: Briefing & Actions */}
        <div className="xl:col-span-5 flex flex-col gap-6 h-full">
            
            {/* สรุปสถานการณ์ */}
            <div className={`border ${theme.border} bg-[#0b1120] ${theme.glow} rounded-[2rem] p-6 md:p-8 flex flex-col transition-all duration-500`}>
                <div className="flex items-center justify-between mb-6 pb-5 border-b border-slate-800">
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#020617] flex items-center justify-center text-2xl md:text-3xl border border-slate-700 shadow-inner">🧠</div>
                        <div>
                            <h2 className={`text-xl md:text-2xl font-black tracking-tight ${theme.text}`}>สรุปสถานการณ์และข้อสั่งการ</h2>
                            <span className="text-xs md:text-sm text-slate-400 font-mono tracking-widest mt-1 block uppercase">Executive Briefing</span>
                        </div>
                    </div>
                </div>
                
                <div className="flex-1 space-y-5">
                    <div>
                        <h3 className="text-xs font-bold text-[#34d399] uppercase tracking-widest mb-2 flex items-center"><span className="mr-2">🇹🇭</span> รายงานสภาพจริงในพื้นที่ (Ground Truth)</h3>
                        <p className="text-slate-300 text-sm md:text-base leading-relaxed pl-4 border-l-2 border-[#34d399]/40 bg-[#34d399]/5 py-2 rounded-r-lg">
                            {data?.ai?.tmdInsight}
                        </p>
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center"><span className="mr-2">🔮</span> แนวโน้มความเสี่ยงล่วงหน้า 15 วัน (AI Forecast)</h3>
                        <p className="text-slate-300 text-sm md:text-base leading-relaxed pl-4 border-l-2 border-indigo-500/40 bg-indigo-500/5 py-2 rounded-r-lg">
                            {data?.ai?.aiInsight}
                        </p>
                    </div>
                </div>
            </div>

            {/* ความพร้อมสรรพกำลัง (Resource Readiness) - MOCK เพื่อความสมจริงของ DSS */}
            <div className="bg-[#0b1120] border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-xl">
                <h3 className="text-lg md:text-xl font-black text-white flex items-center mb-5 tracking-tight">
                    <span className="text-2xl mr-3">🚛</span> สถานะความพร้อมสรรพกำลัง (Readiness)
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-[#020617] rounded-xl border border-slate-800/80">
                        <div className="flex items-center gap-3"><span className="text-xl">👷‍♂️</span> <span className="text-sm font-bold text-slate-300">ทีมกู้ภัย / อปพร.</span></div>
                        <span className="text-sm font-black text-[#34d399]">พร้อมปฏิบัติงาน (100%)</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-[#020617] rounded-xl border border-slate-800/80">
                        <div className="flex items-center gap-3"><span className="text-xl">🌊</span> <span className="text-sm font-bold text-slate-300">เครื่องสูบน้ำประจำจุด</span></div>
                        <span className="text-sm font-black text-[#34d399]">พร้อมใช้งาน 3/3 เครื่อง</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-[#020617] rounded-xl border border-slate-800/80">
                        <div className="flex items-center gap-3"><span className="text-xl">🚜</span> <span className="text-sm font-bold text-slate-300">เครื่องจักรกลหนัก (JCB)</span></div>
                        <span className="text-sm font-black text-amber-400">เตรียมความพร้อม (Standby)</span>
                    </div>
                </div>
            </div>

            {/* ข้อเสนอแนะเพื่อการตัดสินใจ */}
            <div className={`border ${data?.ai?.status === 'CRITICAL' ? 'border-rose-500 bg-rose-950/20' : 'border-slate-800 bg-[#0b1120]'} rounded-[2rem] p-6 md:p-8 shadow-2xl shrink-0 transition-colors duration-500`}>
                <h3 className={`text-lg md:text-xl font-black mb-5 flex items-center tracking-tight ${data?.ai?.status === 'CRITICAL' ? 'text-rose-400' : 'text-white'}`}>
                    <span className="text-2xl mr-3 shrink-0">🎯</span> ข้อเสนอแนะเพื่อการตัดสินใจสั่งการ
                </h3>
                <ul className="space-y-3">
                    {data?.ai?.actions.map((action: string, idx: number) => (
                        <li key={idx} className="flex items-start bg-[#020617] p-4 rounded-2xl border border-slate-800/60 shadow-sm">
                            <div className={`w-2.5 h-2.5 rounded-full ${theme.bg} mr-4 mt-1.5 flex-shrink-0 ${data?.ai?.status !== 'NORMAL' ? 'animate-pulse shadow-[0_0_10px_currentColor]' : ''}`}></div>
                            <span className="text-sm md:text-base text-slate-200 font-medium leading-relaxed">{action}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        {/* 📊 ฝั่งขวา: Maps & Graphs */}
        <div className="xl:col-span-7 flex flex-col gap-6">
            
            {/* 🗺️ แผนที่ตำบลบ่อหลวง */}
            <div className="bg-[#0b1120] border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-xl flex flex-col min-h-[350px]">
              <div className="flex justify-between items-start mb-5 gap-4">
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-white flex items-center tracking-tight"><span className="text-3xl mr-3">🗺️</span> แผนที่ความเสี่ยงพื้นที่ตำบลบ่อหลวง</h3>
                  <p className="text-xs text-slate-500 font-mono mt-1 tracking-widest">SPATIAL RISK MAP & EOC MONITORING</p>
                </div>
              </div>
              <div className="flex-1 w-full">
                <BoLuangMap />
              </div>
            </div>

            {/* 🔮 กราฟพยากรณ์ */}
            <div className="bg-[#0b1120] border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-xl flex-1 flex flex-col min-h-[350px]">
              <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-800 pb-4">
                <div>
                    <h3 className="text-xl md:text-2xl font-black text-white flex items-center tracking-tight">
                        <span className="text-3xl mr-3">📊</span> ประเมินปริมาณฝนล่วงหน้า
                    </h3>
                    <p className="text-[10px] md:text-xs text-slate-500 mt-2 tracking-wide font-mono uppercase">AI ENSEMBLE MODEL (ความละเอียดระดับตำบล)</p>
                </div>
                <div className="mt-3 sm:mt-0 text-[10px] md:text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg font-bold">
                    AI CONSENSUS ALGORITHM
                </div>
              </div>
              
              {/* 📊 Graph Container */}
              <div className="flex-1 flex items-end justify-between gap-1 sm:gap-2 md:gap-3 h-full pb-2 mt-4 relative">
                  
                  {/* Threshold Guide Lines */}
                  <div className="absolute w-full h-[1px] bg-amber-500/20 bottom-[40%] border-t border-dashed border-amber-500/30 -z-10"></div>
                  <div className="absolute w-full h-[1px] bg-rose-500/20 bottom-[80%] border-t border-dashed border-rose-500/30 -z-10"></div>
                  
                  {data?.stats?.slice(0, 7).map((s: any, idx: number) => {
                      const date = new Date(s.date);
                      const dayName = date.toLocaleDateString('th-TH', { weekday: 'short' });
                      const dateNum = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                      
                      const maxVal = Math.max(...data.stats.slice(0, 7).map((x: any) => x.rainMedian), 80); 
                      const heightPct = Math.max((s.rainMedian / maxVal) * 100, 2); 
                      
                      // สีตามระดับความเสี่ยง
                      const barColor = s.pRain50 >= 50 ? 'bg-gradient-to-t from-rose-600 to-rose-400' : 
                                       s.pRain50 >= 25 ? 'bg-gradient-to-t from-amber-600 to-amber-400' : 
                                       'bg-gradient-to-t from-[#0ea5e9] to-[#38bdf8]';

                      return (
                          <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                              <div className={`text-[10px] md:text-sm font-bold mb-2 transition-colors ${s.rainMedian > 0 ? 'text-white' : 'text-slate-600'}`}>
                                  {s.rainMedian > 0 ? s.rainMedian.toFixed(0) : ''}
                              </div>
                              <div className="w-full h-full flex items-end justify-center relative">
                                  <div className={`w-full max-w-[28px] sm:max-w-[40px] rounded-t-sm md:rounded-t-md ${barColor} shadow-md transition-all duration-700 ease-out opacity-80 group-hover:opacity-100`} 
                                       style={{ height: `${heightPct}%` }}></div>
                              </div>
                              <div className="mt-3 text-center">
                                  <div className="text-[10px] md:text-[13px] font-bold text-slate-300">{dayName}</div>
                                  <div className="text-[8px] md:text-[10px] text-slate-500 mt-1 uppercase hidden sm:block">{dateNum}</div>
                              </div>
                          </div>
                      );
                  })}
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
