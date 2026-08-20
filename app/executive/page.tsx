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
        // 📡 1. เชื่อมต่อ 3 ขุมพลัง API (ONWR, OpenMeteo Standard, Google WeatherNext 2)
        const [onwrRes, forecastRes, deepmindRes] = await Promise.allSettled([
          fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}&current=temperature_2m,windspeed_10m,weathercode&daily=precipitation_sum,windspeed_10m_max&timezone=Asia%2FBangkok&forecast_days=7`),
          // 🔥 API ตัวใหม่ของ Google DeepMind (WeatherNext 2) พยากรณ์ล่วงหน้า 15 วัน
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
            const maxRain7Days = Math.max(...forecast.daily.precipitation_sum);
            
            // 🤖 วิเคราะห์แนวโน้มวิกฤตล่วงหน้า 15 วันด้วย WeatherNext 2
            // ค่าที่ดึงมาจะเป็น Array ของทุก Member (Ensemble) เราจะหาค่าที่มากที่สุด (Worst Case Scenario)
            let maxRain15Days = 0;
            let criticalDate15Days = '';
            
            // เนื่องจาก API ส่งมาหลายโมเดล เราเช็คแค่ค่าที่มีคำว่า google_weathernext2_ensemble
            const ensembleKeys = Object.keys(deepmindForecast.daily).filter(k => k.startsWith('precipitation_sum_google'));
            
            if(ensembleKeys.length > 0) {
               // หาค่าที่น่าจะเลวร้ายที่สุดจากการรันหลายๆ รูปแบบ
               const allPossibilities = ensembleKeys.map(key => Math.max(...deepmindForecast.daily[key]));
               maxRain15Days = Math.max(...allPossibilities);
               
               // หาวันที่ (คร่าวๆ) ที่จะเกิดจุด Peak
               const worstModelKey = ensembleKeys.find(key => Math.max(...deepmindForecast.daily[key]) === maxRain15Days);
               if(worstModelKey) {
                   const peakIndex = deepmindForecast.daily[worstModelKey].indexOf(maxRain15Days);
                   const rawDate = new Date(deepmindForecast.daily.time[peakIndex]);
                   criticalDate15Days = rawDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
               }
            }

            let status = 'NORMAL';
            let dailyInsight = `อุณหภูมิ ${currentTemp}°C ลม ${currentWind} กม./ชม. สภาพอากาศปัจจุบันปลอดภัย (ข้อมูล ONWR)`;
            let weeklyTrend = 'สภาพอากาศ 7 วันข้างหน้าปกติ ไม่มีพายุรุนแรง';
            let actions = ['ตรวจสอบความพร้อมอุปกรณ์เตือนภัยประจำเดือน', 'ติดตามรายงานสถานการณ์ตามปกติ'];

            // ตรรกะใหม่ที่รวมข้อมูล DeepMind เข้ามาช่วยวิเคราะห์
            if (actualRain24h > 90 || maxRain7Days > 90) {
                status = 'CRITICAL';
                dailyInsight = actualRain24h > 90 
                    ? `วิกฤตฉับพลัน! ดินอุ้มน้ำเกินขีดจำกัด (ฝนสะสม ${actualRain24h} มม.) เสี่ยงดินถล่มสูงสุด!` 
                    : `เฝ้าระวังสูงสุด! วันนี้ฝนสะสม ${actualRain24h} มม. พื้นที่ลาดชันมีความเปราะบาง`;
                weeklyTrend = `วิกฤตระยะสั้น (CRITICAL): โมเดลพยากรณ์ชี้พายุจะเข้ากระแทกใน 7 วันนี้ คาดฝนสะสมทะลุ ${maxRain7Days} มม./วัน`;
                actions = ['🚨 เปิดศูนย์ EOC ตลอด 24 ชั่วโมง', 'อพยพผู้ป่วยติดเตียงและเด็กในโซนเชิงเขา', 'สั่งเครื่องจักรกลหนักแสตนด์บายจุดเสี่ยงดินสไลด์'];
            } else if (maxRain15Days > 100) {
                // แจ้งเตือนระยะยาวด้วยศักยภาพของ DeepMind (15 วัน)
                status = 'WARNING';
                dailyInsight = `สภาพอากาศปัจจุบัน (ฝนสะสม ${actualRain24h} มม.) ยังปลอดภัยดี แต่โมเดล AI ตรวจพบพายุก่อตัวในระยะยาว`;
                weeklyTrend = `เตรียมพร้อมรับมือ (EARLY WARNING): Google DeepMind WeatherNext 2 พยากรณ์ความเสี่ยงว่าพายุใหญ่จะเข้าปะทะพื้นที่ช่วงวันที่ ${criticalDate15Days} (ฝนสูงสุดถึง ${maxRain15Days.toFixed(1)} มม.)`;
                actions = ['สั่งการพร่องน้ำในแหล่งน้ำล่วงหน้า', 'เรียกประชุมหัวหน้าส่วนราชการเตรียมแผนรับมือพายุล่วงหน้า 2 สัปดาห์', 'สำรวจความแข็งแรงของป้ายโฆษณาและต้นไม้ใหญ่'];
            } else if (actualRain24h > 35 || maxRain7Days > 35) {
                status = 'WARNING';
                dailyInsight = actualRain24h > 35
                    ? `ดินเริ่มชุ่มน้ำ (ฝนสะสม ${actualRain24h} มม.) ระวังน้ำท่วมขัง`
                    : `อุณหภูมิ ${currentTemp}°C สภาพอากาศปัจจุบันปลอดภัย`;
                weeklyTrend = `เฝ้าระวัง (WARNING): โมเดลพยากรณ์พบกลุ่มฝนสะสม ${maxRain7Days} มม./วัน ในสัปดาห์นี้ อาจมีน้ำหลากในพื้นที่ลุ่มต่ำ`;
                actions = ['กำจัดสิ่งกีดขวางทางน้ำในลำห้วย', 'แจ้ง อปพร. เตรียมพร้อมอุปกรณ์กู้ภัย'];
            }

            setData({
                actualRain24h, currentTemp, currentWind, maxRain7Days, maxRain15Days,
                daily: forecast.daily,
                ai: { status, dailyInsight, weeklyTrend, actions }
            });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-[#0a1112] text-white">
        <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-[#2dd4bf] border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_#2dd4bf]"></div>
            <span className="font-mono text-[#2dd4bf] text-lg tracking-widest animate-pulse">Syncing with Google DeepMind...</span>
        </div>
    </div>
  );

  if (!data) return null;

  const getTheme = (status: string) => {
      if (status === 'CRITICAL') return { border: 'border-red-500/50', bg: 'bg-[#ef4444]', text: 'text-[#f87171]' };
      if (status === 'WARNING') return { border: 'border-yellow-500/50', bg: 'bg-[#facc15]', text: 'text-[#facc15]' };
      return { border: 'border-[#2dd4bf]/40', bg: 'bg-[#0f766e]', text: 'text-[#2dd4bf]' };
  };
  const theme = getTheme(data.ai.status);

  return (
    <div className="min-h-screen bg-[#0a1112] p-4 md:p-8 font-sans text-gray-100 flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 pb-4">
        <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white flex items-center">
                EXECUTIVE <span className={`ml-3 ${theme.text}`}>DASHBOARD</span>
            </h1>
            <p className="text-[#2dd4bf] mt-2 text-sm tracking-widest font-mono">POWERED BY GOOGLE DEEPMIND WEATHERNEXT 2</p>
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
        <div className="xl:col-span-5 flex flex-col gap-6">
            <div className={`flex-1 border border-gray-800 bg-[#111a1c] rounded-3xl p-8 flex flex-col shadow-lg`}>
                <div className="flex items-center space-x-4 mb-6 pb-4 border-b border-gray-800">
                    <div className="w-12 h-12 rounded-full bg-[#111a1c] flex items-center justify-center text-2xl shadow-inner border border-gray-700">🧠</div>
                    <div>
                        <h2 className={`text-xl font-bold ${theme.text}`}>AI Executive Briefing</h2>
                        <span className="text-xs text-gray-400 font-mono tracking-widest">Status: {data.ai.status}</span>
                    </div>
                </div>
                
                <div className="space-y-6 flex-1">
                    <div className="p-1">
                        <h3 className="text-[#2dd4bf] font-bold text-sm mb-3 flex items-center"><span className="text-lg mr-3">📍</span> สถานการณ์ระดับพื้นที่ (ONWR / Micro-climate)</h3>
                        <p className="text-gray-300 text-base leading-relaxed pl-7 border-l-2 border-[#2dd4bf]/30">{data.ai.dailyInsight}</p>
                    </div>
                    <div className="p-1">
                        <h3 className="text-[#2dd4bf] font-bold text-sm mb-3 flex items-center"><span className="text-lg mr-3">🌎</span> พยากรณ์มหาภาค (DeepMind 15-Day Model)</h3>
                        <p className="text-gray-300 text-base leading-relaxed pl-7 border-l-2 border-[#2dd4bf]/30">{data.ai.weeklyTrend}</p>
                    </div>
                </div>
            </div>

            <div className="border border-gray-800 bg-[#111a1c] rounded-3xl p-8 shadow-lg">
                <h3 className="text-base text-white font-bold mb-6 flex items-center tracking-wide">
                    <span className="text-xl mr-3">🎯</span> ข้อเสนอแนะการสั่งการเชิงรุก (Proactive Actions)
                </h3>
                <ul className="space-y-3">
                    {data.ai.actions.map((action: string, idx: number) => (
                        <li key={idx} className="flex items-center bg-[#0a1112] p-4 rounded-xl border border-gray-800/60">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#2dd4bf] mr-4 flex-shrink-0"></div>
                            <span className="text-sm text-gray-300 font-medium">{action}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        <div className="xl:col-span-7 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#111a1c] border border-gray-800 rounded-2xl p-6 relative">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">อุณหภูมิปัจจุบัน</h3>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-black text-white">{Math.round(data.currentTemp)}</span>
                        <span className="text-lg text-gray-500 font-bold">°C</span>
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
                    <h3 className="text-[10px] font-bold text-[#2dd4bf] uppercase tracking-widest mb-2">พยากรณ์สูงสุด 15 วัน (DeepMind)</h3>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-black text-[#facc15]">{data.maxRain15Days.toFixed(1)}</span>
                        <span className="text-lg text-[#facc15]/50 font-bold">มม.</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 bg-[#111a1c] border border-gray-800 rounded-3xl p-8 shadow-lg flex flex-col min-h-[400px]">
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-white flex items-center">
                        <span className="mr-3 text-xl">📊</span> กราฟพยากรณ์ปริมาณฝน (7-Day Micro Model)
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 ml-8 tracking-wide">ข้อมูลระดับความละเอียดสูง (High-Resolution) สำหรับพื้นที่ตำบลบ่อหลวง</p>
                </div>
                
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
