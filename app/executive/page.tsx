'use client';
import React, { useState, useEffect } from 'react';

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
            const forecastJson = await forecastRes.value.json();
            forecast = forecastJson;
        }

        if (forecast) {
            const maxRain7Days = Math.max(...forecast.daily.precipitation_sum);
            const maxWind7Days = Math.max(...forecast.daily.windspeed_10m_max);
            
            let status = 'NORMAL';
            let summary = 'สภาพอากาศอยู่ในเกณฑ์ปกติ';
            let actions = ['ติดตามสถานการณ์ตามปกติ', 'ตรวจสอบความพร้อมอุปกรณ์สื่อสาร'];

            if (actualRain24h > 90 || maxRain7Days > 90) {
                status = 'CRITICAL';
                summary = 'พายุเข้า/ฝนตกหนัก เสี่ยงดินถล่มและน้ำป่าไหลหลากฉับพลัน';
                actions = ['🚨 ประกาศอพยพพื้นที่เสี่ยง', 'สั่งพร่องน้ำในแหล่งน้ำสาธารณะด่วน', 'เปิดศูนย์ EOC ตลอด 24 ชม.'];
            } else if (actualRain24h > 35 || maxRain7Days > 35) {
                status = 'WARNING';
                summary = 'ฝนตกปานกลางถึงหนัก เฝ้าระวังน้ำท่วมขังและต้นไม้ล้ม';
                actions = ['แจ้งเตือนประชาชนผ่านหอกระจายข่าว', 'จัดเตรียมเครื่องสูบน้ำในจุดเสี่ยง'];
            }

            setData({
                actualRain24h,
                current: forecast.current,
                daily: forecast.daily,
                ai: { status, summary, actions, maxRain7Days, maxWind7Days }
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
    <div className="flex h-screen items-center justify-center bg-[#121418] text-white">
        <div className="animate-pulse flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-[#38bdf8] border-t-transparent rounded-full animate-spin mb-4"></div>
            <span className="font-mono text-gray-400">Loading AI Dashboard...</span>
        </div>
    </div>
  );

  if (!data) return null;

  const getTheme = (status: string) => {
      if (status === 'CRITICAL') return { bg: 'bg-[#ef4444]', text: 'text-[#ef4444]', icon: '🚨', label: 'CRITICAL (วิกฤต)' };
      if (status === 'WARNING') return { bg: 'bg-[#facc15]', text: 'text-[#facc15]', icon: '⚠️', label: 'WARNING (เฝ้าระวัง)' };
      return { bg: 'bg-[#38bdf8]', text: 'text-[#38bdf8]', icon: '✅', label: 'NORMAL (ปกติ)' };
  };

  const theme = getTheme(data.ai.status);

  return (
    <div className="min-h-screen bg-[#121418] p-4 md:p-8 font-sans text-white">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">EXECUTIVE <span className={theme.text}>DASHBOARD</span></h1>
            <p className="text-gray-400 mt-2 text-sm md:text-base">ระบบวิเคราะห์ข้อมูลสภาพอากาศและสนับสนุนการตัดสินใจด้วย AI</p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            
            {/* Widget 1: Main AI Status (Spans 2 cols) */}
            <div className="md:col-span-2 lg:col-span-2 bg-[#1c1f26] rounded-3xl p-6 md:p-8 relative overflow-hidden flex flex-col justify-between shadow-xl border border-gray-800">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-white/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
                
                <div className="flex justify-between items-start mb-6 z-10">
                    <div>
                        <div className="flex items-center space-x-2 mb-2">
                            <span className="text-2xl">{theme.icon}</span>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold bg-[#121418] ${theme.text} uppercase tracking-wider`}>
                                {theme.label}
                            </span>
                        </div>
                        <h2 className="text-5xl md:text-6xl font-bold mt-2">{Math.round(data.current.temperature_2m)}°</h2>
                        <p className="text-gray-400 mt-2 text-lg">ลม {data.current.windspeed_10m} km/h</p>
                    </div>
                </div>

                <div className="z-10 bg-[#121418]/80 p-5 rounded-2xl border border-gray-700/50 backdrop-blur-md">
                    <h3 className="text-sm font-bold text-gray-300 mb-1 uppercase tracking-widest">AI Assessment</h3>
                    <p className="text-base md:text-lg font-medium text-white leading-relaxed">
                        {data.ai.summary}
                    </p>
                </div>
            </div>

            {/* Widget 2: 7-Day Precipitation Bar Chart (Spans 2 cols) */}
            <div className="md:col-span-2 lg:col-span-2 bg-[#1c1f26] rounded-3xl p-6 md:p-8 shadow-xl border border-gray-800 flex flex-col">
                <div className="flex justify-between items-end mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-white">พยากรณ์ฝน 7 วัน</h3>
                        <p className="text-xs text-gray-400 mt-1">ปริมาณฝนสะสมรายวัน (มม.)</p>
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-bold text-[#38bdf8]">{data.ai.maxRain7Days.toFixed(1)}</span>
                        <span className="text-xs text-gray-400 block">สูงสุดในสัปดาห์</span>
                    </div>
                </div>
                
                {/* CSS Bar Chart */}
                <div className="flex-1 flex items-end justify-between space-x-2 h-32 mt-auto">
                    {data.daily.precipitation_sum.map((rain: number, idx: number) => {
                        const date = new Date(data.daily.time[idx]);
                        const dayName = date.toLocaleDateString('th-TH', { weekday: 'short' });
                        // คำนวณความสูงของกราฟ (Max 100%)
                        const heightPct = data.ai.maxRain7Days > 0 ? (rain / data.ai.maxRain7Days) * 100 : 5;
                        const barColor = rain > 50 ? 'bg-[#ef4444]' : (rain > 20 ? 'bg-[#facc15]' : 'bg-[#0ea5e9]');

                        return (
                            <div key={idx} className="flex flex-col items-center flex-1 group">
                                <div className="text-[10px] text-gray-400 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">{rain}</div>
                                <div className={`w-full max-w-[24px] rounded-t-md ${barColor} transition-all duration-500`} style={{ height: `${Math.max(heightPct, 5)}%` }}></div>
                                <div className="text-xs text-gray-500 mt-3 font-medium">{dayName}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Widget 3: Real ONWR Data */}
            <div className="bg-[#1c1f26] rounded-3xl p-6 shadow-xl border border-gray-800 flex flex-col justify-between">
                <div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">ฝนสะสม (ONWR)</h3>
                    <p className="text-xs text-gray-500">ข้อมูลจริงย้อนหลัง 24 ชม.</p>
                </div>
                <div className="mt-4">
                    <span className="text-4xl font-bold text-[#4ade80]">{data.actualRain24h}</span>
                    <span className="text-sm text-gray-400 ml-1">มม.</span>
                </div>
                <div className="w-full bg-gray-800 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div className="bg-[#4ade80] h-full" style={{ width: `${Math.min((data.actualRain24h / 100) * 100, 100)}%` }}></div>
                </div>
            </div>

            {/* Widget 4: Max Wind Forecast */}
            <div className="bg-[#1c1f26] rounded-3xl p-6 shadow-xl border border-gray-800 flex flex-col justify-between">
                <div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">ลมกระโชกแรง</h3>
                    <p className="text-xs text-gray-500">พยากรณ์สูงสุดสัปดาห์นี้</p>
                </div>
                <div className="mt-4">
                    <span className="text-4xl font-bold text-[#a855f7]">{data.ai.maxWind7Days}</span>
                    <span className="text-sm text-gray-400 ml-1">km/h</span>
                </div>
                <div className="w-full bg-gray-800 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div className="bg-[#a855f7] h-full" style={{ width: `${Math.min((data.ai.maxWind7Days / 100) * 100, 100)}%` }}></div>
                </div>
            </div>

            {/* Widget 5: Executive Actions Checklist (Spans 2 cols) */}
            <div className="md:col-span-2 bg-[#1c1f26] rounded-3xl p-6 shadow-xl border border-gray-800">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">ข้อเสนอแนะการสั่งการ (Recommended Actions)</h3>
                <ul className="space-y-3">
                    {data.ai.actions.map((action: string, idx: number) => (
                        <li key={idx} className="flex items-center p-3 rounded-xl bg-[#121418] border border-gray-800/50">
                            <div className={`w-2 h-2 rounded-full ${theme.bg} mr-3`}></div>
                            <span className="text-sm md:text-base text-gray-200">{action}</span>
                        </li>
                    ))}
                </ul>
            </div>

        </div>
      </div>
    </div>
  );
}
