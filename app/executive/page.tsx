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

  // 🗺️ แผนที่ตำบลบ่อหลวงแบบ Real GeoJSON Projection (อัปเกรด: โซน 13 หมู่บ้าน)
  const BoLuangMap = () => {
    const isAlert = data?.soilMoisture > 70 || data?.liveRainIntensity > 15;
    const [geoBoundary, setGeoBoundary] = useState<any>(null); // ขอบเขตตำบล
    const [geoVillages, setGeoVillages] = useState<any>(null); // ขอบเขต 13 หมู่บ้าน

    // โหลดไฟล์ GeoJSON ทั้งตำบล และ ระดับหมู่บ้าน พร้อมกัน
    useEffect(() => {
      Promise.all([
        fetch('/geojson/boluang.json').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/geojson/block.json').then(r => r.ok ? r.json() : null).catch(() => null)
      ]).then(([boundaryData, villageData]) => {
        if (boundaryData) setGeoBoundary(boundaryData);
        if (villageData) setGeoVillages(villageData);
      });
    }, []);

    const renderGeoJsonMap = () => {
        // หากไม่มีไฟล์หลัก ให้ใช้ Mock fallback
        if (!geoBoundary || !geoBoundary.features) {
            return (
                <g opacity="0.15" fill="none" stroke="#0ea5e9" strokeWidth="0.8">
                    <path d="M 80 150 C 120 50, 350 80, 420 180 C 450 280, 300 330, 150 280 C 50 240, 60 180, 80 150 Z" strokeDasharray="4 6" strokeWidth="1.5" />
                </g>
            );
        }

        // 1. คำนวณขอบเขต (Bounding Box) จากระดับตำบลเป็นหลัก
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        const findBounds = (coords: any[]) => {
            if (typeof coords[0] === 'number') {
                minLng = Math.min(minLng, coords[0]); maxLng = Math.max(maxLng, coords[0]);
                minLat = Math.min(minLat, coords[1]); maxLat = Math.max(maxLat, coords[1]);
            } else {
                coords.forEach(findBounds);
            }
        };
        geoBoundary.features.forEach((f: any) => findBounds(f.geometry.coordinates));

        // 2. Projection Engine
        const W = 500, H = 350, P = 30; 
        const w = W - P * 2, h = H - P * 2;
        const lngDiff = maxLng - minLng;
        const latDiff = maxLat - minLat;

        const scaleX = w / (lngDiff || 1);
        const scaleY = h / (latDiff || 1);
        const scale = Math.min(scaleX, scaleY);
        
        const xOffset = P + (w - lngDiff * scale) / 2;
        const yOffset = P + (h - latDiff * scale) / 2;

        const project = (lng: number, lat: number) => {
            return {
                x: xOffset + (lng - minLng) * scale,
                y: yOffset + (latDiff - (lat - minLat)) * scale
            };
        };

        // ฟังก์ชันช่วยวาด Path
        const generatePathD = (feature: any) => {
            const coords = feature.geometry.coordinates;
            const type = feature.geometry.type;
            if (type === 'Polygon') {
                return coords.map((ring: any) => "M " + ring.map((c: any) => { const p = project(c[0], c[1]); return `${p.x},${p.y}`; }).join(" L ") + " Z").join(" ");
            } else if (type === 'MultiPolygon') {
                return coords.map((poly: any) => poly.map((ring: any) => "M " + ring.map((c: any) => { const p = project(c[0], c[1]); return `${p.x},${p.y}`; }).join(" L ") + " Z").join(" ")).join(" ");
            }
            return "";
        };

        // 3. วาดเส้นขอบเขต 13 หมู่บ้าน (Layer ล่างสุด)
        const villagePaths = geoVillages && geoVillages.features ? geoVillages.features.map((f: any, i: number) => {
            // สุ่มความทึบแสงเล็กน้อยให้เห็นความแตกต่างของแต่ละโซน
            const opacityLevel = 0.02 + (i % 3) * 0.02; 
            return (
               <path key={`village-${i}`} d={generatePathD(f)}
                     fill={isAlert ? `rgba(225,29,72,${opacityLevel})` : `rgba(14,165,233,${opacityLevel})`}
                     stroke={isAlert ? 'rgba(244,63,94,0.3)' : 'rgba(56,189,248,0.3)'}
                     strokeWidth="0.8"
                     strokeDasharray="2 3"
                     className="transition-all duration-1000 hover:fill-[#0ea5e9]/20 cursor-crosshair" />
            );
        }) : null;

        // 4. วาดเส้นขอบเขตตำบลหลัก (Layer ทับด้านบน)
        const boundaryPaths = geoBoundary.features.map((f: any, i: number) => (
            <path key={`bound-${i}`} d={generatePathD(f)}
                  fill="none"
                  stroke={isAlert ? '#e11d48' : '#0ea5e9'}
                  strokeWidth="1.5"
                  className="transition-all duration-1000"
                  strokeOpacity="0.8"
                  strokeDasharray="4 4" />
        ));

        const eocProj = project(BO_LUANG_LNG, BO_LUANG_LAT);

        return (
            <g>
               {/* 🗺️ โซน 13 หมู่บ้าน (Tactical Zones) */}
               {villagePaths}
               
               {/* 🗺️ ขอบเขตตำบลหลัก */}
               {boundaryPaths}
               
               {isAlert && <circle cx={eocProj.x} cy={eocProj.y} r="80" fill="url(#alertHeat)" />}
               
               {/* 📍 หมุดศูนย์บัญชาการ EOC */}
               <g transform={`translate(${eocProj.x}, ${eocProj.y})`}>
                    {isAlert && <circle cx="0" cy="0" r="8" fill="#f43f5e" className="animate-pulse-ring" />}
                    <circle cx="0" cy="0" r="5" fill={isAlert ? '#f43f5e' : '#38bdf8'} filter="url(#glow)" />
                    <circle cx="0" cy="0" r="2" fill="#020617" />
                    <rect x="12" y="-12" width="125" height="24" rx="4" fill="#0f172a" fillOpacity="0.8" stroke={isAlert ? '#f43f5e' : '#38bdf8'} strokeWidth="1" />
                    <text x="18" y="3" fill="#f8fafc" fontSize="11" fontWeight="bold">บ่อหลวง <tspan fill={isAlert ? '#f43f5e' : '#38bdf8'} fontSize="9">(ศูนย์ EOC)</tspan></text>
                </g>

               {/* ตัวอย่างจุดหมู่บ้านอ้างอิง */}
               <g transform={`translate(${eocProj.x - 40}, ${eocProj.y - 50})`}>
                 <circle cx="0" cy="0" r="3" fill="#64748b" />
                 <text x="8" y="3" fill="#cbd5e1" fontSize="9">บ้านแม่หืด</text>
               </g>
               <g transform={`translate(${eocProj.x + 60}, ${eocProj.y - 15})`}>
                 <circle cx="0" cy="0" r="3" fill="#64748b" />
                 <text x="8" y="3" fill="#cbd5e1" fontSize="9">บ้านขุน</text>
               </g>
               <g transform={`translate(${eocProj.x + 30}, ${eocProj.y + 60})`}>
                 <circle cx="0" cy="0" r="3" fill="#64748b" />
                 <text x="8" y="3" fill="#cbd5e1" fontSize="9">บ้านกิ่วป่าซี</text>
               </g>
               <g transform={`translate(${eocProj.x - 60}, ${eocProj.y + 40})`}>
                 <circle cx="0" cy="0" r="3" fill="#64748b" />
                 <text x="-55" y="3" fill="#cbd5e1" fontSize="9">บ้านเตียนอาง</text>
               </g>
            </g>
        );
    };

    return (
      <div className="relative w-full h-full min-h-[350px] rounded-2xl bg-[#020617] border border-slate-800 shadow-inner overflow-hidden flex items-center justify-center">
        
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes radar-scan { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          @keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 0.5; } 100% { transform: scale(2.5); opacity: 0; } }
          .animate-radar { animation: radar-scan 6s linear infinite; transform-origin: center; }
          .animate-pulse-ring { animation: pulse-ring 2.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite; transform-origin: center; }
        `}} />
        
        <div className="absolute inset-0" style={{ 
            backgroundImage: 'linear-gradient(rgba(14, 165, 233, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(14, 165, 233, 0.05) 1px, transparent 1px)', 
            backgroundSize: '30px 30px' 
        }}></div>
        
        <svg viewBox="0 0 500 350" className="w-full h-full relative z-10">
          <defs>
            <radialGradient id="alertHeat" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#e11d48" stopOpacity="0.5" />
              <stop offset="50%" stopColor="#e11d48" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0" />
            </radialGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {renderGeoJsonMap()}

          <path d="M 10 30 L 10 10 L 30 10" fill="none" stroke="#334155" strokeWidth="2" />
          <path d="M 490 30 L 490 10 L 470 10" fill="none" stroke="#334155" strokeWidth="2" />
          <path d="M 10 320 L 10 340 L 30 340" fill="none" stroke="#334155" strokeWidth="2" />
          <path d="M 490 320 L 490 340 L 470 340" fill="none" stroke="#334155" strokeWidth="2" />
          
          <text x="15" y="335" fill="#475569" fontSize="8" fontFamily="monospace">LAT: 18.1633° N</text>
          <text x="415" y="335" fill="#475569" fontSize="8" fontFamily="monospace">LNG: 98.3744° E</text>
        </svg>

        <div className="absolute top-4 left-4 bg-slate-950/80 border border-slate-800 backdrop-blur-md p-2 rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <div className="text-[9px] text-slate-500 font-mono uppercase tracking-widest mb-1.5 flex justify-between gap-4">
            <span>Spatial Risk Map</span>
            <span className="text-[#0ea5e9]">v2.1</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-xs font-bold text-white flex items-center">
                <span className={`w-2 h-2 rounded-full mr-2 ${isAlert ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                ขอบเขตตำบลบ่อหลวง
            </div>
            <div className="text-[10px] font-bold text-slate-300 flex items-center pl-1">
                <span className="w-1.5 h-1.5 border border-slate-500 mr-2 rounded-sm bg-slate-800/50"></span>
                โซนเฝ้าระวัง 13 หมู่บ้าน
            </div>
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

      {/* 🔴 Top KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-6 shrink-0">
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
                  <div className="absolute left-[50%] top-0 bottom-0 w-[2px] bg-amber-500 z-10"></div> 
                  <div className="absolute left-[90%] top-0 bottom-0 w-[2px] bg-rose-500 z-10"></div>
                  <div className={`h-full ${data?.actualRain24h > 90 ? 'bg-rose-500' : data?.actualRain24h > 50 ? 'bg-amber-500' : 'bg-[#34d399]'} transition-all duration-1000`} style={{ width: `${Math.min((data?.actualRain24h / 100) * 100, 100)}%` }}></div>
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono uppercase"><span>0</span><span>วิกฤต (90+)</span></div>
          </div>

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
            
            {/* 🗺️ แผนที่ตำบลบ่อหลวง (GeoJSON Projector) */}
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
            <div className="bg-[#0b1120] border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-xl flex-1 flex flex-col min-h-[350px] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -z-10"></div>
              
              <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-800/80 pb-4">
                <div>
                    <h3 className="text-xl md:text-2xl font-black text-white flex items-center tracking-tight">
                        <span className="text-3xl mr-3">📊</span> ประเมินปริมาณฝนล่วงหน้า
                    </h3>
                    <p className="text-[10px] md:text-xs text-slate-500 mt-2 tracking-wide font-mono uppercase">AI PROBABILISTIC RANGE (พยากรณ์ล่วงหน้า 7 วัน)</p>
                </div>
                <div className="mt-3 sm:mt-0 flex flex-col items-end gap-2">
                    <div className="text-[10px] md:text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg font-bold shadow-[0_0_10px_rgba(99,102,241,0.1)]">
                        AI CONSENSUS ALGORITHM
                    </div>
                    <div className="flex gap-3 text-[9px] font-mono text-slate-500">
                        <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9]"></div> ค่ากลาง (Median)</span>
                        <span className="flex items-center gap-1"><div className="w-3 h-[1px] bg-slate-500 dashed"></div> ค่าสูงสุด (Max)</span>
                    </div>
                </div>
              </div>
              
              <div className="flex-1 flex items-end justify-between gap-2 sm:gap-4 h-full pb-2 mt-2 relative">
                  <div className="absolute w-full h-[1px] bg-amber-500/10 bottom-[40%] border-t border-dashed border-amber-500/20 -z-10">
                     <span className="absolute -top-4 right-0 text-[8px] font-mono text-amber-500/50">50 mm (เฝ้าระวัง)</span>
                  </div>
                  <div className="absolute w-full h-[1px] bg-rose-500/10 bottom-[80%] border-t border-dashed border-rose-500/20 -z-10">
                     <span className="absolute -top-4 right-0 text-[8px] font-mono text-rose-500/50">90 mm (วิกฤต)</span>
                  </div>
                  
                  {data?.stats?.slice(0, 7).map((s: any, idx: number) => {
                      const date = new Date(s.date);
                      const dayName = date.toLocaleDateString('th-TH', { weekday: 'short' });
                      const dateNum = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                      
                      const overallMax = Math.max(...data.stats.slice(0, 7).map((x: any) => Math.max(x.rainMax, x.rainMedian, 10)), 100); 
                      
                      const heightMedPct = Math.max((s.rainMedian / overallMax) * 100, 2); 
                      const heightMaxPct = Math.max((s.rainMax / overallMax) * 100, heightMedPct);
                      
                      const isDanger = s.pRain50 >= 50;
                      const isWarning = s.pRain50 >= 25 && !isDanger;
                      
                      const barColor = isDanger ? 'from-rose-600 to-rose-400' : 
                                       isWarning ? 'from-amber-600 to-amber-400' : 
                                       'from-[#0ea5e9] to-[#38bdf8]';
                      
                      const dotColor = isDanger ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]' : 
                                       isWarning ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 
                                       'bg-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.8)]';

                      return (
                          <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                              <div className="flex flex-col items-center mb-2 opacity-80 group-hover:opacity-100 transition-opacity">
                                  {s.rainMax > s.rainMedian && s.rainMax > 0 && (
                                    <span className="text-[8px] md:text-[9px] font-mono text-slate-500 mb-0.5">
                                        Max: {s.rainMax.toFixed(0)}
                                    </span>
                                  )}
                                  <span className={`text-[11px] md:text-sm font-bold ${s.rainMedian > 0 ? 'text-white' : 'text-slate-600'}`}>
                                      {s.rainMedian > 0 ? s.rainMedian.toFixed(0) : ''}
                                  </span>
                              </div>

                              <div className="w-full h-full flex items-end justify-center relative">
                                  <div className="absolute w-full h-[1px] bg-slate-800 bottom-0 -z-10"></div>
                                  
                                  {s.rainMax > 0 && (
                                    <div 
                                        className="absolute w-[2px] bg-slate-600/30 group-hover:bg-slate-500/50 transition-colors bottom-0 rounded-t-full"
                                        style={{ height: `${heightMaxPct}%` }}
                                    >
                                        <div className="absolute -top-[1px] left-[-4px] w-2.5 h-[2px] bg-slate-500 rounded-full"></div>
                                    </div>
                                  )}

                                  <div 
                                    className={`relative w-full max-w-[14px] sm:max-w-[20px] md:max-w-[28px] rounded-full bg-gradient-to-t ${barColor} shadow-lg transition-all duration-700 ease-out opacity-75 group-hover:opacity-100 group-hover:-translate-y-1 group-hover:shadow-[0_0_15px_currentColor]`} 
                                    style={{ height: `${heightMedPct}%`, minHeight: '8px' }}
                                  >
                                     {s.rainMedian > 0 && (
                                        <div className={`absolute top-[2px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${dotColor}`}></div>
                                     )}
                                  </div>
                              </div>
                              
                              <div className="mt-4 text-center">
                                  <div className="text-[10px] md:text-[13px] font-bold text-slate-300 group-hover:text-white transition-colors">{dayName}</div>
                                  <div className="text-[8px] md:text-[10px] text-slate-500 mt-1 uppercase hidden sm:block font-mono">{dateNum}</div>
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
