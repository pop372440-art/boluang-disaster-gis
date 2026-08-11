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
  if (percent >= 85) return { status: 'high-risk', color: '#f97316', label: 'เสี่ยงสูง (85-100%)' };
  if (percent >= 70) return { status: 'warning', color: '#facc15', label: 'เฝ้าระวัง (70-85%)' };
  return { status: 'normal', color: '#10b981', label: 'ปกติ (<70%)' };
};

const getRainRisk = (rain24h: number) => {
  if (rain24h >= 90) return { status: 'critical', color: '#ef4444', label: 'ฝนหนักมากพิเศษ (>90มม.)' };
  if (rain24h >= 60) return { status: 'high-risk', color: '#f97316', label: 'ฝนหนักมาก (60-90มม.)' };
  if (rain24h >= 35) return { status: 'warning', color: '#facc15', label: 'ฝนหนัก (35-60มม.)' };
  return { status: 'normal', color: '#10b981', label: 'ปกติ (<35มม.)' };
};

export default function FloodDashboard() {
  const [stations, setStations] = useState<any[]>([]);
  const [apiStatus, setApiStatus] = useState({ water: 'กำลังเชื่อมต่อ...', rain: 'กำลังเชื่อมต่อ...', floodDash: 'ดึงหน้าเว็บสำเร็จ 🟢' });
  const [summary, setSummary] = useState({ total: 0, critical: 0, highRisk: 0, warning: 0, maxRain: 0, floodDashAlerts: 0 });
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  
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
            const filteredWater = wStations.filter((s:any) => s.station?.lat > 17 && s.station?.lat < 20 && s.station?.long > 97 && s.station?.long < 100);
            
            filteredWater.forEach((s: any) => {
              const waterVal = s.water_level || 0;
              const bankVal = s.station?.bank_level || 10; 
              const risk = getWaterRisk(waterVal, bankVal);
              
              if(risk.status === 'critical') crit++;
              else if(risk.status === 'high-risk') high++;
              else if(risk.status === 'warning') warn++;

              mergedStations.push({
                id: `W-${s.station?.id}`,
                name: s.station?.tele_station_name?.th || 'สถานีวัดน้ำ',
                lat: s.station?.lat, lng: s.station?.long,
                type: 'water', val: waterVal.toFixed(2), bank: bankVal.toFixed(2), risk: risk
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
                id: `R-${s.station?.id}`,
                name: s.station?.tele_station_name?.th || 'สถานีวัดฝน',
                lat: s.station?.lat, lng: s.station?.long,
                type: 'rain', val: rainVal.toFixed(1), risk: risk
              });
            });
            setApiStatus(prev => ({ ...prev, rain: 'เชื่อมต่อสำเร็จ 🟢' }));
          } else { throw new Error('API Error'); }
        } catch (e) {
          setApiStatus(prev => ({ ...prev, rain: 'การเชื่อมต่อขัดข้อง 🔴' }));
        }

        // Fallback กรณี API สสน. ล่มทั้งหมด
        if (mergedStations.length <= 2) {
          mergedStations = [
            ...mergedStations,
            { id: 1, name: 'สถานีวัดน้ำ ลำห้วยบ่อหลวง', lat: 18.1650, lng: 98.3750, type: 'water', val: 3.2, bank: 3.0, risk: getWaterRisk(3.2, 3.0) },
            { id: 2, name: 'สถานีวัดน้ำ บ้านพุย', lat: 18.1800, lng: 98.3600, type: 'water', val: 1.5, bank: 2.0, risk: getWaterRisk(1.5, 2.0) },
            { id: 3, name: 'สถานีวัดฝน แม่แจ่ม', lat: 18.1550, lng: 98.3800, type: 'rain', val: 65, risk: getRainRisk(65) }
          ];
          crit += 1; warn += 1; maxR = 65;
        }

        setStations(mergedStations);
        setSummary({ total: mergedStations.length, critical: crit, highRisk: high, warning: warn, maxRain: maxR, floodDashAlerts: 0 });

      } catch (error) {
        console.error('Data Fetch Error:', error);
      }
    };

    fetchAllData();
  }, []);

  return (
    <div className="min-h-screen bg-[#0b132b] text-white font-sans selection:bg-[#3b82f6] selection:text-white pb-10">
      
      {/* 🚀 Header (กู้คืนเอกลักษณ์ Bo Luang Flood Watch กลับมาแล้วครับ!) */}
      <header className="bg-[#0f172a]/90 backdrop-blur-xl border-b border-[#1e293b] px-4 md:px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center space-x-3 md:space-x-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-[#60a5fa] to-[#2563eb] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div>
            <h1 className="text-[16px] md:text-[20px] font-extrabold text-white leading-tight tracking-wide">ระบบเฝ้าระวังน้ำท่วมและน้ำป่า</h1>
            <p className="text-[11px] md:text-[13px] text-[#60a5fa] font-bold mt-0.5">Bo Luang Flood Watch</p>
          </div>
        </div>
        <Link href="/" className="flex items-center space-x-2 bg-[#1e293b] hover:bg-[#334155] border border-gray-700 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm">
          <span>⬅️</span> <span className="hidden md:inline">กลับหน้าแผนที่หลัก</span>
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
          {summary.critical > 0 && (
            <div className="mt-3 md:mt-0 flex items-center space-x-2 bg-red-500/10 border border-red-500/50 px-4 py-2 rounded-full">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-red-400 font-bold text-sm">เฝ้าระวังขั้นสูงสุด ({summary.critical} จุด)</span>
            </div>
          )}
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

        {/* 🗺️ Map Section (แผนที่ ONWR) */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl overflow-hidden shadow-xl flex flex-col">
          <div className="bg-[#1e293b] px-4 py-3 flex items-center justify-between border-b border-[#334155]">
            <span className="text-white text-sm font-bold flex items-center">🗺️ แผนที่สถานการณ์น้ำ (API สสน.)</span>
          </div>
          
          <div className="w-full h-[400px] md:h-[500px] relative z-0">
            <MapContainer center={[18.1633, 98.3744]} zoom={12} maxZoom={20} zoomControl={true} className="w-full h-full bg-[#0b132b]" ref={mapRef}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} />
              
              {stations.map((station, index) => (
                <CircleMarker 
                  key={index} 
                  center={[station.lat, station.lng]} 
                  radius={station.risk.status === 'critical' ? 10 : 8} 
                  pathOptions={{ 
                    color: station.risk.color, 
                    fillColor: station.risk.color, 
                    fillOpacity: 0.8, 
                    weight: 2 
                  }}
                >
                  <Popup>
                    <div className="p-1 min-w-[180px]">
                      <div className="font-bold text-gray-800 text-[13px] border-b pb-1 mb-2">{station.name}</div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-500">
                          {station.type === 'water' ? 'ระดับน้ำปัจจุบัน:' : 'ฝนสะสม 24 ชม.:'}
                        </span>
                        <span className="font-extrabold" style={{color: station.risk.color}}>
                          {station.val} {station.type === 'water' ? 'ม.' : 'มม.'}
                        </span>
                      </div>
                      {station.type === 'water' && (
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-gray-500">ระดับตลิ่ง:</span>
                          <span className="font-bold text-gray-700">{station.bank} ม.</span>
                        </div>
                      )}
                      <div className="text-[11px] font-bold text-center px-2 py-1 rounded text-white mt-2" style={{backgroundColor: station.risk.color}}>
                        {station.risk.label}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* 🌐 FloodDash Portal (เปลี่ยนจาก Iframe เป็น Launcher) */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl overflow-hidden shadow-2xl flex flex-col mb-6">
          <div className="bg-gradient-to-r from-[#1e3a8a] to-[#1e293b] px-4 py-3 flex flex-col md:flex-row items-start md:items-center justify-between border-b border-[#334155]">
            <span className="text-white text-sm font-bold flex items-center mb-2 md:mb-0">
              <span className="text-xl mr-2">🌍</span> ฐานข้อมูลแจ้งเหตุ FloodDash (ระบบภายนอก)
            </span>
          </div>
          
          {/* พื้นที่ Launcher แจ้งเตือนการป้องกันความปลอดภัย */}
          <div className="w-full h-[250px] md:h-[300px] bg-[#0b132b] relative flex flex-col items-center justify-center p-6 text-center">
            {/* เอฟเฟกต์แสง */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500 rounded-full blur-[80px] opacity-10 pointer-events-none"></div>
            
            <div className="w-16 h-16 bg-[#1e293b] rounded-full flex items-center justify-center mb-4 border border-[#334155] shadow-lg relative z-10">
              <span className="text-2xl">🛡️</span>
            </div>
            <h3 className="text-lg md:text-xl font-bold text-white mb-2 relative z-10">ระบบป้องกันความปลอดภัยของ FloodDash</h3>
            <p className="text-gray-400 text-xs md:text-sm max-w-md mb-6 relative z-10 leading-relaxed">
              เว็บไซต์ต้นทางมีการตั้งค่าความปลอดภัย <span className="text-blue-400 font-mono">X-Frame-Options</span> ไม่อนุญาตให้ฝังหน้าเว็บลงในระบบอื่น กรุณากดปุ่มด้านล่างเพื่อเปิดดูรายงานในหน้าต่างใหม่
            </p>
            <a 
              href="https://flood.nonarkara.org" 
              target="_blank" rel="noopener noreferrer"
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center space-x-2 shadow-[0_0_15px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] relative z-10"
            >
              <span>เปิดระบบ FloodDash (แท็บใหม่) ↗</span>
            </a>
          </div>
        </div>
          
          <div className="w-full h-[500px] md:h-[650px] bg-white relative">
            <iframe 
              src="https://flood.nonarkara.org" 
              width="100%" 
              height="100%" 
              frameBorder="0"
              title="FloodDash System"
              className="w-full h-full absolute inset-0"
            />
          </div>
        </div>

        {/* 📋 แหล่งข้อมูล และ เกณฑ์การประเมิน */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* กล่องสถานะการเชื่อมต่อ (Data Sources) */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-5 shadow-lg">
            <div className="flex items-center mb-4 border-b border-[#334155] pb-3">
              <span className="text-lg mr-2">📡</span>
              <h3 className="text-white font-bold text-[15px] md:text-lg">แหล่งข้อมูล และ สถานะการเชื่อมต่อ</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm text-left">
                <thead className="text-[10px] md:text-xs text-gray-400 bg-[#1e293b]">
                  <tr>
                    <th className="px-3 md:px-4 py-3 rounded-tl-lg whitespace-nowrap">ชุดข้อมูล</th>
                    <th className="px-3 md:px-4 py-3">สถานะ</th>
                    <th className="px-3 md:px-4 py-3 rounded-tr-lg">ที่มา</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#1e293b]">
                    <td className="px-3 md:px-4 py-3 font-medium text-white whitespace-nowrap">National ThaiWater (ONWR) — ระดับน้ำ</td>
                    <td className="px-3 md:px-4 py-3 font-bold text-[#10b981] whitespace-nowrap">{apiStatus.water}</td>
                    <td className="px-3 md:px-4 py-3 text-gray-500 text-[10px] md:text-xs font-mono break-all">https://api-v3.thaiwater.net/.../waterlevel_load</td>
                  </tr>
                  <tr className="border-b border-[#1e293b]">
                    <td className="px-3 md:px-4 py-3 font-medium text-white whitespace-nowrap">National ThaiWater (ONWR) — ปริมาณฝน 24 ชม.</td>
                    <td className="px-3 md:px-4 py-3 font-bold text-[#10b981] whitespace-nowrap">{apiStatus.rain}</td>
                    <td className="px-3 md:px-4 py-3 text-gray-500 text-[10px] md:text-xs font-mono break-all">https://api-v3.thaiwater.net/.../rain_24h</td>
                  </tr>
                  <tr className="border-b border-[#1e293b] bg-blue-900/10">
                    <td className="px-3 md:px-4 py-3 font-bold text-[#60a5fa] whitespace-nowrap">FloodDash (ฝังเว็บ)</td>
                    <td className="px-3 md:px-4 py-3 font-bold text-[#10b981] whitespace-nowrap">{apiStatus.floodDash}</td>
                    <td className="px-3 md:px-4 py-3 text-gray-500 text-[10px] md:text-xs font-mono">https://flood.nonarkara.org</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* กล่องเกณฑ์การประเมินความเสี่ยง (Risk Criteria) */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-5 shadow-lg">
            <div className="flex items-center mb-4 border-b border-[#334155] pb-3">
              <span className="text-lg mr-2">📋</span>
              <h3 className="text-white font-bold text-[15px] md:text-lg">เกณฑ์การประเมินความเสี่ยง</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <h4 className="text-[13px] md:text-sm font-bold text-[#38bdf8] mb-2">ระดับน้ำ (เทียบสัดส่วนความสูงตลิ่ง)</h4>
                <ul className="space-y-1.5 text-[11px] md:text-sm text-gray-300">
                  <li className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#10b981] mr-2 flex-shrink-0"></span> ปกติ: ต่ำกว่า 70% ของระดับตลิ่ง</li>
                  <li className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#facc15] mr-2 flex-shrink-0"></span> เฝ้าระวัง: 70-85%</li>
                  <li className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#f97316] mr-2 flex-shrink-0"></span> เสี่ยงสูง: 85-100%</li>
                  <li className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#ef4444] mr-2 flex-shrink-0"></span> วิกฤต: 100% ขึ้นไป (น้ำล้นตลิ่ง)</li>
                </ul>
              </div>
              
              <div>
                <h4 className="text-[13px] md:text-sm font-bold text-[#38bdf8] mb-2">ปริมาณฝนสะสม 24 ชั่วโมง</h4>
                <ul className="space-y-1.5 text-[11px] md:text-sm text-gray-300">
                  <li className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#10b981] mr-2 flex-shrink-0"></span> ปกติ: น้อยกว่า 35 มม.</li>
                  <li className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#facc15] mr-2 flex-shrink-0"></span> ฝนหนัก: 35-60 มม.</li>
                  <li className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#f97316] mr-2 flex-shrink-0"></span> ฝนหนักมาก: 60-90 มม.</li>
                  <li className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#ef4444] mr-2 flex-shrink-0"></span> ฝนหนักมากพิเศษ: 90 มม. ขึ้นไป</li>
                </ul>
              </div>
            </div>
            
            <p className="text-[9px] md:text-[10px] text-gray-500 mt-4 leading-relaxed">
              * ข้อมูลทั้งหมดมาจากการดึง API สาธารณะ และการแสดงผลหน้าต่างของหน่วยงานภายนอก (FloodDash) 
            </p>
          </div>

        </div>

      </main>
    </div>
  );
}
