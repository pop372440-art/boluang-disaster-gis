'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';

// ==========================================
// 🌟 1. ตั้งค่าพิกัด & ฟังก์ชันแปลงข้อมูล
// ==========================================
const LAT = 18.1633;
const LNG = 98.3744;

const getWmoWeatherDesc = (code: number) => {
  const codes: Record<number, string> = { 0: 'แจ่มใส', 1: 'มีเมฆบางส่วน', 2: 'มีเมฆครึ้ม', 3: 'เมฆเป็นส่วนมาก', 45: 'มีหมอก', 48: 'หมอกหนา', 51: 'ฝนปรอยๆ', 61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง', 65: 'ฝนตกหนัก', 80: 'ฝนเป็นหย่อมๆ', 95: 'พายุฝนฟ้าคะนอง' };
  return codes[code] || 'ปกติ';
};

const getWeatherEmoji = (code: number) => {
  if (code === 0) return '☀️'; if (code === 1 || code === 2) return '🌤️'; if (code === 3) return '☁️'; if (code >= 45 && code <= 48) return '🌫️'; if (code >= 51 && code <= 67) return '🌧️'; if (code >= 80 && code <= 82) return '🌦️'; if (code >= 95) return '⛈️'; return '☀️';
};

const getAqiStatus = (aqi: number) => {
  if (aqi <= 50) return { text: 'ดีมาก', color: '#10b981', bg: 'bg-emerald-500/20' };
  if (aqi <= 100) return { text: 'ปานกลาง', color: '#facc15', bg: 'bg-yellow-500/20' };
  if (aqi <= 150) return { text: 'เริ่มมีผลกระทบ', color: '#f97316', bg: 'bg-orange-500/20' };
  return { text: 'มีผลกระทบ', color: '#ef4444', bg: 'bg-red-500/20' };
};

// ==========================================
// 🚀 2. MAIN COMPONENT
// ==========================================
export default function WeatherDashboard() {
  const [loading, setLoading] = useState(true);
  const [currentWeather, setCurrentWeather] = useState<any>(null);
  const [currentAqi, setCurrentAqi] = useState<any>(null);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [windyLayer, setWindyLayer] = useState('rain');

  useEffect(() => {
    fetchWeatherData();
  }, []);

  const fetchWeatherData = async () => {
    setLoading(true);
    try {
      // 1. ดึงข้อมูลสภาพอากาศ (ปัจจุบัน + ล่วงหน้า 7 วัน)
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&daily=time,weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max&timezone=Asia%2FBangkok`;
      
      // 2. ดึงข้อมูลคุณภาพอากาศ (AQI & PM2.5)
      const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LNG}&current=pm2_5,us_aqi&timezone=Asia%2FBangkok`;

      const [wxRes, aqiRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl)]);
      const wxData = await wxRes.json();
      const aqiData = await aqiRes.json();

      // เซ็ตข้อมูลปัจจุบัน
      setCurrentWeather(wxData.current);
      setCurrentAqi(aqiData.current);

      // จัดรูปข้อมูลพยากรณ์ 7 วัน สำหรับ Recharts
      const daily = wxData.daily;
      const formattedForecast = daily.time.map((dateStr: string, index: number) => {
        const dateObj = new Date(dateStr);
        const days = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
        const dayName = index === 0 ? 'วันนี้' : days[dateObj.getDay()];
        
        return {
          day: dayName,
          fullDate: dateStr,
          maxTemp: daily.temperature_2m_max[index],
          minTemp: daily.temperature_2m_min[index],
          rain: daily.precipitation_sum[index],
          uv: daily.uv_index_max[index],
          code: daily.weather_code[index]
        };
      });

      setForecastData(formattedForecast);
    } catch (error) {
      console.error('Failed to fetch weather data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b132b] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#0ea5e9] border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-[#0ea5e9] font-mono tracking-widest animate-pulse">CONNECTING TO SATELLITES...</div>
      </div>
    );
  }

  const aqiStatus = getAqiStatus(currentAqi?.us_aqi || 0);

  return (
    <div className="min-h-screen bg-[#0b132b] text-white font-sans selection:bg-[#0ea5e9] selection:text-white pb-10">
      
      {/* 🚀 Header */}
      <header className="bg-[#0f172a]/90 backdrop-blur-xl border-b border-[#1e293b] px-4 md:px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center space-x-3 md:space-x-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-[#38bdf8] to-[#0284c7] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.4)]">
            <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <div>
            <h1 className="text-[16px] md:text-[20px] font-extrabold text-white leading-tight tracking-wide">ระบบตรวจสอบสภาพอากาศ</h1>
            <p className="text-[11px] md:text-[13px] text-[#38bdf8] font-bold mt-0.5">Bo Luang Weather Center</p>
          </div>
        </div>
        <Link href="/" className="flex items-center space-x-2 bg-[#1e293b] hover:bg-[#334155] border border-gray-700 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm">
          <span>⬅️</span> <span className="hidden md:inline">กลับหน้าแผนที่หลัก</span>
        </Link>
      </header>

      <main className="p-4 md:p-6 max-w-[1400px] mx-auto mt-2">
        
        {/* 🍱 Bento Box Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">

          {/* 📦 กล่อง 1: สภาพอากาศปัจจุบัน (Hero Card) */}
          <div className="col-span-1 md:col-span-1 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 rounded-3xl border border-[#334155] shadow-lg relative overflow-hidden flex flex-col justify-center items-center text-center group hover:border-[#38bdf8]/50 transition-colors">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-[#38bdf8] rounded-full blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
            
            <span className="text-6xl drop-shadow-lg mb-2 transform group-hover:scale-110 transition-transform">
              {getWeatherEmoji(currentWeather?.weather_code)}
            </span>
            <div className="text-5xl font-extrabold text-white mb-1">
              {currentWeather?.temperature_2m.toFixed(1)}°<span className="text-2xl text-gray-400">C</span>
            </div>
            <p className="text-[#38bdf8] font-bold text-lg">{getWmoWeatherDesc(currentWeather?.weather_code)}</p>
            <p className="text-xs text-gray-400 mt-2 font-mono">อัปเดตล่าสุด: {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</p>
          </div>

          {/* 📦 กล่อง 2: คุณภาพอากาศ (AQI) */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-between hover:border-[#38bdf8]/30 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-2 text-gray-400 font-bold text-sm tracking-widest">
                <span>🌫️</span> <span>AIR QUALITY (AQI)</span>
              </div>
              <div className={`px-2 py-1 rounded-md text-[10px] font-bold ${aqiStatus.bg}`} style={{ color: aqiStatus.color }}>
                {aqiStatus.text}
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-4xl font-extrabold" style={{ color: aqiStatus.color }}>{currentAqi?.us_aqi}</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">US AQI Standard</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-white">{currentAqi?.pm2_5.toFixed(1)} <span className="text-xs text-gray-400">µg/m³</span></div>
                <div className="text-[10px] text-gray-500 mt-1">PM 2.5</div>
              </div>
            </div>
          </div>

          {/* 📦 กล่อง 3: ลมและความชื้น */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center space-y-6 hover:border-[#38bdf8]/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center"><span className="text-blue-400 text-lg">💨</span></div>
                <div>
                  <div className="text-xs text-gray-400 font-bold">ความเร็วลม</div>
                  <div className="text-xl font-extrabold text-white">{(currentWeather?.wind_speed_10m / 3.6).toFixed(1)} <span className="text-xs font-normal text-gray-500">ม./วินาที</span></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-cyan-500/10 rounded-full flex items-center justify-center"><span className="text-cyan-400 text-lg">💧</span></div>
                <div>
                  <div className="text-xs text-gray-400 font-bold">ความชื้นสัมพัทธ์</div>
                  <div className="text-xl font-extrabold text-white">{currentWeather?.relative_humidity_2m}<span className="text-xs font-normal text-gray-500">%</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* 📦 กล่อง 4: ข้อมูลฝนตกและ UV */}
          <div className="col-span-1 bg-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col justify-center space-y-6 hover:border-[#38bdf8]/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-indigo-500/10 rounded-full flex items-center justify-center"><span className="text-indigo-400 text-lg">🌧️</span></div>
                <div>
                  <div className="text-xs text-gray-400 font-bold">ปริมาณฝน (วันนี้)</div>
                  <div className="text-xl font-extrabold text-white">{forecastData[0]?.rain.toFixed(1)} <span className="text-xs font-normal text-gray-500">มม.</span></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-500/10 rounded-full flex items-center justify-center"><span className="text-purple-400 text-lg">☀️</span></div>
                <div>
                  <div className="text-xs text-gray-400 font-bold">UV Index (สูงสุด)</div>
                  <div className="text-xl font-extrabold text-white">{forecastData[0]?.uv} <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded ml-1">Index</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* 📦 กล่อง 5: กราฟพยากรณ์อุณหภูมิ 7 วัน (Area Chart) - กินพื้นที่ 2 คอลัมน์ */}
          <div className="col-span-1 md:col-span-2 bg-[#0f172a] p-5 md:p-6 rounded-3xl border border-[#334155] shadow-lg h-[350px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-lg mr-2">📈</span>
              <h3 className="text-white text-sm md:text-base font-bold">พยากรณ์อุณหภูมิ 7 วันล่วงหน้า (°C)</h3>
            </div>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f87171" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                    itemStyle={{ fontWeight: 'bold' }}
                  />
                  <Area type="monotone" name="อุณหภูมิสูงสุด" dataKey="maxTemp" stroke="#f87171" strokeWidth={3} fillOpacity={1} fill="url(#colorMax)" />
                  <Area type="monotone" name="อุณหภูมิต่ำสุด" dataKey="minTemp" stroke="#38bdf8" strokeWidth={3} fillOpacity={1} fill="url(#colorMin)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📦 กล่อง 6: กราฟพยากรณ์ปริมาณฝน 7 วัน (Bar Chart) - กินพื้นที่ 2 คอลัมน์ */}
          <div className="col-span-1 md:col-span-2 bg-[#0f172a] p-5 md:p-6 rounded-3xl border border-[#334155] shadow-lg h-[350px] flex flex-col">
            <div className="flex items-center mb-4">
              <span className="text-lg mr-2">🌧️</span>
              <h3 className="text-white text-sm md:text-base font-bold">พยากรณ์ปริมาณน้ำฝน 7 วัน (มม.)</h3>
            </div>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{ fill: '#1e293b', opacity: 0.5 }}
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#0ea5e9', borderRadius: '12px', color: '#fff' }}
                  />
                  <Bar name="ปริมาณฝนสะสม" dataKey="rain" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📦 กล่อง 7: แผนที่ Windy Interactive (เต็มจอความกว้าง) */}
          <div className="col-span-1 md:col-span-4 bg-[#0f172a] p-2 rounded-3xl border border-[#334155] shadow-lg flex flex-col overflow-hidden h-[500px] relative group">
            
            {/* Control Panel ลอยทับ Windy Map */}
            <div className="absolute top-4 left-4 z-10 bg-[#0b132b]/80 backdrop-blur-md border border-[#1e293b] p-2 rounded-2xl flex space-x-2 shadow-lg">
              <button 
                onClick={() => setWindyLayer('rain')}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${windyLayer === 'rain' ? 'bg-[#0ea5e9] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                🌧️ กลุ่มฝน
              </button>
              <button 
                onClick={() => setWindyLayer('wind')}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${windyLayer === 'wind' ? 'bg-[#facc15] text-black' : 'text-gray-400 hover:text-white'}`}
              >
                💨 กระแสลม
              </button>
              <button 
                onClick={() => setWindyLayer('temp')}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${windyLayer === 'temp' ? 'bg-[#ef4444] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                🌡️ อุณหภูมิ
              </button>
            </div>

            <iframe 
              width="100%" 
              height="100%" 
              frameBorder="0" 
              className="rounded-2xl"
              src={`https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km/h&zoom=10&overlay=${windyLayer}&product=ecmwf&level=surface&lat=${LAT}&lon=${LNG}&detailLat=${LAT}&detailLon=${LNG}&marker=true`}
            ></iframe>
          </div>

        </div>
      </main>
    </div>
  );
}
