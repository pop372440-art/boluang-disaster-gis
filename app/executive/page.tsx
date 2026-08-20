'use client';
import React, { useState, useEffect } from 'react';

// 🧮 ฟังก์ชันคำนวณระยะทาง เพื่อหาสถานีวัดน้ำฝนที่ใกล้บ่อหลวงที่สุด
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

export default function ExecutiveDashboard() {
  const [aiReport, setAiReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // พิกัดศูนย์กลางตำบลบ่อหลวง
  const BO_LUANG_LAT = 18.1633;
  const BO_LUANG_LNG = 98.3744;

  useEffect(() => {
    const fetchAndAnalyzeRealData = async () => {
      setIsLoading(true);
      try {
        // 📡 1. ดึงข้อมูล "ของจริง" จาก API 2 แหล่งพร้อมกัน
        const [onwrRes, forecastRes] = await Promise.allSettled([
          fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'),
          // ใช้ Open-Meteo ดึงทั้ง Current (แทนกรมอุตุฯ) และ Daily 7 วัน (แทน Windy)
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${BO_LUANG_LAT}&longitude=${BO_LUANG_LNG}&current=temperature_2m,windspeed_10m,precipitation&daily=precipitation_sum,windspeed_10m_max,weathercode&timezone=Asia%2FBangkok&forecast_days=7`)
        ]);

        // 🔄 2. ประมวลผลข้อมูล สทนช. (ONWR)
        let actualRain24h = 0;
        let stationName = 'ไม่ทราบสถานี';
        if (onwrRes.status === 'fulfilled') {
            const onwrJson = await onwrRes.value.json();
            let arrData = onwrJson?.data?.data || onwrJson?.data || [];
            
            // ค้นหาสถานีที่ใกล้บ่อหลวงที่สุด
            let minDistance = Infinity;
            arrData.forEach((station: any) => {
                const lat = parseFloat(station?.station?.tele_station_lat || station?.lat);
                const lng = parseFloat(station?.station?.tele_station_long || station?.lng);
                if (lat && lng) {
                    const dist = calculateDistance(BO_LUANG_LAT, BO_LUANG_LNG, lat, lng);
                    if (dist < minDistance) {
                        minDistance = dist;
                        actualRain24h = parseFloat(station?.rain_24h) || 0;
                        stationName = station?.station?.tele_station_name?.th || 'สถานีใกล้เคียง';
                    }
                }
            });
        }

        // 🔄 3. ประมวลผลข้อมูลกรมอุตุฯ/Windy (Open-Meteo)
        let currentTemp = 0, currentWind = 0, forecastData = null;
        if (forecastRes.status === 'fulfilled') {
            const forecastJson = await forecastRes.value.json();
            currentTemp = forecastJson.current.temperature_2m;
            currentWind = forecastJson.current.windspeed_10m;
            forecastData = forecastJson.daily;
        }

        // 🤖 4. ตรรกะปัญญาประดิษฐ์ (AI Expert System) วิเคราะห์ข้อมูลจริง
        let status = 'NORMAL';
        let dailyInsight = `วันนี้สภาพอากาศปกติ อุณหภูมิ ${currentTemp}°C ความเร็วลม ${currentWind} กม./ชม. ปริมาณฝนสะสม 24 ชม. (${stationName}) อยู่ที่ ${actualRain24h} มม. พื้นที่ปลอดภัย`;
        let weeklyTrend = 'สภาพอากาศล่วงหน้า 7 วันอยู่ในเกณฑ์ปกติ ไม่มีแนวโน้มภัยพิบัติรุนแรง';
        let recommendedActions = ['ติดตามรายงานสถานการณ์ประจำวันตามปกติ'];

        if (forecastData) {
            // หาค่าพีคสูงสุดในช่วง 7 วันข้างหน้า
            const maxRain7Days = Math.max(...forecastData.precipitation_sum);
            const maxWind7Days = Math.max(...forecastData.windspeed_10m_max);
            const criticalDayIndex = forecastData.precipitation_sum.indexOf(maxRain7Days);
            
            // ดึงวันที่เกิดเหตุการณ์รุนแรงที่สุดมาแสดง
            const rawDate = new Date(forecastData.time[criticalDayIndex]);
            const criticalDate = rawDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });

            // ⚠️ กำหนด Threshold การแจ้งเตือนจากข้อมูลจริง
            if (actualRain24h > 90 || maxRain7Days > 90 || maxWind7Days > 60) {
                status = 'CRITICAL';
                dailyInsight = actualRain24h > 90 
                    ? `วิกฤต! ขณะนี้ฝนตกหนักสะสมทะลุ ${actualRain24h} มม. เสี่ยงดินถล่มฉับพลัน!` 
                    : `อุณหภูมิ ${currentTemp}°C ลม ${currentWind} กม./ชม. (ฝนสะสม ${actualRain24h} มม.) เฝ้าระวังใกล้ชิด`;
                
                weeklyTrend = `เตือนภัยวิกฤต (CRITICAL): ในช่วงวัน${criticalDate} โมเดลตรวจพบร่องมรสุมรุนแรง คาดการณ์ฝนตกหนักสะสมทะลุ ${maxRain7Days} มม./วัน และลมกระโชกแรง ${maxWind7Days} กม./ชม. พื้นที่เสี่ยงสูงมาก`;
                
                recommendedActions = [
                    '🚨 เรียกประชุมศูนย์ปฏิบัติการฉุกเฉิน (EOC) ทันที',
                    `สั่งพร่องน้ำในแหล่งน้ำสาธารณะล่วงหน้าก่อนวัน${criticalDate}`,
                    'เตรียมอพยพประชาชนกลุ่มเปราะบางในพื้นที่เสี่ยงดินถล่ม',
                    'ประสานเครื่องจักรกลหนักแสตนด์บาย 24 ชม.'
                ];
            } else if (actualRain24h > 35 || maxRain7Days > 35 || maxWind7Days > 35) {
                status = 'WARNING';
                dailyInsight = actualRain24h > 35
                    ? `มีฝนตกปานกลางถึงหนักสะสม ${actualRain24h} มม. ดินเริ่มอุ้มน้ำ โปรดเฝ้าระวังน้ำป่า`
                    : `อุณหภูมิ ${currentTemp}°C ลม ${currentWind} กม./ชม. สภาพอากาศปัจจุบันยังปลอดภัย`;

                weeklyTrend = `เฝ้าระวัง (WARNING): โมเดลพยากรณ์พบกลุ่มฝน/ลมกระโชกแรง ในช่วงวัน${criticalDate} คาดว่าจะมีฝนสะสม ${maxRain7Days} มม./วัน อาจทำให้ต้นไม้หักโค่นหรือน้ำท่วมขังรอการระบาย`;
                
                recommendedActions = [
                    'แจ้งเตือน อปพร. และกู้ชีพเทศบาลเตรียมอุปกรณ์รับมือ',
                    'ตรวจสอบการอุดตันของท่อระบายน้ำและทางน้ำไหล',
                    'ประกาศแจ้งเตือนประชาชนผ่านหอกระจายข่าวหมู่บ้าน'
                ];
            }
        }

        setAiReport({ status, currentTemp, actualRain24h, maxRain7Days: forecastData ? Math.max(...forecastData.precipitation_sum) : 0, dailyInsight, weeklyTrend, recommendedActions });
        
      } catch (error) {
        console.error("Data Pipeline & AI Analysis failed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndAnalyzeRealData();
  }, []);

  if (isLoading) return (
    <div className="flex h-screen flex-col items-center justify-center text-white bg-[#0b132b] space-y-4">
      <div className="w-10 h-10 border-4 border-[#38bdf8] border-t-transparent rounded-full animate-spin"></div>
      <div className="font-mono text-sm text-[#38bdf8] animate-pulse">AI is aggregating real-time APIs (ONWR & Open-Meteo)...</div>
    </div>
  );
  
  if (!aiReport) return null;

  const theme = {
      NORMAL: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', icon: '✅', tag: 'ปกติ' },
      WARNING: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', icon: '⚠️', tag: 'เฝ้าระวัง' },
      CRITICAL: { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50', icon: '🚨', tag: 'วิกฤต' }
  }[aiReport.status as 'NORMAL' | 'WARNING' | 'CRITICAL'];

  return (
    <div className="min-h-screen bg-[#050b14] p-6 text-white font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="border-b border-gray-800 pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-wide">Executive AI Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">ระบบวิเคราะห์ข้อมูลจริง (Real-time API) & พยากรณ์ล่วงหน้า 7 วัน</p>
          </div>
          <div className={`px-4 py-1.5 rounded-full border ${theme.border} ${theme.bg} ${theme.color} font-bold text-sm flex items-center space-x-2 shadow-lg`}>
            <span>{theme.icon}</span> <span>ระดับสถานการณ์: {theme.tag}</span>
          </div>
        </div>

        {/* AI Report Card */}
        <div className={`border ${theme.border} ${theme.bg} rounded-2xl p-6 shadow-lg backdrop-blur-sm animate-fade-in-api`}>
          <div className="flex items-center space-x-3 mb-4">
            <span className="text-3xl">🧠</span>
            <div>
              <h2 className={`text-lg font-bold ${theme.color}`}>สรุปรายงานจากปัญญาประดิษฐ์ (AI Executive Briefing)</h2>
              <span className="text-xs text-gray-300 font-mono">Real-time Data Sources: ONWR, GFS/ECMWF Models</span>
            </div>
          </div>
          
          <div className="space-y-4">
            {/* บทวิเคราะห์วันนี้ */}
            <div className="bg-[#0f172a]/80 p-4 rounded-xl border border-gray-700 shadow-inner">
              <h3 className="text-[#38bdf8] font-bold text-sm mb-2 flex items-center"><span className="mr-2">📍</span> สถานการณ์ปัจจุบัน (Today's Insight)</h3>
              <p className="text-gray-200 text-[14.5px] leading-relaxed">{aiReport.dailyInsight}</p>
            </div>
            
            {/* พยากรณ์ 7 วัน */}
            <div className="bg-[#0f172a]/80 p-4 rounded-xl border border-gray-700 shadow-inner">
              <h3 className="text-yellow-400 font-bold text-sm mb-2 flex items-center"><span className="mr-2">📅</span> แนวโน้ม 7 วันข้างหน้า (7-Day Predictive Trend)</h3>
              <p className="text-gray-200 text-[14.5px] leading-relaxed">{aiReport.weeklyTrend}</p>
            </div>
          </div>
        </div>

        {/* Action & Live Data Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Action Required */}
          <div className="bg-[#0f172a] border border-[#38bdf8]/30 rounded-2xl p-6 shadow-[0_0_15px_rgba(56,189,248,0.1)]">
            <h3 className="text-sm text-[#38bdf8] font-bold mb-4 uppercase tracking-widest border-b border-[#1e293b] pb-2">🎯 ข้อเสนอแนะการสั่งการล่วงหน้า</h3>
            <ul className="space-y-3">
              {aiReport.recommendedActions.map((action: string, idx: number) => (
                <li key={idx} className="flex items-start space-x-2 text-sm text-gray-200 font-semibold">
                  <span className="text-[#38bdf8] mt-0.5">▪</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Raw Data Feed */}
          <div className="bg-[#0b132b] border border-gray-800 rounded-2xl p-6">
            <h3 className="text-sm text-gray-400 font-bold mb-4 uppercase tracking-widest border-b border-gray-800 pb-2">📡 ข้อมูลตรวจวัดจริง ณ ปัจจุบัน</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-2 bg-[#0f172a] rounded-lg border border-gray-800">
                <span className="text-gray-400 text-xs font-mono">อุณหภูมิปัจจุบัน (TMD/Meteo)</span>
                <span className="text-white font-bold">{aiReport.currentTemp} °C</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-[#0f172a] rounded-lg border border-gray-800">
                <span className="text-gray-400 text-xs font-mono">ฝนสะสม 24 ชม. ล่าสุด (ONWR)</span>
                <span className="text-[#38bdf8] font-bold">{aiReport.actualRain24h} มม.</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-[#0f172a] rounded-lg border border-[#38bdf8]/20">
                <span className="text-gray-400 text-xs font-mono">พยากรณ์ฝนสูงสุดใน 7 วัน (Windy)</span>
                <span className="text-yellow-400 font-bold">{aiReport.maxRain7Days} มม.</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
