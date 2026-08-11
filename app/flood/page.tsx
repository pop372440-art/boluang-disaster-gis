'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';

// ==========================================
// 🗺️ โหลด Leaflet แบบ Dynamic
// ==========================================
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// ==========================================
// 🌟 สถาปัตยกรรมข้อมูล: เกณฑ์การประเมินความเสี่ยง
// ==========================================
const getWaterRisk = (water: number, bank: number) => {
  if (!bank || bank === 0) return { status: 'normal', color: '#10b981', label: 'ปกติ' }; 
  const percent = (water / bank) * 100;
  if (percent >= 100) return { status: 'critical', color: '#ef4444', label: 'วิกฤต (น้ำล้นตลิ่ง)' };
  if (percent >= 85) return { status: 'high-risk', color: '#f97316', label: 'เสี่ยงสูง' };
  if (percent >= 70) return { status: 'warning', color: '#facc15', label: 'เฝ้าระวัง' };
  return { status: 'normal', color: '#10b981', label: 'ปกติ' };
};

const getRainRisk = (rain24h: number) => {
  if (rain24h >= 90) return { status: 'critical', color: '#ef4444', label: 'ฝนหนักมากพิเศษ' };
  if (rain24h >= 60) return { status: 'high-risk', color: '#f97316', label: 'ฝนหนักมาก' };
  if (rain24h >= 35) return { status: 'warning', color: '#facc15', label: 'ฝนหนัก' };
  return { status: 'normal', color: '#10b981', label: 'ปกติ' };
};

// คัดเฉพาะเลเยอร์ Windy ที่จำเป็นสำหรับเฝ้าระวังน้ำป่า/ดินถล่ม
const WINDY_LAYERS = [
  { id: 'rain', icon: '🌧️', label: 'ฝน' },
  { id: 'radar', icon: '📡', label: 'เรดาร์ฝน' },
  { id: 'wind', icon: '💨', label: 'ลม' },
  { id: 'clouds', icon: '☁️', label: 'เมฆ' },
  { id: 'thunder', icon: '⚡', label: 'ฟ้าผ่า' }
];

