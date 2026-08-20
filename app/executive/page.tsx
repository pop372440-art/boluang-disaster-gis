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

  // นาฬิกา Real-time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [onwrRes, forecastRes] = await Promise.allSettled([
          fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}&current=temperature_2m,windspeed_10m,weathercode&daily=precipitation_sum,windspeed_10m_max&timezone=Asia%2FBangkok&forecast_days=7`)
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
    <div className="flex h-screen items-center justify-center bg-[#0d1617] text-white">
        <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-[#2dd4bf] border-t-transparent rounded-full animate-spin mb-6"></div>
            <span className="font-mono text-[#2dd4bf] text-xl tracking-widest animate-pulse">SYSTEM INITIALIZING...</span>
        </div>
    </div>
  );

  if (!data) return null;

  // ปรับแก้ Theme สีตามภาพตัวอย่าง (ใช้เขียว Mint/Teal เป็นหลัก)
  const getTheme = (status: string) => {
      if (status === 'CRITICAL') return { border: 'border-red-500/50', bg: 'bg-[#ef4444]', text: 'text-[#f87171]', icon: '🚨' };
      if (status === 'WARNING') return { border: 'border-yellow-500/50', bg: 'bg-[#facc15]', text: 'text-[#facc15]', icon: '⚠️' };
      return { border: 'border-[#2dd4bf]/40', bg: 'bg-[#0f766e]', text: 'text-[#2dd4bf]', icon: '✅' }; // สีเขียวมิ้นต์ (Teal)
  };
  const theme = getTheme(data.ai.status);

  return (
    // 🎨 พื้นหลังหลัก (Background) ใช้สีดำอมเขียวเข้ม (Deep Forest/Obsidian)
    <div className="min-h-screen bg-[#0a1112] p-4 md:p-8 font-sans text-gray-100 overflow-x-hidden flex flex-col">
      
      {/* 🖥️ Top Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 pb-4">
        <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white flex items-center">
                EXECUTIVE <span className={`ml-3 ${theme.text}`}>DASHBOARD</span>
            </h1>
            <p className="text-gray-400 mt-2 text-sm tracking-widest uppercase">Bo Luang Disaster Command Center</p>
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

      {/* 🎯 Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1">
        
        {/* 🧠 ฝั่งซ้าย: AI Analysis */}
        <div className="xl:col-span-5 flex flex-col gap-6">
            
            {/* AI Summary Box */}
            <div className={`flex-1 border border-gray-800 bg-[#111a1c] rounded-3xl p-8 flex flex-col shadow-lg`}>
                <div className="flex items-center space-x-4 mb-6 pb-4 border-b border-gray-800">
                    <div className="text-3xl">🧠</div>
                    <div>
                        <h2 className={`text-xl font-bold ${theme.text}`}>AI Executive Briefing</h2>
                        <span className="text-xs text-gray-400 font-mono tracking-widest">Status: {data.ai.status}</span>
                    </div>
                </div>
                
                <div className="space-y-6 flex-1">
                    <div className="p-1">
                        <h3 className="text-[#2dd4bf] font-bold text-sm mb-3 flex items-center"><span className="text-lg mr-3">📍</span> สถานการณ์ปัจจุบัน</h3>
                        <p className="text-gray-300 text-base leading-relaxed pl-7 border-l-2 border-[#2dd4bf]/30">{data.ai.dailyInsight}</p>
                    </div>
                    
                    <div className="p-1">
                        <h3 className="text-[#2dd4bf] font-bold text-sm mb-3 flex items-center"><span className="text-lg mr-3">📅</span> แนวโน้ม 7 วันข้างหน้า</h3>
                        <p className="text-gray-300 text-base leading-relaxed pl-7 border-l-2 border-[#2dd4bf]/30">{data.ai.weeklyTrend}</p>
                    </div>
                </div>
            </div>

            {/* Action Box */}
            <div className="border border-gray-800 bg-[#111a1c] rounded-3xl p-8 shadow-lg">
                <h3 className="text-base text-white font-bold mb-6 flex items-center tracking-wide">
                    <span className="text-xl mr-3">🎯</span> ข้อเสนอแนะการสั่งการ
                </h3>
                <ul className="space-y-3">
                    {data.ai.actions.map((action: string, idx: number) => (
                        <li key={idx} className="flex items-center bg-[#0a1112] p-4 rounded-xl border border-gray-800/60 transition-colors hover:border-[#2dd4bf]/50">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#2dd4bf] mr-4 flex-shrink-0"></div>
                            <span className="text-sm text-gray-300 font-medium">{action}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        {/* 📊 ฝั่งขวา: Data & Graphs */}
        <div className="xl:col-span-7 flex flex-col gap-6">
            
            {/* Top 3 KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#111a1c] border border-gray-800 rounded-2xl p-6 relative overflow-hidden group">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">อุณหภูมิ (TMD)</h3>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-black text-white">{Math.round(data.currentTemp)}</span>
                        <span className="text-lg text-gray-500 font-bold">°C</span>
                    </div>
                </div>

                <div className="bg-[#111a1c] border border-gray-800 rounded-2xl p-6 relative overflow-hidden group">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">ฝน 24 ชม. (ONWR)</h3>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-black text-[#4ade80]">{data.actualRain24h}</span>
                        <span className="text-lg text-gray-500 font-bold">มม.</span>
                    </div>
                </div>

                <div className="bg-[#111a1c] border border-gray-800 rounded-2xl p-6 relative overflow-hidden group">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">พยากรณ์สูงสุด (WINDY)</h3>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-black text-[#facc15]">{data.maxRain7Days.toFixed(1)}</span>
                        <span className="text-lg text-gray-500 font-bold">มม.</span>
                    </div>
                </div>
            </div>

            {/* Giant 7-Day Forecast Graph */}
            <div className="flex-1 bg-[#111a1c] border border-gray-800 rounded-3xl p-8 shadow-lg flex flex-col min-h-[400px]">
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-white flex items-center">
                        <span className="mr-3 text-xl">📊</span> กราฟพยากรณ์ปริมาณฝน 7 วัน
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 ml-8 tracking-wide">ข้อมูลจำลองอ้างอิงจาก Global Forecast Models</p>
                </div>
                
                {/* Graph Container */}
                <div className="flex-1 flex items-end justify-between space-x-2 md:space-x-4 h-full pb-4">
                    {data.daily.precipitation_sum.map((rain: number, idx: number) => {
                        const date = new Date(data.daily.time[idx]);
                        const dayName = date.toLocaleDateString('th-TH', { weekday: 'short' });
                        const dateNum = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                        
                        const maxVal = Math.max(data.maxRain7Days, 10); 
                        const heightPct = Math.max((rain / maxVal) * 100, 4); 
                        
                        // 🎨 สีกราฟแท่ง ปรับให้เข้ากับธีม (Teal/Mint) 
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
