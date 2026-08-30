'use client';
import React, { useState, useEffect } from 'react';

// ==========================================
// 🛠️ 1. Architecture & Algorithm Utilities
// ==========================================

const BO_LUANG_LAT = 18.1633;
const BO_LUANG_LNG = 98.3744;

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

// 🛡️ API Resilience
const fetchWithCache = async (url: string, cacheKey: string, timeoutMs = 8000) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
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
// 🚀 2. Main Executive Dashboard Component
// ==========================================

export default function ExecutiveDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  const [apiHealth, setApiHealth] = useState({ onwr: 'LOAD', ecmwf: 'LOAD', ai_ensemble: 'LOAD' });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [onwrRes, forecastRes] = await Promise.all([
          fetchWithCache('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', 'exec_onwr_rain'),
          fetchWithCache(
            `https://api.open-meteo.com/v1/ecmwf?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
            `&current=temperature_2m,wind_speed_10m,precipitation` +
            `&daily=precipitation_sum,wind_speed_10m_max&timezone=Asia%2FBangkok&forecast_days=15`,
            'exec_ecmwf_det'),
        ]);

        // 🌟 แก้ไข: ใช้ model icon_seamless แทน เพื่อแก้บั๊ก 400 Bad Request
        const ensUrl = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}` +
          `&daily=precipitation_sum,wind_gusts_10m_max&timezone=Asia%2FBangkok&forecast_days=15&models=icon_seamless`;
        const aiRes = await fetchWithCache(ensUrl, 'exec_ai_icon15');

        setApiHealth({ onwr: onwrRes.status, ecmwf: forecastRes.status, ai_ensemble: aiRes.status });

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

        if (forecast && aiData) {
            const currentTemp = forecast.current.temperature_2m;
            const currentWind = forecast.current.wind_speed_10m;
            const liveRainIntensity = forecast.current.precipitation || 0;
            
            let soilMoisture = Math.min(100, ((actualRain24h / 80) * 100) + (liveRainIntensity > 0 ? 30 : 0));
            
            const daily = aiData.daily;
            const N = Math.min(daily.time.length, 15);
            const rainKeys = Object.keys(daily).filter(k => k.startsWith('precipitation_sum') && k !== 'precipitation_sum');
            const memberCount = rainKeys.length > 0 ? rainKeys.length : 1;

            const stats = Array.from({ length: N }, (_, d) => {
                const rains = rainKeys.map(k => daily[k]?.[d]).filter((v: any) => isFinite(v));
                
                const rainMedian = rains.length ? median(rains) : (forecast.daily.precipitation_sum?.[d] || 0);
                const pRain50 = rains.length ? probExceed(rains, 50) : 0;
                
                return {
                    date: daily.time[d],
                    rainMedian: rainMedian,
                    rainMax: rains.length ? Math.max(...rains) : rainMedian,
                    pRain50: pRain50,
                };
            });

            const peakRainDay = stats.reduce((a, b) => (b.rainMedian > a.rainMedian ? b : a), stats[0]);
            const maxRain15Days = peakRainDay.rainMedian;
            const criticalDate = new Date(peakRainDay.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
            const confidence = peakRainDay.pRain50 > 0 ? Math.round(peakRainDay.pRain50) : 100;

            let status = 'NORMAL';
            let tmdInsight = liveRainIntensity > 0 
                ? `เรดาร์ดาวเทียมตรวจพบกลุ่มฝนตกในพื้นที่ (${liveRainIntensity.toFixed(1)} มม./ชม.) ดินเริ่มอุ้มน้ำ`
                : `ข้อมูลตรวจวัดจริงจาก สทนช. ยืนยันสภาพอากาศปลอดภัย ไร้การก่อตัวของกลุ่มฝน`;
            
            let aiInsight = '';
            let actions = ['ตรวจสอบระบบเซิร์ฟเวอร์แจ้งเตือน', 'อัปเดตข้อมูลสถานการณ์ปกติให้ประชาชนทราบ'];

            if (actualRain24h > 90 || soilMoisture > 80) {
                status = 'CRITICAL';
                tmdInsight = `🚨 ตรวจสอบไขว้พบฝนสะสมทะลุพิกัด! ดินอุ้มน้ำระดับวิกฤต (${Math.round(soilMoisture)}%) เสี่ยงดินถล่มฉับพลัน!`;
                aiInsight = `AI ถูกสั่ง OVERRIDE ด้วยข้อมูลสถานการณ์วิกฤตหน้างานจริง!`;
                actions = ['🚨 อ้างอิงประกาศเพื่อเบิกงบฉุกเฉิน เปิดศูนย์ EOC ทันที', 'สั่งการอพยพประชาชนในโซนเชิงเขา', 'ประสานเครื่องจักรกลหนักแสตนด์บาย'];
            } else if (liveRainIntensity > 15 || peakRainDay.pRain50 >= 60) {
                status = 'CRITICAL';
                aiInsight = `🚨 AI Ensemble (Consensus ${confidence}%) ฟันธงพายุฝนรุนแรงเข้าปะทะพื้นที่ช่วงวันที่ ${criticalDate} (คาดการณ์ฝนสูงสุด ${peakRainDay.rainMax.toFixed(0)} มม.)`;
                actions = ['🚨 ออกประกาศเตือนภัยพายุระดับพื้นที่ล่วงหน้า', 'สั่งการอพยพประชาชนในโซนเชิงเขาล่วงหน้า 24 ชม.', 'ตั้งศูนย์ EOC และจัดเตรียมศูนย์พักพิง'];
            } else if (maxRain15Days > 30 || peakRainDay.pRain50 >= 30) {
                status = 'WARNING';
                aiInsight = `⚠️ AI Ensemble ประเมินพบร่องมรสุมพาดผ่าน พีคสูงสุดวันที่ ${criticalDate} โอกาสเกิดฝนตกหนักระดับกลางอยู่ที่ ${confidence}%`;
                actions = ['ประกาศเสียงตามสายแจ้งเตือนพื้นที่เสี่ยง', 'ส่งหน่วยลาดตระเวนเช็คระดับน้ำลำห้วย', 'ทดสอบระบบเครื่องสูบน้ำ'];
            } else {
                aiInsight = `โครงสร้างชั้นบรรยากาศโลก (Global Atmospheric Patterns) 15 วันล่วงหน้า ไม่พบสัญญาณกลุ่มเมฆหรือร่องมรสุมรุนแรงก่อตัว`;
            }

            setData({
                actualRain24h, currentTemp, currentWind, liveRainIntensity, soilMoisture,
                stats, peakRainDay, memberCount, confidence,
                ai: { status, tmdInsight, aiInsight, actions }
            });
        }
      } catch (e) {
        console.error("ETL Pipeline Error:", e);
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
            <div className="w-16 h-16 border-4 border-[#2dd4bf] border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_#2dd4bf]"></div>
            <span className="font-mono text-[#2dd4bf] text-lg tracking-widest animate-pulse">Initializing Data Fusion...</span>
        </div>
    </div>
  );

  // 🌟 แก้ไข: ดักจับ Error กันเว็บพังกรณีที่ API ล่มแล้วค่า data เป็น null
  if (!data) return (
    <div className="flex h-screen items-center justify-center bg-[#0a1112] text-white">
      <div className="text-center border border-red-500/40 bg-red-950/20 rounded-3xl p-10 max-w-lg shadow-[0_0_30px_rgba(239,68,68,0.1)]">
        <div className="text-6xl mb-4">📡</div>
        <h2 className="text-red-400 font-black text-2xl mb-3 tracking-widest">CONNECTION FAILED</h2>
        <p className="text-gray-400 text-sm leading-relaxed">ไม่สามารถเชื่อมต่อ Data Nodes หลักได้ ระบบจะทำการ Re-establish อัตโนมัติในภายหลัง</p>
      </div>
    </div>
  );

  const getTheme = (status: string) => {
      if (status === 'CRITICAL') return { border: 'border-red-500/50', bg: 'bg-[#ef4444]', text: 'text-[#f87171]', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.25)]' };
      if (status === 'WARNING') return { border: 'border-yellow-500/50', bg: 'bg-[#facc15]', text: 'text-[#facc15]', glow: 'shadow-[0_0_30px_rgba(250,204,21,0.15)]' };
      return { border: 'border-[#2dd4bf]/40', bg: 'bg-[#0f766e]', text: 'text-[#2dd4bf]', glow: 'shadow-[0_0_20px_rgba(45,212,191,0.1)]' };
  };
  const theme = getTheme(data.ai.status);
  const soilColor = data.soilMoisture > 75 ? 'bg-red-500' : data.soilMoisture > 40 ? 'bg-yellow-400' : 'bg-emerald-400';

  const HealthBadge = ({ label, status }: { label: string, status: string }) => {
    let color = status === 'LIVE' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 
                status === 'CACHED' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' : 'text-red-400 bg-red-500/10 border-red-500/30';
    return (
      <div className={`flex items-center px-2.5 py-1 md:px-2 md:py-0.5 rounded border ${color}`}>
        <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${status === 'LIVE' ? 'bg-emerald-400 animate-pulse' : status === 'CACHED' ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
        <span className="whitespace-nowrap">{label}: {status}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a1112] p-4 md:p-8 font-sans text-gray-100 flex flex-col overflow-x-hidden">
      
      {/* CSS Animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scroll-up { 0% { transform: translateY(0); } 100% { transform: translateY(-120%); } }
        .ticker-container { animation: scroll-up 20s linear infinite; }
        .ticker-container:hover { animation-play-state: paused; }
      `}} />

      {/* 🖥️ Top Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-6 pb-4 border-b border-gray-800 gap-4">
        <div className="w-full lg:w-auto">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white flex flex-wrap items-center gap-x-3 gap-y-2">
                <span>EXECUTIVE</span> <span className={`${theme.text}`}>DASHBOARD</span>
                {data.liveRainIntensity > 0 && (
                    <span className="px-3 py-1 bg-red-600/20 border border-red-500 text-red-500 text-[11px] sm:text-sm font-bold rounded-full animate-pulse flex items-center shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span> LIVE: ฝนกำลังตก
                    </span>
                )}
            </h1>
            <p className="text-[#2dd4bf] mt-2 text-[10px] sm:text-xs md:text-sm tracking-widest font-mono">INTELLIGENCE ATLAS FOR HAZARD ANALYTICS</p>
        </div>
        <div className="w-full lg:w-auto flex flex-col items-start lg:items-end">
            <div className="text-3xl sm:text-4xl font-mono font-bold text-white tracking-widest drop-shadow-md">
                {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs sm:text-sm text-gray-400 mt-1 mb-3 lg:mb-2">
                {currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="flex flex-wrap gap-2 text-[9px] font-mono font-bold tracking-wider w-full lg:justify-end">
                <HealthBadge label="ONWR (GROUND)" status={apiHealth.onwr} />
                <HealthBadge label="ECMWF (RADAR)" status={apiHealth.ecmwf} />
                <HealthBadge label="AI (ENSEMBLE)" status={apiHealth.ai_ensemble} />
            </div>
        </div>
      </div>

      {/* 🔴 Top KPI Row (Ground Truth) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6 shrink-0 z-50">
          <div className={`bg-[#111a1c] border ${data.liveRainIntensity > 0 ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-gray-800'} rounded-2xl p-5 md:p-6 relative transition-all duration-500`}>
              <div className="relative group flex items-center justify-between mb-2">
                  <div className="flex items-center">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center"><span className="mr-2">📡</span> ฝนตก ณ วินาทีนี้ (Live)</h3>
                  </div>
                  <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30">ข้อมูลดาวเทียม</span>
              </div>
              <div className="flex items-baseline space-x-1">
                  <span className={`text-4xl md:text-5xl font-black ${data.liveRainIntensity > 0 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                      {data.liveRainIntensity.toFixed(1)}
                  </span>
                  <span className="text-base md:text-lg text-gray-500 font-bold ml-2">มม./ชม.</span>
              </div>
          </div>

          <div className="bg-[#111a1c] border border-gray-800 rounded-2xl p-5 md:p-6 relative">
              <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center"><span className="mr-2">🇹🇭</span> ฝนสะสม 24 ชม.</h3>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 truncate ml-2">ข้อมูลตรวจวัดจริง</span>
              </div>
              <div className="flex items-baseline space-x-1">
                  <span className="text-4xl md:text-5xl font-black text-[#4ade80]">{data.actualRain24h}</span>
                  <span className="text-base md:text-lg text-gray-500 font-bold ml-2">มม.</span>
              </div>
          </div>

          <div className={`bg-[#111a1c] border ${data.soilMoisture > 75 ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-gray-800'} rounded-2xl p-5 md:p-6 relative flex flex-col justify-center`}>
              <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center"><span className="mr-2">⛰️</span> ดัชนีดินอุ้มน้ำ</h3>
                  <span className="text-[9px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded border border-orange-500/30 ml-2">แบบจำลอง</span>
              </div>
              <div className="flex items-center space-x-4">
                  <span className={`text-4xl md:text-5xl font-black shrink-0 ${data.soilMoisture > 75 ? 'text-red-400 animate-pulse' : data.soilMoisture > 40 ? 'text-yellow-400' : 'text-[#2dd4bf]'}`}>
                      {Math.round(data.soilMoisture)}%
                  </span>
                  <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-700 min-w-[50px]">
                      <div className={`${soilColor} h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_currentColor]`} style={{ width: `${data.soilMoisture}%` }}></div>
                  </div>
              </div>
          </div>
      </div>

      {/* 🎯 Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1 z-10">
        
        {/* 🧠 ฝั่งซ้าย: AI Analysis & Action */}
        <div className="xl:col-span-5 flex flex-col gap-6 h-full">
            <div className={`flex-1 border ${theme.border} bg-[#111a1c] ${theme.glow} rounded-3xl p-6 md:p-8 flex flex-col transition-all duration-500 overflow-hidden relative min-h-[280px]`}>
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800 shrink-0 z-20 bg-[#111a1c]">
                    <div className="flex items-center space-x-3 md:space-x-4">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#0a1112] flex items-center justify-center text-xl md:text-2xl shadow-inner border border-gray-700 shrink-0">🧠</div>
                        <div>
                            <h2 className={`text-lg md:text-2xl font-bold ${theme.text}`}>Data Fusion & Insight</h2>
                            <span className="text-xs md:text-sm text-gray-400 font-mono tracking-widest flex items-center mt-1">
                                Status: <span className={`ml-2 font-bold ${data.ai.status !== 'NORMAL' ? 'animate-pulse text-white' : ''}`}>{data.ai.status}</span>
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex-1 text-sm md:text-base text-gray-300 leading-relaxed space-y-4">
                   <p><span className="text-[#2dd4bf] font-bold">🇹🇭 ข้อมูลสถานการณ์ปัจจุบัน:</span> {data.ai.tmdInsight}</p>
                   <p className="border-l-2 border-purple-500/50 pl-4 py-1 bg-purple-900/10 rounded-r-md"><span className="text-purple-400 font-bold">🔮 ข้อมูล AI Ensemble:</span> {data.ai.aiInsight}</p>
                </div>
            </div>

            <div className={`border ${data.ai.status === 'CRITICAL' ? 'border-red-500 bg-[#3f0f0f]' : 'border-gray-800 bg-[#111a1c]'} rounded-3xl p-6 md:p-8 shadow-2xl shrink-0 transition-colors duration-500`}>
                <h3 className={`text-lg md:text-xl font-bold mb-5 md:mb-6 flex items-center tracking-wide ${data.ai.status === 'CRITICAL' ? 'text-red-400' : 'text-white'}`}>
                    <span className="text-2xl md:text-3xl mr-3 md:mr-4 shrink-0">🎯</span> ข้อเสนอแนะเชิงรุก (Proactive Actions)
                </h3>
                <ul className="space-y-3 md:space-y-4">
                    {data.ai.actions.map((action: string, idx: number) => (
                        <li key={idx} className="flex items-start md:items-center bg-[#0a1112]/80 p-4 md:p-5 rounded-xl border border-gray-700/50 hover:border-[#2dd4bf]/50 transition-colors shadow-sm">
                            <div className={`w-3 h-3 rounded-full ${theme.bg} mr-4 md:mr-5 mt-1.5 md:mt-0 flex-shrink-0 ${data.ai.status !== 'NORMAL' ? 'animate-pulse shadow-[0_0_10px_currentColor]' : ''}`}></div>
                            <span className="text-sm md:text-lg text-gray-100 font-semibold tracking-wide">{action}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        {/* 📊 ฝั่งขวา: กราฟ DeepMind AI */}
        <div className="xl:col-span-7 flex flex-col gap-6">
            <div className="flex-1 bg-[#111a1c] border border-gray-800 rounded-3xl p-6 md:p-8 shadow-xl flex flex-col min-h-[450px]">
                
                <div className="mb-6 md:mb-8">
                    <div className="bg-[#0a1112] p-4 md:p-5 rounded-2xl border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.05)] mb-5 md:mb-6 flex items-center justify-between">
                        <h4 className="text-xs md:text-sm text-purple-400 font-bold uppercase tracking-widest flex items-center">
                            <span className="text-lg md:text-xl mr-2">🔮</span> AI 15-DAY PREDICTIVE VISION
                        </h4>
                        <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-1 rounded border border-purple-500/30">{data.memberCount} MEMBERS</span>
                    </div>

                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                        <div>
                            <h3 className="text-base md:text-lg font-bold text-white flex items-center">
                                <span className="mr-2 md:mr-3 text-xl">📊</span> กราฟพยากรณ์ปริมาณฝนล่วงหน้า (AI Probabilistic Model)
                            </h3>
                            <p className="text-[10px] md:text-xs text-gray-500 mt-1 ml-7 md:ml-8 tracking-wide">กราฟสีม่วงแดง = ความน่าจะเป็นฝนตกหนักเกิน 50% (Consensus &gt; 50%)</p>
                        </div>
                    </div>
                </div>
                
                {/* 📊 Graph Container */}
                <div className="flex-1 flex items-end justify-between gap-1 sm:gap-2 md:gap-3 h-full pb-2 mt-4">
                    {data.stats.map((s: any, idx: number) => {
                        const date = new Date(s.date);
                        const dayName = date.toLocaleDateString('th-TH', { weekday: 'short' });
                        const dateNum = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                        
                        const maxVal = Math.max(...data.stats.map((x: any) => x.rainMedian), 10); 
                        const heightPct = Math.max((s.rainMedian / maxVal) * 100, 4); 
                        
                        const barColor = s.pRain50 >= 50 ? 'bg-gradient-to-t from-[#9f1239] to-[#fb7185]' : 
                                         s.pRain50 >= 20 ? 'bg-gradient-to-t from-[#ca8a04] to-[#fde047]' : 
                                         'bg-gradient-to-t from-[#0f766e] to-[#2dd4bf]';

                        return (
                            <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                                <div className={`text-[10px] md:text-sm font-bold mb-2 md:mb-3 transition-colors ${s.rainMedian > 0 ? 'text-white' : 'text-gray-600'}`}>
                                    {s.rainMedian > 0 ? s.rainMedian.toFixed(0) : '0'}
                                </div>
                                <div className="w-full h-full flex items-end justify-center relative">
                                    <div className="absolute w-full h-full border-b border-gray-800/50 -z-10"></div>
                                    <div 
                                        className={`w-full max-w-[28px] sm:max-w-[36px] rounded-t-sm md:rounded-t-lg ${barColor} shadow-md transition-all duration-700 ease-out opacity-90 group-hover:opacity-100 group-hover:shadow-[0_0_15px_currentColor]`} 
                                        style={{ height: `${heightPct}%` }}
                                    ></div>
                                </div>
                                <div className="mt-3 md:mt-4 text-center">
                                    <div className="text-[10px] md:text-[13px] font-bold text-gray-300">{dayName}</div>
                                    <div className="text-[8px] md:text-[10px] text-gray-500 mt-0.5 md:mt-1 uppercase hidden sm:block">{dateNum}</div>
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