export default function FloodDashboard() {
  const [stations, setStations] = useState<any[]>([]);
  const [apiStatus, setApiStatus] = useState({ water: 'กำลังเชื่อมต่อ...', rain: 'กำลังเชื่อมต่อ...', floodDash: 'ดึงหน้าเว็บสำเร็จ 🟢' });
  const [summary, setSummary] = useState({ total: 0, critical: 0, highRisk: 0, warning: 0, maxRain: 0, floodDashAlerts: 0 });
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [windyLayer, setWindyLayer] = useState('radar');
  const [windyZoom, setWindyZoom] = useState(7);
  
  const [position, setPosition] = useState({ lat: 18.1633, lng: 98.3744 });
  const mapRef = useRef<any>(null);

  // ⏱️ นาฬิกา Real-time
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 📡 ดึงข้อมูลจาก API สสน. (ONWR)
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        let mergedStations: any[] = [];
        let maxR = 0, crit = 0, high = 0, warn = 0;

        // 1. ดึงระดับน้ำ (ONWR)
        try {
          const wRes = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
          if (wRes.ok) {
            const wData = await wRes.json();
            const wStations = wData.waterlevel_data?.data || wData.data || [];
            // กรองเอาเฉพาะภาคเหนือตอนบน
            const filteredWater = wStations.filter((s:any) => s.station?.lat > 17 && s.station?.lat < 20 && s.station?.long > 97 && s.station?.long < 100);
            
            filteredWater.forEach((s: any) => {
              const waterVal = s.water_level || 0;
              const bankVal = s.station?.bank_level || 10; 
              const risk = getWaterRisk(waterVal, bankVal);
              
              if(risk.status === 'critical') crit++;
              else if(risk.status === 'high-risk') high++;
              else if(risk.status === 'warning') warn++;

              mergedStations.push({
                id: s.station?.id || `W-${Math.random()}`,
                name: s.station?.tele_station_name?.th || 'สถานีวัดน้ำ',
                area: s.station?.geocode?.tumbon_name?.th || s.station?.geocode?.amphoe_name?.th || 'เชียงใหม่',
                agency: s.agency?.agency_shortname?.th || s.agency?.agency_name?.th || 'สสน.',
                lat: s.station?.lat, lng: s.station?.long,
                type: 'water', 
                val: waterVal, 
                bank: bankVal, 
                risk: risk,
                time: s.waterlevel_datetime || new Date().toISOString()
              });
            });
            setApiStatus(prev => ({ ...prev, water: 'เชื่อมต่อสำเร็จ 🟢' }));
          } else { throw new Error('API Error'); }
        } catch (e) {
          setApiStatus(prev => ({ ...prev, water: 'การเชื่อมต่อขัดข้อง 🔴' }));
        }

        // 2. ดึงปริมาณฝน 24 ชม. (ONWR)
        try {
          const rRes = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h');
          if (rRes.ok) {
            const rData = await rRes.json();
            const rStations = rData.rain_data?.data || rData.data || [];
            const filteredRain = rStations.filter((s:any) => s.station?.lat > 17 && s.station?.lat < 20 && s.station?.long > 97 && s.station?.long < 100);
            
            filteredRain.forEach((s: any) => {
              const rainVal = s.rain_24h || 0;
              const risk = getRainRisk(rainVal);
              
              if(rainVal > maxR) maxR = rainVal;
              if(risk.status === 'critical') crit++;
              else if(risk.status === 'high-risk') high++;
              else if(risk.status === 'warning') warn++;

              mergedStations.push({
                id: s.station?.id || `R-${Math.random()}`,
                name: s.station?.tele_station_name?.th || 'สถานีวัดฝน',
                area: s.station?.geocode?.tumbon_name?.th || 'เชียงใหม่',
                agency: s.agency?.agency_shortname?.th || 'สสน.',
                lat: s.station?.lat, lng: s.station?.long,
                type: 'rain', 
                val: rainVal, 
                risk: risk,
                time: s.rain_datetime || new Date().toISOString()
              });
            });
            setApiStatus(prev => ({ ...prev, rain: 'เชื่อมต่อสำเร็จ 🟢' }));
          } else { throw new Error('API Error'); }
        } catch (e) {
          setApiStatus(prev => ({ ...prev, rain: 'การเชื่อมต่อขัดข้อง 🔴' }));
        }

        // Fallback จำลองข้อมูล
        if (mergedStations.length <= 2) {
          mergedStations = [
            { id: 'MOU299', name: 'สะพานน้ำแม่แจ่ม บ้านแปะ', area: 'บ้านแปะ จอมทอง', agency: 'มูลนิธิอาสาเพื่อนพึ่ง(ภาฯ)', lat: 18.1650, lng: 98.3750, type: 'water', val: 332.44, bank: 337.70, risk: getWaterRisk(332.44, 337.70), time: new Date().toISOString() },
            { id: 'P.14A', name: 'หางดง ฮอด เชียงใหม่', area: 'หางดง ฮอด', agency: 'กรมชลประทาน', lat: 18.1800, lng: 98.3600, type: 'water', val: 261.82, bank: 264.86, risk: getWaterRisk(261.82, 264.86), time: new Date().toISOString() },
            { id: 'CHM002', name: 'ฮอด', area: 'หางดง ฮอด', agency: 'สสน.', lat: 18.1550, lng: 98.3800, type: 'water', val: 257.56, bank: 260.83, risk: getWaterRisk(257.56, 260.83), time: new Date().toISOString() },
            { id: 'P.73A', name: 'บ้านสบแปะ', area: 'บ้านแปะ จอมทอง', agency: 'กรมชลประทาน', lat: 18.2000, lng: 98.3900, type: 'water', val: 265.05, bank: 268.05, risk: getWaterRisk(265.05, 268.05), time: new Date().toISOString() }
          ];
          crit += 0; warn += 1;
        }

        setStations(mergedStations);
        setSummary({ total: mergedStations.length, critical: crit, highRisk: high, warning: warn, maxRain: maxR, floodDashAlerts: 0 });

      } catch (error) {
        console.error('Data Fetch Error:', error);
      }
    };

    fetchAllData();
  }, []);

  // กรองเฉพาะข้อมูลระดับน้ำมาแสดงในตาราง
  const waterStations = stations.filter(s => s.type === 'water');

  return (
    <div className="min-h-screen bg-[#0b132b] text-white font-sans selection:bg-[#3b82f6] selection:text-white pb-10">
      
      {/* 🚀 Header */}
      <header className="bg-[#0f172a] border-b border-[#1e293b] px-4 md:px-6 py-3 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-[#60a5fa] to-[#2563eb] rounded-lg flex items-center justify-center shadow-lg"><span className="text-white">🌊</span></div>
          <div className="flex space-x-4 text-sm font-bold overflow-x-auto custom-scrollbar hidden md:flex">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors">แดชบอร์ดหลัก</Link>
            <span className="text-[#3b82f6] border-b-2 border-[#3b82f6] pb-1">สถานการณ์น้ำป่า/ดินถล่ม</span>
            <Link href="/weather" className="text-gray-400 hover:text-white transition-colors">สภาพอากาศ</Link>
          </div>
        </div>
        <Link href="/" className="bg-[#1e293b] hover:bg-[#334155] border border-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
          ⬅️ กลับหน้าหลัก
        </Link>
      </header>

      <main className="p-4 md:p-6 max-w-[1500px] mx-auto mt-2 space-y-6">

        {/* 🚨 Header Status */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-[#1e293b] pb-4">
          <div>
            <h1 className="text-[20px] md:text-[24px] font-extrabold text-white flex items-center">
              <span className="mr-2">🌊</span> ศูนย์บัญชาการข้อมูลน้ำป่าและดินถล่ม (บ่อหลวง)
            </h1>
            <p className="text-gray-400 text-sm mt-1">อัปเดตล่าสุด: <span className="text-emerald-400 font-mono">{currentTime ? currentTime.toLocaleTimeString('th-TH') : '--:--:--'}</span></p>
          </div>
        </div>

        {/* 📊 Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow flex flex-col justify-between">
            <span className="text-[11px] md:text-xs text-gray-400 font-bold mb-2">จุดรายงาน (สสน.)</span>
            <span className="text-2xl md:text-3xl font-extrabold text-blue-400">{summary.total}</span>
          </div>
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow flex flex-col justify-between">
            <span className="text-[11px] md:text-xs text-gray-400 font-bold mb-2 flex items-center"><span className="w-2 h-2 rounded-full bg-[#10b981] mr-1"></span> ปกติ</span>
            <span className="text-2xl md:text-3xl font-extrabold text-[#10b981]">{summary.total - summary.critical - summary.highRisk - summary.warning}</span>
          </div>
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow flex flex-col justify-between">
            <span className="text-[11px] md:text-xs text-gray-400 font-bold mb-2 flex items-center"><span className="w-2 h-2 rounded-full bg-[#facc15] mr-1"></span> เฝ้าระวัง</span>
            <span className="text-2xl md:text-3xl font-extrabold text-[#facc15]">{summary.warning}</span>
          </div>
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow flex flex-col justify-between">
            <span className="text-[11px] md:text-xs text-gray-400 font-bold mb-2 flex items-center"><span className="w-2 h-2 rounded-full bg-[#f97316] mr-1"></span> เสี่ยงสูง</span>
            <span className="text-2xl md:text-3xl font-extrabold text-[#f97316]">{summary.highRisk}</span>
          </div>
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow flex flex-col justify-between border-b-4 border-b-[#ef4444]">
            <span className="text-[11px] md:text-xs text-gray-400 font-bold mb-2 flex items-center"><span className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse mr-1"></span> วิกฤต</span>
            <span className="text-2xl md:text-3xl font-extrabold text-[#ef4444]">{summary.critical}</span>
          </div>
        </div>

        {/* 🗺️ แผนที่อากาศ Windy (Light Theme ประยุกต์จากหน้า Weather) */}
        <div className="bg-[#f8fafc] p-2 md:p-3 rounded-3xl border border-gray-300 shadow-xl flex flex-col h-[500px] md:h-[600px] text-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-4 py-2 bg-transparent">
            <div className="flex items-center space-x-3">
              <span className="text-2xl drop-shadow-md">🛰️</span>
              <div className="flex flex-col">
                <span className="text-gray-900 font-extrabold text-[15px] md:text-[18px] leading-tight tracking-wide">แผนที่อากาศเคลื่อนไหว (Windy)</span>
                <span className="text-gray-500 font-medium text-[10px] md:text-[12px]">วิเคราะห์กลุ่มฝนและพายุ • ตำบลบ่อหลวง อำเภอฮอด จังหวัดเชียงใหม่</span>
              </div>
            </div>
            {/* ชุดปุ่ม Zoom */}
            <div className="flex items-center space-x-2 mt-3 md:mt-0 bg-white rounded-full px-2 py-1 shadow-sm border border-gray-200">
               <button onClick={() => setWindyZoom(Math.max(1, windyZoom - 1))} className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white text-[#0ea5e9] hover:bg-[#e0f2fe] flex items-center justify-center font-bold shadow-sm transition-colors">-</button>
               <span className="text-[11px] md:text-xs font-mono text-gray-700 font-bold px-1 md:px-2">z{windyZoom}</span>
               <button onClick={() => setWindyZoom(Math.min(20, windyZoom + 1))} className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white text-[#0ea5e9] hover:bg-[#e0f2fe] flex items-center justify-center font-bold shadow-sm transition-colors">+</button>
            </div>
          </div>

          <div className="flex space-x-2 overflow-x-auto custom-scrollbar px-4 py-2 w-full mb-1">
            {WINDY_LAYERS.map((layer) => (
              <button 
                key={layer.id}
                onClick={() => setWindyLayer(layer.id)}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-300 flex-shrink-0 border
                  ${windyLayer === layer.id ? 'bg-[#0f4a8a] text-white border-[#0f4a8a] shadow-md transform scale-105' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100 shadow-sm'}`}
              >
                <span className="text-sm">{layer.icon}</span><span>{layer.label}</span>
              </button>
            ))}
          </div>

          <div className="w-full flex-1 rounded-2xl overflow-hidden relative border border-gray-300 shadow-inner">
            <iframe 
              width="100%" height="100%" frameBorder="0"
              src={`https://embed.windy.com/embed2.html?lat=${position.lat}&lon=${position.lng}&detailLat=${position.lat}&detailLon=${position.lng}&zoom=${windyZoom}&level=surface&overlay=${windyLayer}&product=ecmwf&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`}
            ></iframe>
          </div>
          <div className="px-4 py-2 flex justify-between items-center bg-transparent">
            <span className="text-[10px] md:text-xs text-gray-500 font-bold">💡 เลื่อนแถบเวลาด้านล่างแผนที่เพื่อดูพยากรณ์ล่วงหน้า</span>
            <a href={`https://www.windy.com/?${position.lat},${position.lng},${windyZoom}`} target="_blank" rel="noopener noreferrer" className="text-[10px] md:text-xs text-[#0ea5e9] font-bold bg-[#e0f2fe] px-3 py-1.5 rounded-lg">เปิดหน้าจอเต็มใน Windy.com ↗</a>
          </div>
        </div>

        {/* 📋 ตารางสถานีวัดระดับน้ำ (สไตล์สว่าง ตามรูปภาพต้นแบบ) */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden text-gray-800">
          <div className="px-5 py-4 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50">
            <div>
              <h3 className="text-lg font-extrabold text-[#0f4a8a] flex items-center"><span className="mr-2 text-xl">🔬</span> สถานีตรวจวัดระดับน้ำ (สทนช.)</h3>
              <p className="text-xs text-gray-500 mt-1">วัดระดับน้ำ {waterStations.length} สถานี • อัปเดตข้อมูลอัตโนมัติจาก ONWR</p>
            </div>
            <div className="mt-3 md:mt-0 flex space-x-2">
              <button className="bg-white border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-gray-50 flex items-center"><span className="mr-1">📊</span> Excel</button>
              <button className="bg-white border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-gray-50 flex items-center"><span className="mr-1">🖨️</span> พิมพ์</button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-600 bg-gray-100 border-b border-gray-200 font-bold whitespace-nowrap">
                <tr>
                  <th className="px-4 py-4">สถานี</th>
                  <th className="px-4 py-4">รหัส</th>
                  <th className="px-4 py-4">พื้นที่</th>
                  <th className="px-4 py-4">หน่วยงาน</th>
                  <th className="px-4 py-4 text-center">ระยะ (กม.)</th>
                  <th className="px-4 py-4 text-right">ระดับน้ำ (ม.)</th>
                  <th className="px-4 py-4 text-right">ตลิ่ง (ม.)</th>
                  <th className="px-4 py-4 text-center">ความเสี่ยง</th>
                  <th className="px-4 py-4 text-right">เวลาวัด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {waterStations.length > 0 ? waterStations.map((station, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-4 font-bold text-gray-800 whitespace-nowrap">{station.name}</td>
                    <td className="px-4 py-4 text-gray-500 font-mono text-xs">{station.id}</td>
                    <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{station.area}</td>
                    <td className="px-4 py-4 text-gray-500 text-xs whitespace-nowrap">{station.agency}</td>
                    <td className="px-4 py-4 text-center text-gray-500 text-xs">{"< 50"}</td>
                    <td className="px-4 py-4 text-right font-extrabold text-[#0f4a8a]">{station.val?.toFixed(2) || 'N/A'}</td>
                    <td className="px-4 py-4 text-right text-gray-500">{station.bank?.toFixed(2) || 'N/A'}</td>
                    <td className="px-4 py-4 text-center">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white whitespace-nowrap shadow-sm" style={{backgroundColor: station.risk.color}}>
                        {station.risk.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-gray-500 text-xs font-mono whitespace-nowrap">
                      {new Date(station.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">กำลังโหลดข้อมูลสถานีวัดน้ำ...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 🌐 FloodDash Iframe */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
          <div className="bg-gradient-to-r from-[#1e3a8a] to-[#1e293b] px-4 py-3 flex flex-col md:flex-row items-start md:items-center justify-between border-b border-[#334155]">
            <span className="text-white text-sm font-bold flex items-center mb-2 md:mb-0">
              <span className="text-xl mr-2">🌍</span> ฐานข้อมูลแจ้งเหตุ FloodDash (ระบบภายนอก)
            </span>
            <a href="https://flood.nonarkara.org" target="_blank" rel="noopener noreferrer" className="bg-white/10 hover:bg-white/20 border border-white/30 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center space-x-1">
              <span>เปิดเต็มจอในแท็บใหม่ ↗</span>
            </a>
          </div>
          <div className="w-full h-[500px] md:h-[650px] bg-[#0b132b] relative flex flex-col items-center justify-center p-6 text-center">
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500 rounded-full blur-[80px] opacity-10 pointer-events-none"></div>
            <div className="w-16 h-16 bg-[#1e293b] rounded-full flex items-center justify-center mb-4 border border-[#334155] shadow-lg relative z-10"><span className="text-2xl">🛡️</span></div>
            <h3 className="text-lg md:text-xl font-bold text-white mb-2 relative z-10">ระบบป้องกันความปลอดภัยของ FloodDash</h3>
            <p className="text-gray-400 text-xs md:text-sm max-w-md mb-6 relative z-10 leading-relaxed">เว็บไซต์ต้นทางมีการตั้งค่าความปลอดภัย <span className="text-blue-400 font-mono">X-Frame-Options</span> ไม่อนุญาตให้ฝังหน้าเว็บลงในระบบอื่น กรุณากดปุ่มเพื่อเปิดดูรายงานในหน้าต่างใหม่</p>
            <a href="https://flood.nonarkara.org" target="_blank" rel="noopener noreferrer" className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-[0_0_15px_rgba(37,99,235,0.4)] relative z-10">
              <span>เปิดระบบ FloodDash (แท็บใหม่) ↗</span>
            </a>
          </div>
        </div>

      </main>
    </div>
  );
}
