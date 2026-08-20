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

  // นาฬิกา Real-time สำหรับจอ Command Center
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [onwrRes, forecastRes] = await Promise.allSettled([
          fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}&current=temperature_2m,windspeed_10m,weathercode&daily=precipitation_sum,windspeed_10m_max,time&timezone=Asia%2FBangkok&forecast_days=7`)
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

        if (forecast) {
            const currentTemp = forecast.current.temperature_2m;
            const currentWind = forecast.current.windspeed_10m;
            const maxRain7Days = Math.max(...forecast.daily.precipitation_sum);
            const maxWind7Days = Math.max(...forecast.daily.windspeed_10m_max);
            
            const criticalDayIndex = forecast.daily.precipitation_sum.indexOf(maxRain7Days);
            const rawDate = new Date(forecast.daily.time[criticalDayIndex]);
            const criticalDate = rawDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });
            
            let status = 'NORMAL';
            let dailyInsight = `อุณหภูมิ ${currentTemp}°C ลม ${currentWind} กม./ชม. สภาพอากาศปัจจุบันปลอดภัย`;
            let weeklyTrend = 'สภาพอากาศ 7 วันข้างหน้าอยู่ในเกณฑ์ปกติ ไม่มีแนวโน้มภัยพิบัติรุนแรง';
            let actions = ['ติดตามรายงานสถานการณ์ประจำวันตามปกติ', 'ตรวจสอบความพร้อมอุปกรณ์สื่อสารและศูนย์วิทยุ'];

            if (actualRain24h > 90 || maxRain7Days > 90 || maxWind7Days > 60) {
                status = 'CRITICAL';
                dailyInsight = actualRain24h > 90 
                    ? `วิกฤต! ขณะนี้ฝนตกหนักสะสมทะลุ ${actualRain24h} มม. พื้นที่อุ้มน้ำเต็มที่ เสี่ยงดินถล่มฉับพลัน!` 
                    : `อุณหภูมิ ${currentTemp}°C ลม ${currentWind} กม./ชม. พื้นที่เฝ้าระวังสีแดง`;
                weeklyTrend = `วิกฤต (CRITICAL): โมเดลตรวจพบร่องมรสุมรุนแรง คาดการณ์ฝนตกหนักสะสมทะลุ ${maxRain7Days} มม./วัน ในช่วงวัน${criticalDate} เสี่ยงน้ำป่าและดินถล่มสูงมาก`;
                actions = ['🚨 เรียกประชุมศูนย์ปฏิบัติการฉุกเฉิน (EOC) ทันที', `สั่งพร่องน้ำในแหล่งน้ำสาธารณะล่วงหน้าก่อนวัน${criticalDate}`, 'เตรียมอพยพประชาชนกลุ่มเปราะบางในพื้นที่เสี่ยงดินถล่ม'];
            } else if (actualRain24h > 35 || maxRain7Days > 35 || maxWind7Days > 35) {
                status = 'WARNING';
                dailyInsight = actualRain24h > 35
                    ? `มีฝนตกปานกลางถึงหนักสะสม ${actualRain24h} มม. ดินเริ่มอุ้มน้ำ โปรดเฝ้าระวังน้ำป่า`
                    : `อุณหภูมิ ${currentTemp}°C ลม ${currentWind} กม./ชม. สภาพอากาศปัจจุบันปลอดภัย`;
                weeklyTrend = `เฝ้าระวัง (WARNING): โมเดลพยากรณ์พบกลุ่มฝน/ลมกระโชกแรง ในช่วงวัน${criticalDate} คาดว่าจะมีฝนสะสม ${maxRain7Days} มม./วัน อาจทำให้ต้นไม้หักโค่นหรือน้ำท่วมขังรอการระบาย`;
                actions = ['แจ้งเตือน อปพร. และกู้ชีพเทศบาลเตรียมอุปกรณ์รับมือ', 'ตรวจสอบการอุดตันของท่อระบายน้ำและทางน้ำไหล', 'ประกาศแจ้งเตือนประชาชนผ่านหอกระจายข่าวหมู่บ้าน'];
            }

            setData({
                actualRain24h, currentTemp, currentWind, maxRain7Days, maxWind7Days,
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
    <div className="flex h-screen items-center justify-center bg-[#030712] text-white">
        <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-[#38bdf8] border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_#38bdf8]"></div>
            <span className="font-mono text-[#38bdf8] text-xl tracking-widest animate-pulse">SYSTEM INITIALIZING...</span>
        </div>
    </div>
  );

  if (!data) return null;

  const getTheme = (status: string) => {
      if (status === 'CRITICAL') return { border: 'border-red-500/50', bg: 'bg-[#ef4444]', text: 'text-[#f87171]', icon: '🚨', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.2)]' };
      if (status === 'WARNING') return { border: 'border-yellow-500/50', bg: 'bg-[#facc15]', text: 'text-[#facc15]', icon: '⚠️', glow: 'shadow-[0_0_30px_rgba(250,204,21,0.15)]' };
      return { border: 'border-[#38bdf8]/50', bg: 'bg-[#0ea5e9]', text: 'text-[#38bdf8]', icon: '✅', glow: 'shadow-[0_0_30px_rgba(56,189,248,0.1)]' };
  };
  const theme = getTheme(data.ai.status);

  return (
    <div className="min-h-screen bg-[#030712] p-4 md:p-8 font-sans text-white overflow-x-hidden flex flex-col">
      
      {/* 🖥️ Top Bar (Header & Clock) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b border-gray-800 pb-4">
        <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white flex items-center">
                EXECUTIVE <span className={`ml-3 ${theme.text}`}>DASHBOARD</span>
            </h1>
            <p className="text-gray-400 mt-2 text-lg tracking-wide uppercase">Bo Luang Disaster Command Center</p>
        </div>
        <div className="mt-4 md:mt-0 text-right">
            <div className="text-3xl md:text-4xl font-mono font-bold text-white tracking-widest drop-shadow-md">
                {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-sm text-gray-500 font-medium mt-1">
                {currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
        </div>
      </div>

      {/* 🎯 Main Grid Layout (จอทีวีเต็มรูปแบบ) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1">
        
        {/* 🧠 ฝั่งซ้าย: AI Analysis (กินพื้นที่ 5 ส่วน) */}
        <div className="xl:col-span-5 flex flex-col gap-6">
            
            {/* AI Summary Box */}
            <div className={`flex-1 border ${theme.border} bg-[#0b1120] rounded-3xl p-8 ${theme.glow} flex flex-col`}>
                <div className="flex items-center space-x-4 mb-6 pb-4 border-b border-gray-800/50">
                    <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-3xl shadow-inner border border-gray-700">🧠</div>
                    <div>
                        <h2 className={`text-2xl font-bold ${theme.text}`}>AI Executive Briefing</h2>
                        <span className="text-sm text-gray-400 font-mono">Status: {data.ai.status}</span>
                    </div>
                </div>
                
                <div className="space-y-6 flex-1">
                    <div className="bg-[#030712]/50 p-6 rounded-2xl border border-gray-800">
                        <h3 className="text-[#38bdf8] font-bold text-lg mb-3 flex items-center"><span className="text-2xl mr-3">📍</span> สถานการณ์ปัจจุบัน</h3>
                        <p className="text-gray-300 text-lg leading-relaxed">{data.ai.dailyInsight}</p>
                    </div>
                    
                    <div className="bg-[#030712]/50 p-6 rounded-2xl border border-gray-800">
                        <h3 className="text-yellow-400 font-bold text-lg mb-3 flex items-center"><span className="text-2xl mr-3">📅</span> แนวโน้ม 7 วันข้างหน้า</h3>
                        <p className="text-gray-300 text-lg leading-relaxed">{data.ai.weeklyTrend}</p>
                    </div>
                </div>
            </div>

            {/* Action Box */}
            <div className="border border-gray-800 bg-[#0b1120] rounded-3xl p-8 shadow-lg">
                <h3 className="text-lg text-white font-bold mb-6 flex items-center uppercase tracking-widest">
                    <span className="text-2xl mr-3">🎯</span> ข้อเสนอแนะการสั่งการ
                </h3>
                <ul className="space-y-4">
                    {data.ai.actions.map((action: string, idx: number) => (
                        <li key={idx} className="flex items-start bg-[#030712] p-4 rounded-xl border border-gray-800/50">
                            <span className="text-[#38bdf8] mr-4 text-xl">▪</span>
                            <span className="text-base text-gray-200 font-medium leading-relaxed">{action}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        {/* 📊 ฝั่งขวา: Data & Graphs (กินพื้นที่ 7 ส่วน) */}
        <div className="xl:col-span-7 flex flex-col gap-6">
            
            {/* Top 3 KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#0b1120] border border-gray-800 rounded-3xl p-6 relative overflow-hidden group hover:border-[#38bdf8]/50 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl group-hover:opacity-20 transition-opacity">🌡️</div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">อุณหภูมิ (TMD)</h3>
                    <div className="flex items-baseline space-x-2">
                        <span className="text-5xl font-black text-white">{Math.round(data.currentTemp)}</span>
                        <span className="text-xl text-gray-500 font-bold">°C</span>
                    </div>
                </div>

                <div className="bg-[#0b1120] border border-gray-800 rounded-3xl p-6 relative overflow-hidden group hover:border-[#4ade80]/50 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl group-hover:opacity-20 transition-opacity">🌧️</div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">ฝน 24 ชม. (ONWR)</h3>
                    <div className="flex items-baseline space-x-2">
                        <span className="text-5xl font-black text-[#4ade80]">{data.actualRain24h}</span>
                        <span className="text-xl text-gray-500 font-bold">มม.</span>
                    </div>
                </div>

                <div className="bg-[#0b1120] border border-gray-800 rounded-3xl p-6 relative overflow-hidden group hover:border-[#facc15]/50 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl group-hover:opacity-20 transition-opacity">🌪️</div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">พยากรณ์สูงสุด (Windy)</h3>
                    <div className="flex items-baseline space-x-2">
                        <span className="text-5xl font-black text-[#facc15]">{data.maxRain7Days.toFixed(1)}</span>
                        <span className="text-xl text-gray-500 font-bold">มม.</span>
                    </div>
                </div>
            </div>

            {/* Giant 7-Day Forecast Graph (แก้บั๊ก 0 มม. แล้ว) */}
            <div className="flex-1 bg-[#0b1120] border border-gray-800 rounded-3xl p-8 shadow-lg flex flex-col min-h-[400px]">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center">
                            <span className="mr-3 text-2xl">📊</span> กราฟพยากรณ์ปริมาณฝน 7 วัน
                        </h3>
                        <p className="text-sm text-gray-400 mt-2 ml-9">ข้อมูลจำลองอ้างอิงจาก Global Forecast Models</p>
                    </div>
                </div>
                
                {/* Graph Container */}
                <div className="flex-1 flex items-end justify-between space-x-2 md:space-x-4 h-full pb-4">
                    {data.daily.precipitation_sum.map((rain: number, idx: number) => {
                        const date = new Date(data.daily.time[idx]);
                        const dayName = date.toLocaleDateString('th-TH', { weekday: 'short' });
                        const dateNum = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                        
                        // 🛠️ แก้บั๊กกราฟ 0 มม.: กำหนดความสูงขั้นต่ำไว้ที่ 4% เพื่อให้เห็นฐานกราฟเสมอ
                        const maxVal = Math.max(data.maxRain7Days, 10); // ป้องกันหาร 0 และกำหนดเพดานต่ำสุดที่ 10 มม.
                        const heightPct = Math.max((rain / maxVal) * 100, 4); 
                        
                        // เปลี่ยนสีกราฟตามระดับความอันตราย
                        const barColor = rain >= 50 ? 'bg-gradient-to-t from-[#991b1b] to-[#ef4444]' : 
                                         rain >= 20 ? 'bg-gradient-to-t from-[#854d0e] to-[#facc15]' : 
                                         'bg-gradient-to-t from-[#075985] to-[#38bdf8]';

                        return (
                            <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                                {/* ตัวเลขเหนือแท่งกราฟ (โชว์เสมอ ไม่ต้อง Hover ก็เห็น) */}
                                <div className={`text-sm md:text-base font-bold mb-3 ${rain > 0 ? 'text-white' : 'text-gray-600'}`}>
                                    {rain.toFixed(1)}
                                </div>
                                
                                {/* แท่งกราฟ */}
                                <div className="w-full h-full flex items-end justify-center relative">
                                    {/* เส้นกริดลางๆ ด้านหลังกราฟ */}
                                    <div className="absolute w-full h-full border-b border-gray-800 -z-10"></div>
                                    <div 
                                        className={`w-full max-w-[48px] rounded-t-lg ${barColor} shadow-lg transition-all duration-700 ease-out`} 
                                        style={{ height: `${heightPct}%` }}
                                    ></div>
                                </div>
                                
                                {/* ป้ายกำกับแกน X (วันและวันที่) */}
                                <div className="mt-4 text-center">
                                    <div className="text-sm font-bold text-gray-300">{dayName}</div>
                                    <div className="text-xs text-gray-500 mt-1">{dateNum}</div>
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
