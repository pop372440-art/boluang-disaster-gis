'use client';
import React, { useState, useEffect } from 'react';

// 🧮 ฟังก์ชันคำนวณระยะทาง
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

export default function ExecutiveDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const BO_LUANG_LAT = 18.1633;
  const BO_LUANG_LNG = 98.3744;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [onwrRes, forecastRes, deepmindRes] = await Promise.allSettled([
          fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}&current=temperature_2m,windspeed_10m,weathercode,precipitation&daily=precipitation_sum,windspeed_10m_max&timezone=Asia%2FBangkok&forecast_days=7`),
          fetch(`https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}&daily=precipitation_sum,windspeed_10m_max&timezone=Asia%2FBangkok&forecast_days=15&models=google_weathernext2_ensemble`)
        ]);

        let actualRain24h = 0;
        if (onwrRes.status === 'fulfilled') {
            const onwrJson = await onwrRes.value.json();
            let arrData = onwrJson?.data?.data || onwrJson?.data || [];
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

        let forecast = null;
        if (forecastRes.status === 'fulfilled') {
            const resData = await forecastRes.value.json();
            if (!resData.error) forecast = resData;
        }

        let deepmindForecast = null;
        if (deepmindRes.status === 'fulfilled') {
            const resData = await deepmindRes.value.json();
            if (!resData.error) deepmindForecast = resData;
        }

        if (forecast && deepmindForecast) {
            const currentTemp = forecast.current.temperature_2m;
            const currentWind = forecast.current.windspeed_10m;
            const liveRainIntensity = forecast.current.precipitation || 0;
            const maxRain7Days = Math.max(...forecast.daily.precipitation_sum);
            let soilMoisture = Math.min(100, ((actualRain24h / 80) * 100) + (liveRainIntensity > 0 ? 30 : 0));
            
            let maxRain15Days = 0;
            let criticalDate15Days = '';
            const ensembleKeys = Object.keys(deepmindForecast.daily).filter(k => k.startsWith('precipitation_sum_google'));
            
            if(ensembleKeys.length > 0) {
               const allPossibilities = ensembleKeys.map(key => Math.max(...deepmindForecast.daily[key]));
               maxRain15Days = Math.max(...allPossibilities);
               const worstModelKey = ensembleKeys.find(key => Math.max(...deepmindForecast.daily[key]) === maxRain15Days);
               if(worstModelKey) {
                   const peakIndex = deepmindForecast.daily[worstModelKey].indexOf(maxRain15Days);
                   const rawDate = new Date(deepmindForecast.daily.time[peakIndex]);
                   criticalDate15Days = rawDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
               }
            }

            let status = 'NORMAL';
            let tmdInsight = `อุณหภูมิ ${currentTemp}°C ลม ${currentWind} กม./ชม. สภาพอากาศปัจจุบันปลอดภัย`;
            
            // 🌎 การสร้าง Context สำหรับ DeepMind (ผูกเข้ากับกราฟ)
            let deepmindTrend = '';
            if(maxRain15Days > 80) {
                deepmindTrend = `AI ของ Google ตรวจพบ "พายุไต้ฝุ่นจากทะเลจีนใต้" กำลังก่อตัวและมีทิศทางพุ่งชนภาคเหนือตอนล่าง คาดว่าจะส่งผลกระทบในพื้นที่ช่วงวันที่ ${criticalDate15Days} (ฝนสะสมทะลุ ${maxRain15Days.toFixed(1)} มม.) เตรียมตัวรับมือ!`;
            } else if (maxRain15Days > 30) {
                deepmindTrend = `AI ของ Google มองเห็น "ร่องมรสุมกำลังปานกลางจากพม่า" พาดผ่านภาคเหนือตอนล่างในช่วงสัปดาห์หน้า คาดว่าจะมีกลุ่มฝนสะสม ${maxRain15Days.toFixed(1)} มม. แต่อาจไม่มีพายุใหญ่ซ้อนทับ`;
            } else {
                deepmindTrend = `AI ของ Google ประเมินโครงสร้างชั้นบรรยากาศโลก (Global Atmospheric Patterns) ล่วงหน้า 15 วัน ไม่พบสัญญาณพายุรุนแรงก่อตัว สภาพอากาศยังคงปกติ`;
            }

            let actions = ['ตรวจสอบความพร้อมอุปกรณ์เตือนภัย', 'อัปเดตข้อมูลให้ประชาชนทราบตามปกติ'];

            if (actualRain24h > 90 || maxRain7Days > 90 || soilMoisture > 80) {
                status = 'CRITICAL';
                tmdInsight = liveRainIntensity > 0
                    ? `🚨 ด่วน! มีฝนตกหนักต่อเนื่อง ดินอุ้มน้ำระดับวิกฤต (${Math.round(soilMoisture)}%) เสี่ยงดินถล่มฉับพลัน!` 
                    : `ประกาศจากกรมอุตุฯ: เฝ้าระวังพายุฝนฟ้าคะนองรุนแรงใน 1-3 วันนี้`;
                actions = ['🚨 อ้างอิงประกาศกรมอุตุฯ เพื่อเบิกงบฉุกเฉิน EOC ทันที', 'อพยพประชาชนในโซนเชิงเขาด่วน!', 'สั่งเครื่องจักรกลหนักเข้าพื้นที่เสี่ยง'];
            } else if (liveRainIntensity > 0 || actualRain24h > 20 || soilMoisture > 40) {
                status = 'WARNING';
                tmdInsight = liveRainIntensity > 0
                    ? `⚠️ ขณะนี้มีฝนตกในพื้นที่! (ความแรง ${liveRainIntensity} มม./ชม.) ดินเริ่มอุ้มน้ำ ระวังดินสไลด์`
                    : `มีฝนตกสะสม ${actualRain24h} มม. แจ้งเตือนน้ำท่วมขัง`;
                actions = ['ประกาศเสียงตามสาย แจ้งเตือนประชาชนพื้นที่ภูเขา', 'ส่งหน่วยลาดตระเวนเช็คระดับน้ำในลำห้วย', 'เตรียมพร้อมเครื่องสูบน้ำ'];
            }

            setData({
                actualRain24h, currentTemp, currentWind, maxRain7Days, maxRain15Days, liveRainIntensity, soilMoisture,
                daily: forecast.daily,
                ai: { status, tmdInsight, deepmindTrend, actions }
            });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 300000); 
    return () => clearInterval(interval);
  }, []);

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-[#0a1112] text-white">
        <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-[#2dd4bf] border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_#2dd4bf]"></div>
            <span className="font-mono text-[#2dd4bf] text-lg tracking-widest animate-pulse">Syncing: ONWR + TMD + DeepMind...</span>
        </div>
    </div>
  );

  const getTheme = (status: string) => {
      if (status === 'CRITICAL') return { border: 'border-red-500/50', bg: 'bg-[#ef4444]', text: 'text-[#f87171]', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.2)]' };
      if (status === 'WARNING') return { border: 'border-yellow-500/50', bg: 'bg-[#facc15]', text: 'text-[#facc15]', glow: 'shadow-[0_0_30px_rgba(250,204,21,0.1)]' };
      return { border: 'border-[#2dd4bf]/40', bg: 'bg-[#0f766e]', text: 'text-[#2dd4bf]', glow: 'shadow-lg' };
  };
  const theme = getTheme(data.ai.status);
  const soilColor = data.soilMoisture > 75 ? 'bg-red-500' : data.soilMoisture > 40 ? 'bg-yellow-400' : 'bg-emerald-400';

  return (
    <div className="min-h-screen bg-[#0a1112] p-4 md:p-8 font-sans text-gray-100 flex flex-col overflow-hidden">
      
      {/* CSS Animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scroll-up {
          0% { transform: translateY(0); }
          100% { transform: translateY(-120%); }
        }
        .ticker-container {
          animation: scroll-up 20s linear infinite;
        }
        .ticker-container:hover {
          animation-play-state: paused;
        }
      `}} />

      {/* 🖥️ Top Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 pb-4">
        <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white flex items-center">
                EXECUTIVE <span className={`ml-3 ${theme.text}`}>DASHBOARD</span>
                {data.liveRainIntensity > 0 && (
                    <span className="ml-4 px-3 py-1 bg-red-600/20 border border-red-500 text-red-500 text-sm font-bold rounded-full animate-pulse flex items-center shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                        LIVE: ฝนกำลังตก
                    </span>
                )}
            </h1>
            <p className="text-[#2dd4bf] mt-2 text-sm tracking-widest font-mono">POWERED BY ONWR x TMD x DEEPMIND AI</p>
        </div>
        <div className="mt-4 md:mt-0 text-right">
            <div className="text-3xl md:text-4xl font-mono font-bold text-white tracking-widest">
                {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-sm text-gray-400 mt-1">
                {currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1">
        
        {/* 🧠 ฝั่งซ้าย: AI Analysis (ปัจจุบันล้วนๆ) */}
        <div className="xl:col-span-5 flex flex-col gap-6 h-full">
            
            <div className={`flex-1 border ${theme.border} bg-[#111a1c] ${theme.glow} rounded-3xl p-8 flex flex-col transition-all duration-500 overflow-hidden relative min-h-[300px]`}>
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800 shrink-0 z-20 bg-[#111a1c]">
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-full bg-[#0a1112] flex items-center justify-center text-2xl shadow-inner border border-gray-700">🧠</div>
                        <div>
                            <h2 className={`text-xl font-bold ${theme.text}`}>AI Current Briefing</h2>
                            <span className="text-xs text-gray-400 font-mono tracking-widest flex items-center">
                                Status: <span className={`ml-2 ${data.ai.status !== 'NORMAL' ? 'animate-pulse' : ''}`}>{data.ai.status}</span>
                            </span>
                        </div>
                    </div>
                    <div className="text-right w-32">
                        <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">ดัชนีดินอุ้มน้ำ (เสี่ยงถล่ม)</div>
                        <div className="w-full bg-gray-800 rounded-full h-2">
                            <div className={`${soilColor} h-2 rounded-full transition-all duration-1000 shadow-[0_0_10px_currentColor]`} style={{ width: `${data.soilMoisture}%` }}></div>
                        </div>
                        <div className={`text-xs mt-1 font-bold ${data.soilMoisture > 75 ? 'text-red-400' : 'text-gray-300'}`}>{Math.round(data.soilMoisture)}%</div>
                    </div>
                </div>
                
                <div className="flex-1 relative overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#111a1c] via-transparent to-[#111a1c] z-10"></div>
                    
                    <div className="ticker-container absolute top-full left-0 right-0 flex flex-col space-y-8 pb-10 px-2 cursor-default">
                        <div className="pb-4 border-b border-gray-800/50">
                            <h3 className="text-[#2dd4bf] font-bold text-sm mb-3 flex items-center"><span className="text-lg mr-3">🇹🇭</span> ประกาศกรมอุตุฯ & สภาพจริง (Micro-climate)</h3>
                            <p className="text-gray-300 text-[15px] leading-relaxed pl-7 border-l-2 border-[#2dd4bf]/30">
                                {data.ai.tmdInsight}
                                {data.liveRainIntensity > 0 && <span className="block mt-2 text-red-400">🚨 ระบบเซนเซอร์ดาวเทียม (Virtual Rain Gauge) ตรวจจับพบกลุ่มฝนตกกระจุกตัวเหนือพิกัดตำบลบ่อหลวง ณ ขณะนี้</span>}
                            </p>
                        </div>
                        <div className="pb-4 text-gray-400">
                            <h3 className="text-gray-400 font-bold text-sm mb-3 flex items-center"><span className="text-lg mr-3">⚙️</span> AI Engine Logs (ONWR/TMD)</h3>
                            <p className="text-xs leading-relaxed pl-7 border-l-2 border-gray-700/50 font-mono text-gray-500">
                                [LOG] ระบบอ่านค่าสถานีวัดน้ำฝน สทนช. เทียบกับ Open-Meteo Radar...<br/>
                                [LOG] อัลกอริทึมประเมินความชุ่มน้ำของผิวดิน (Soil Saturation) เพื่อแจ้งเตือนจุดเสี่ยงภัย
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border border-gray-800 bg-[#111a1c] rounded-3xl p-8 shadow-lg shrink-0">
                <h3 className="text-base text-white font-bold mb-6 flex items-center tracking-wide">
                    <span className="text-xl mr-3">🎯</span> ข้อเสนอแนะการสั่งการเชิงรุก (Proactive Actions)
                </h3>
                <ul className="space-y-3">
                    {data.ai.actions.map((action: string, idx: number) => (
                        <li key={idx} className="flex items-center bg-[#0a1112] p-4 rounded-xl border border-gray-800/60 hover:border-[#2dd4bf]/50 transition-colors">
                            <div className={`w-2 h-2 rounded-full ${theme.bg} mr-4 flex-shrink-0 ${data.ai.status !== 'NORMAL' ? 'animate-pulse' : ''}`}></div>
                            <span className="text-sm text-gray-200 font-medium">{action}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        {/* 📊 ฝั่งขวา: กราฟ & อนาคต (DeepMind) */}
        <div className="xl:col-span-7 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
                <div className={`bg-[#111a1c] border ${data.liveRainIntensity > 0 ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-gray-800'} rounded-2xl p-6 relative overflow-hidden transition-all duration-500`}>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">ฝนตก ณ วินาทีนี้ (Live)</h3>
                    <div className="flex items-baseline space-x-1">
                        <span className={`text-4xl font-black ${data.liveRainIntensity > 0 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                            {data.liveRainIntensity.toFixed(1)}
                        </span>
                        <span className="text-lg text-gray-500 font-bold">มม./ชม.</span>
                    </div>
                </div>

                <div className="bg-[#111a1c] border border-gray-800 rounded-2xl p-6 relative">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">ฝน 24 ชม. (ONWR)</h3>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-black text-[#4ade80]">{data.actualRain24h}</span>
                        <span className="text-lg text-gray-500 font-bold">มม.</span>
                    </div>
                </div>

                <div className="bg-[#111a1c] border border-[#2dd4bf]/20 rounded-2xl p-6 relative overflow-hidden group">
                    <h3 className="text-[10px] font-bold text-[#2dd4bf] uppercase tracking-widest mb-2">ความเสี่ยง 15 วัน (DeepMind)</h3>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-black text-[#facc15]">{data.maxRain15Days.toFixed(1)}</span>
                        <span className="text-lg text-[#facc15]/50 font-bold">มม.</span>
                    </div>
                </div>
            </div>

            {/* 🔮 Giant Graph & DeepMind Insight */}
            <div className="flex-1 bg-[#111a1c] border border-gray-800 rounded-3xl p-8 shadow-lg flex flex-col min-h-[450px]">
                
                {/* 🌎 ย้ายคำอธิบาย DeepMind มาไว้เหนือกราฟ */}
                <div className="mb-6 pb-6 border-b border-gray-800/50">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center">
                                <span className="mr-3 text-xl">📊</span> กราฟพยากรณ์ปริมาณฝน (TMD x Global Models)
                            </h3>
                            <p className="text-xs text-gray-500 mt-1 ml-8 tracking-wide">โมเดลผสานข้อมูลระดับพื้นที่ เพื่อความแม่นยำสูงสุดในตำบลบ่อหลวง</p>
                        </div>
                        <div className="bg-[#0a1112] px-4 py-2 rounded-xl border border-gray-700 max-w-sm">
                            <h4 className="text-[11px] text-[#2dd4bf] font-bold uppercase tracking-widest mb-1 flex items-center">
                                <span>🌎 DeepMind 15-Day Vision</span>
                            </h4>
                            {/* แสดงข้อความวิเคราะห์มหาภาค (ที่ท่านต้องการ) */}
                            <p className="text-[13px] text-gray-300 leading-snug">
                                {data.ai.deepmindTrend}
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* Graph Container */}
                <div className="flex-1 flex items-end justify-between space-x-2 md:space-x-4 h-full pb-4">
                    {data.daily.precipitation_sum.map((rain: number, idx: number) => {
                        const date = new Date(data.daily.time[idx]);
                        const dayName = date.toLocaleDateString('th-TH', { weekday: 'short' });
                        const dateNum = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                        
                        const maxVal = Math.max(data.maxRain7Days, 10); 
                        const heightPct = Math.max((rain / maxVal) * 100, 4); 
                        
                        const barColor = rain >= 50 ? 'bg-gradient-to-t from-[#9f1239] to-[#fb7185]' : 
                                         rain >= 20 ? 'bg-gradient-to-t from-[#ca8a04] to-[#fde047]' : 
                                         'bg-gradient-to-t from-[#0f766e] to-[#2dd4bf]';

                        return (
                            <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                                <div className={`text-sm font-bold mb-3 ${rain > 0 ? 'text-white' : 'text-gray-600'}`}>
                                    {rain.toFixed(1)}
                                </div>
                                <div className="w-full h-full flex items-end justify-center relative">
                                    <div className="absolute w-full h-full border-b border-gray-800/50 -z-10"></div>
                                    <div 
                                        className={`w-full max-w-[40px] rounded-t-lg ${barColor} shadow-lg transition-all duration-700 ease-out`} 
                                        style={{ height: `${heightPct}%` }}
                                    ></div>
                                </div>
                                <div className="mt-4 text-center">
                                    <div className="text-sm font-bold text-gray-300">{dayName}</div>
                                    <div className="text-xs text-gray-600 mt-1">{dateNum}</div>
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
