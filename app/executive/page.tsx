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

  const BO_LUANG_LAT = 18.1633;
  const BO_LUANG_LNG = 98.3744;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [onwrRes, forecastRes] = await Promise.allSettled([
          fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'),
          // 🛑 1. แก้ไข URL: ลบคำว่า time ออกจาก daily=precipitation_sum,windspeed_10m_max
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
            const forecastJson = await forecastRes.value.json();
            // 🛡️ 2. เกราะป้องกัน: เช็คว่า API คืนค่า Error มาหรือไม่ก่อนนำไปใช้งาน
            if (!forecastJson.error) {
                forecast = forecastJson;
            } else {
                console.error("Open-Meteo API Error:", forecastJson.reason);
            }
        }

        // 🛡️ 3. เกราะป้องกัน: ตรวจสอบว่ามีข้อมูล current และ daily ครบถ้วนก่อนคำนวณ
        if (forecast && forecast.current && forecast.daily) {
            const currentTemp = forecast.current.temperature_2m || 0;
            const currentWind = forecast.current.windspeed_10m || 0;
            const maxRain7Days = Math.max(...forecast.daily.precipitation_sum);
            const maxWind7Days = Math.max(...forecast.daily.windspeed_10m_max);
            
            const criticalDayIndex = forecast.daily.precipitation_sum.indexOf(maxRain7Days);
            const rawDate = new Date(forecast.daily.time[criticalDayIndex]);
            const criticalDate = rawDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });
            
            let status = 'NORMAL';
            let dailyInsight = `อุณหภูมิ ${currentTemp}°C ลม ${currentWind} กม./ชม. สภาพอากาศปัจจุบันยังปลอดภัย`;
            let weeklyTrend = 'สภาพอากาศ 7 วันข้างหน้าอยู่ในเกณฑ์ปกติ ไม่มีแนวโน้มภัยพิบัติรุนแรง';
            let actions = ['ติดตามรายงานสถานการณ์ประจำวันตามปกติ', 'ตรวจสอบความพร้อมอุปกรณ์สื่อสารและศูนย์วิทยุ'];

            if (actualRain24h > 90 || maxRain7Days > 90 || maxWind7Days > 60) {
                status = 'CRITICAL';
                dailyInsight = actualRain24h > 90 
                    ? `วิกฤต! ขณะนี้ฝนตกหนักสะสมทะลุ ${actualRain24h} มม. พื้นที่อุ้มน้ำเต็มที่ เสี่ยงดินถล่มฉับพลัน!` 
                    : `อุณหภูมิ ${currentTemp}°C ลม ${currentWind} กม./ชม. (ฝนสะสม ${actualRain24h} มม.) พื้นที่เฝ้าระวังสีแดง`;
                
                weeklyTrend = `วิกฤต (CRITICAL): โมเดลตรวจพบร่องมรสุมรุนแรง คาดการณ์ฝนตกหนักสะสมทะลุ ${maxRain7Days} มม./วัน ในช่วงวัน${criticalDate} เสี่ยงน้ำป่าและดินถล่มสูงมาก`;
                actions = ['🚨 เรียกประชุมศูนย์ปฏิบัติการฉุกเฉิน (EOC) ทันที', `สั่งพร่องน้ำในแหล่งน้ำสาธารณะล่วงหน้าก่อนวัน${criticalDate}`, 'เตรียมอพยพประชาชนกลุ่มเปราะบางในพื้นที่เสี่ยงดินถล่ม'];
            } else if (actualRain24h > 35 || maxRain7Days > 35 || maxWind7Days > 35) {
                status = 'WARNING';
                dailyInsight = actualRain24h > 35
                    ? `มีฝนตกปานกลางถึงหนักสะสม ${actualRain24h} มม. ดินเริ่มอุ้มน้ำ โปรดเฝ้าระวังน้ำป่า`
                    : `อุณหภูมิ ${currentTemp}°C ลม ${currentWind} กม./ชม. สภาพอากาศปัจจุบันยังปลอดภัย`;

                weeklyTrend = `เฝ้าระวัง (WARNING): โมเดลพยากรณ์พบกลุ่มฝน/ลมกระโชกแรง ในช่วงวัน${criticalDate} คาดว่าจะมีฝนสะสม ${maxRain7Days} มม./วัน อาจทำให้ต้นไม้หักโค่นหรือน้ำท่วมขังรอการระบาย`;
                actions = ['แจ้งเตือน อปพร. และกู้ชีพเทศบาลเตรียมอุปกรณ์รับมือ', 'ตรวจสอบการอุดตันของท่อระบายน้ำและทางน้ำไหล', 'ประกาศแจ้งเตือนประชาชนผ่านหอกระจายข่าวหมู่บ้าน'];
            }

            setData({
                actualRain24h,
                currentTemp,
                currentWind,
                maxRain7Days,
                maxWind7Days,
                daily: forecast.daily,
                ai: { status, dailyInsight, weeklyTrend, actions }
            });
        } else {
            // กรณี API ล่ม หรือดึงข้อมูลไม่ได้ ให้เซ็ตค่าเริ่มต้นกันเว็บพัง
             setData({
                actualRain24h,
                currentTemp: 0, currentWind: 0, maxRain7Days: 0, maxWind7Days: 0,
                daily: { precipitation_sum: [], time: [] },
                ai: { status: 'NORMAL', dailyInsight: 'กำลังเชื่อมต่อข้อมูลสภาพอากาศ...', weeklyTrend: 'ไม่สามารถดึงข้อมูลพยากรณ์ล่วงหน้าได้', actions: ['โปรดรีเฟรชหน้าเว็บอีกครั้ง'] }
            });
        }
      } catch (e) {
        console.error("Data processing error:", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-[#0b132b] text-white">
        <div className="animate-pulse flex flex-col items-center">
            <div className="w-10 h-10 border-4 border-[#38bdf8] border-t-transparent rounded-full animate-spin mb-4"></div>
            <span className="font-mono text-[#38bdf8]">AI is gathering intelligence...</span>
        </div>
    </div>
  );

  if (!data) return null;

  const getTheme = (status: string) => {
      if (status === 'CRITICAL') return { border: 'border-red-500/50', bg: 'bg-[#ef4444]', boxBg: 'bg-red-500/10', text: 'text-red-400', icon: '🚨' };
      if (status === 'WARNING') return { border: 'border-yellow-500/50', bg: 'bg-[#facc15]', boxBg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: '⚠️' };
      return { border: 'border-[#38bdf8]/50', bg: 'bg-[#38bdf8]', boxBg: 'bg-[#38bdf8]/10', text: 'text-[#38bdf8]', icon: '✅' };
  };

  const theme = getTheme(data.ai.status);

  return (
    <div className="min-h-screen bg-[#050b14] p-4 md:p-8 font-sans text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="border-b border-gray-800 pb-4">
            <h1 className="text-3xl font-extrabold tracking-wide text-white">EXECUTIVE <span className={theme.text}>DASHBOARD</span></h1>
            <p className="text-gray-400 mt-1 text-sm">ระบบวิเคราะห์ข้อมูลสภาพอากาศและสนับสนุนการตัดสินใจด้วย AI</p>
        </div>

        {/* 🧠 1. ส่วนมันสมอง: สรุปรายงานจาก AI (ตามรูปเป๊ะๆ) */}
        <div className={`border ${theme.border} ${theme.boxBg} rounded-2xl p-6 shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md`}>
          <div className="flex items-center space-x-3 mb-6">
            <span className="text-4xl">🧠</span>
            <div>
              <h2 className={`text-xl font-bold ${theme.text}`}>สรุปรายงานจากปัญญาประดิษฐ์ (AI Executive Briefing)</h2>
              <span className="text-xs text-gray-400 font-mono">Real-time Data Sources: ONWR, GFS/ECMWF Models</span>
            </div>
          </div>
          
          <div className="space-y-4">
            {/* สถานการณ์ปัจจุบัน */}
            <div className="bg-[#0f172a]/80 p-5 rounded-xl border border-gray-700 shadow-inner">
              <h3 className="text-[#38bdf8] font-bold text-sm mb-3 flex items-center"><span className="mr-2">📍</span> สถานการณ์ปัจจุบัน (Today's Insight)</h3>
              <p className="text-gray-200 text-[15px] leading-relaxed font-medium">{data.ai.dailyInsight}</p>
            </div>
            
            {/* แนวโน้ม 7 วันข้างหน้า */}
            <div className="bg-[#0f172a]/80 p-5 rounded-xl border border-gray-700 shadow-inner">
              <h3 className="text-yellow-400 font-bold text-sm mb-3 flex items-center"><span className="mr-2">📅</span> แนวโน้ม 7 วันข้างหน้า (7-Day Predictive Trend)</h3>
              <p className="text-gray-200 text-[15px] leading-relaxed font-medium">{data.ai.weeklyTrend}</p>
            </div>
          </div>
        </div>

        {/* 📊 2. ส่วนปฏิบัติการ: Bento Grid (ข้อเสนอแนะ + ข้อมูลดิบ + กราฟ) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* ข้อเสนอแนะการสั่งการล่วงหน้า */}
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 shadow-lg">
                <h3 className="text-sm text-[#38bdf8] font-bold mb-4 flex items-center"><span className="mr-2">🎯</span> ข้อเสนอแนะการสั่งการล่วงหน้า</h3>
                <ul className="space-y-4">
                    {data.ai.actions.map((action: string, idx: number) => (
                        <li key={idx} className="flex items-start">
                            <span className="text-[#38bdf8] mr-3 mt-1">▪</span>
                            <span className="text-sm text-gray-200 font-semibold leading-relaxed">{action}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* ข้อมูลตรวจวัดจริง ณ ปัจจุบัน */}
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 shadow-lg">
                <h3 className="text-sm text-gray-400 font-bold mb-4 flex items-center"><span className="mr-2">📡</span> ข้อมูลตรวจวัดจริง ณ ปัจจุบัน</h3>
                <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-[#0b132b] rounded-lg border border-gray-800">
                        <span className="text-gray-400 text-xs font-mono">อุณหภูมิปัจจุบัน (TMD/Meteo)</span>
                        <span className="text-white font-bold text-base">{Math.round(data.currentTemp)} °C</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-[#0b132b] rounded-lg border border-gray-800">
                        <span className="text-gray-400 text-xs font-mono">ฝนสะสม 24 ชม. ล่าสุด (ONWR)</span>
                        <span className="text-[#38bdf8] font-bold text-base">{data.actualRain24h} มม.</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-[#0b132b] rounded-lg border border-gray-800">
                        <span className="text-gray-400 text-xs font-mono">พยากรณ์ฝนสูงสุดใน 7 วัน (Windy)</span>
                        <span className="text-yellow-400 font-bold text-base">{data.maxRain7Days.toFixed(1)} มม.</span>
                    </div>
                </div>
            </div>

            {/* กราฟพยากรณ์ 7 วัน (Visual Graph) */}
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 shadow-lg flex flex-col">
                <h3 className="text-sm text-gray-400 font-bold mb-4 flex items-center"><span className="mr-2">📊</span> กราฟพยากรณ์ฝน 7 วัน</h3>
                <div className="flex-1 flex items-end justify-between space-x-1 h-32 mt-auto pb-2">
                    {data.daily.precipitation_sum.map((rain: number, idx: number) => {
                        const date = new Date(data.daily.time[idx]);
                        const dayName = date.toLocaleDateString('th-TH', { weekday: 'short' });
                        const heightPct = data.maxRain7Days > 0 ? (rain / data.maxRain7Days) * 100 : 5;
                        const barColor = rain > 50 ? 'bg-[#ef4444]' : (rain > 20 ? 'bg-[#facc15]' : 'bg-[#0ea5e9]');

                        return (
                            <div key={idx} className="flex flex-col items-center flex-1 group">
                                <div className="text-[10px] text-gray-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity font-mono">{rain}</div>
                                <div className={`w-full max-w-[16px] rounded-t-sm ${barColor} transition-all duration-500 opacity-80 group-hover:opacity-100`} style={{ height: `${Math.max(heightPct, 5)}%` }}></div>
                                <div className="text-[10px] text-gray-500 mt-2 font-medium">{dayName}</div>
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
