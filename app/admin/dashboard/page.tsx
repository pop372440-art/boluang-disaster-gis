'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import Link from 'next/link';

// 🌟 ตั้งค่า Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PIE_COLORS = ['#ef4444', '#f97316', '#38bdf8', '#10b981', '#8b5cf6'];

export default function ExecutiveDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, resolved: 0 });
  const [pieData, setPieData] = useState<any[]>([]);
  const [barData, setBarData] = useState<any[]>([]);
  const [liveIncidents, setLiveIncidents] = useState<any[]>([]);
  
  // 🚨 State สำหรับ AI Early Warning
  const [warningData, setWarningData] = useState({ level: 1, message: 'กำลังประเมินสถานการณ์...', rain: 0 });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // 🚨 Effect สำหรับดึงข้อมูล AI Early Warning ทันทีที่เปิดหน้าเว็บ
  useEffect(() => {
    fetch('/api/early-warning')
      .then(res => res.json())
      .then(data => {
        if (data.success) setWarningData(data);
      })
      .catch(err => console.error("Early Warning Error:", err));
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('boluang_disaster_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const total = data.length;
        const resolved = data.filter(d => d.status === 'ดำเนินการเสร็จแล้ว' || d.status === 'ปิดจ๊อบ').length;
        const active = total - resolved;
        
        setStats({ total, active, resolved });
        setLiveIncidents(data.slice(0, 10));

        const typeCount: any = {};
        data.forEach(d => { typeCount[d.risk_type] = (typeCount[d.risk_type] || 0) + 1; });
        setPieData(Object.keys(typeCount).map(k => ({ name: k, value: typeCount[k] })));

        const villageCount: any = {};
        data.forEach(d => { villageCount[d.village_name] = (villageCount[d.village_name] || 0) + 1; });
        const sortedVillages = Object.keys(villageCount)
          .map(k => ({ name: k.replace('บ้าน', ''), แจ้งเหตุ: villageCount[k] }))
          .sort((a, b) => b.แจ้งเหตุ - a.แจ้งเหตุ)
          .slice(0, 5);
        setBarData(sortedVillages);
      } else {
        setStats({ total: 24, active: 4, resolved: 20 });
        setLiveIncidents([
          { created_at: new Date().toISOString(), risk_type: 'ไฟป่า / หมอกควัน', village_name: 'บ้านเตียนอาง', description: 'เสาไฟโซล่าเซลล์หัก', severity_level: 2, status: 'ดำเนินการเสร็จแล้ว' },
          { created_at: new Date(Date.now() - 3600000).toISOString(), risk_type: 'อื่นๆ', village_name: 'บ้านแม่หืด', description: 'ทิ้งขยะไม่เป็นที่', severity_level: 3, status: 'อยู่ระหว่างดำเนินการ' },
          { created_at: new Date(Date.now() - 7200000).toISOString(), risk_type: 'ดินโคลนถล่ม', village_name: 'บ้านขุน', description: 'ดินสไลด์ปิดถนน', severity_level: 5, status: 'รับเรื่องแล้ว' },
          { created_at: new Date(Date.now() - 8200000).toISOString(), risk_type: 'น้ำป่าไหลหลาก', village_name: 'บ้านพุย', description: 'น้ำเอ่อล้นเข้าท่วมพื้นที่การเกษตร', severity_level: 4, status: 'รับเรื่องแล้ว' },
        ]);
        setPieData([
          { name: 'ดินโคลนถล่ม', value: 45 }, { name: 'ไฟป่า / หมอกควัน', value: 35 }, 
          { name: 'น้ำป่าไหลหลาก', value: 40 }, { name: 'อื่นๆ', value: 15 }
        ]);
        setBarData([
          { name: 'แม่หืด', แจ้งเหตุ: 13 }, { name: 'เตียนอาง', แจ้งเหตุ: 3 }, 
          { name: 'ขุน', แจ้งเหตุ: 2 }, { name: 'พุย', แจ้งเหตุ: 2 }, { name: 'แม่สะนาม', แจ้งเหตุ: 1 }
        ]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
  };
  
  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.getDate()}/${d.getMonth() + 1}/${(d.getFullYear() + 543).toString().slice(-2)}`;
  };

  const scrollingIncidents = [...liveIncidents, ...liveIncidents];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#38bdf8] border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-[#38bdf8] font-mono tracking-widest animate-pulse">LOADING OPEN DATA...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-white font-sans selection:bg-[#38bdf8] selection:text-[#0f172a]">
      {/* 🚀 Header */}
      <header className="bg-[#0f172a]/80 backdrop-blur-xl border-b border-[#1e293b] px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#38bdf8] to-[#2563eb] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.4)]">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-white leading-tight tracking-wide">Public Dashboard</h1>
            <p className="text-[12px] text-[#38bdf8] font-mono">ศูนย์ข้อมูลสาธารณะ ต.บ่อหลวง</p>
          </div>
        </div>
        <Link href="/" className="bg-[#1e293b] hover:bg-[#334155] border border-gray-700 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center space-x-2 text-white">
          <span>⬅</span>
          <span className="hidden sm:inline">กลับหน้าแผนที่หลัก</span>
        </Link>
      </header>

      <main className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
        
        {/* 🚨 AI Early Warning Banner */}
        {warningData.level >= 3 && (
          <div className={`col-span-1 md:col-span-4 p-4 rounded-2xl border flex items-center justify-between shadow-lg animate-pulse ${warningData.level >= 4 ? 'bg-red-900/50 border-red-500' : 'bg-orange-900/50 border-orange-500'}`}>
            <div className="flex items-center space-x-4">
              <div className="text-3xl text-white">⚠️</div>
              <div>
                <h3 className="text-white font-bold text-lg">AI Early Warning (แจ้งเตือนภัยล่วงหน้าอัตโนมัติ)</h3>
                <p className="text-gray-200 text-sm">{warningData.message} (ปริมาณฝนปัจจุบัน: {warningData.rain} mm)</p>
              </div>
            </div>
            <div className="hidden md:block bg-black/30 px-3 py-1 rounded-full border border-white/20 text-white text-xs font-mono">
              ประเมินโดย Gemini AI
            </div>
          </div>
        )}

        {/* 🍱 Bento Box Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
          <div className="col-span-1 md:col-span-2 bg-[#172033] p-6 rounded-2xl border border-[#2d3748] shadow-lg flex flex-col justify-between">
            <div>
              <h2 className="text-gray-400 text-xs font-bold tracking-widest uppercase mb-1">TOTAL INCIDENTS</h2>
              <div className="text-4xl md:text-5xl font-extrabold text-white mb-2">{stats.total} <span className="text-sm text-gray-500 font-normal">รายการ</span></div>
              <p className="text-[11px] text-gray-400">ภาพรวมการแจ้งเหตุสาธารณภัยทั้งหมดในพื้นที่เทศบาลตำบลบ่อหลวง ข้อมูลถูกซิงค์แบบ Real-time</p>
            </div>
            <div className="mt-6 self-start inline-flex items-center px-3 py-1.5 bg-emerald-900/30 text-emerald-400 border border-emerald-500/20 rounded-full text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2"></span>
              ระบบวิเคราะห์ข้อมูลทำงานปกติ
            </div>
          </div>
          
          <div className="col-span-1 bg-[#172033] p-6 rounded-2xl border border-[#2d3748] shadow-lg flex flex-col relative overflow-hidden">
            <div className="w-8 h-8 bg-orange-500/10 rounded-full flex items-center justify-center mb-3"><span className="text-orange-400 text-sm">⚡</span></div>
            <h3 className="text-gray-400 text-xs font-bold tracking-widest uppercase mb-1">กำลังดำเนินการ</h3>
            <div className="text-4xl font-extrabold text-orange-400">{stats.active}</div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-orange-500"></div>
          </div>
          
          <div className="col-span-1 bg-[#172033] p-6 rounded-2xl border border-[#2d3748] shadow-lg flex flex-col relative overflow-hidden">
            <div className="w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3"><span className="text-emerald-400 text-sm">✅</span></div>
            <h3 className="text-gray-400 text-xs font-bold tracking-widest uppercase mb-1">แก้ไขเสร็จสิ้น</h3>
            <div className="text-4xl font-extrabold text-emerald-400">{stats.resolved}</div>
            <div className="text-[10px] text-gray-500 mt-2">Success Rate: {stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0}%</div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-emerald-500"></div>
          </div>
          
          <div className="col-span-1 md:col-span-2 bg-[#172033] p-6 rounded-2xl border border-[#2d3748] shadow-lg flex flex-col h-[320px]">
            <h3 className="text-white text-sm font-bold mb-1 flex items-center"><span className="mr-2">📊</span> สัดส่วนประเภทภัยพิบัติ</h3>
            <p className="text-[10px] text-gray-400 mb-4">วิเคราะห์ความถี่ของเหตุการณ์เพื่อวางแผนทรัพยากร</p>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#ffffff', fontSize: '12px' }} 
                    itemStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                    labelStyle={{ color: '#cbd5e1' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', color: '#cbd5e1' }}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="col-span-1 md:col-span-2 bg-[#172033] p-6 rounded-2xl border border-[#2d3748] shadow-lg flex flex-col h-[320px]">
            <h3 className="text-white text-sm font-bold mb-1 flex items-center"><span className="mr-2">📍</span> Top 5 พื้นที่เสี่ยงภัย (Hotspots)</h3>
            <p className="text-[10px] text-gray-400 mb-4">หมู่บ้านที่ได้รับการแจ้งเหตุมากที่สุด</p>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{ fill: '#334155', opacity: 0.4 }} 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8', borderRadius: '8px', color: '#ffffff', fontSize: '12px' }} 
                    itemStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                    labelStyle={{ color: '#cbd5e1' }}
                  />
                  <Bar dataKey="แจ้งเหตุ" fill="#38bdf8" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, index) => <Cell key={`cell-${index}`} fill={index === 0 ? '#ef4444' : '#38bdf8'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 🛫 LIVE FLIGHT BOARD */}
        <div className="bg-[#172033] border border-[#2d3748] rounded-2xl shadow-xl overflow-hidden flex flex-col">
          <div className="bg-[#1e293b] px-6 py-4 flex items-center justify-between border-b border-[#334155]">
            <div className="flex items-center space-x-3">
              <span className="text-xl animate-pulse">📡</span>
              <h3 className="text-white font-bold text-sm tracking-wide uppercase">Live Incident Tracking</h3>
            </div>
            <div className="flex items-center space-x-2 text-[10px] font-mono bg-emerald-900/40 text-emerald-400 px-3 py-1 rounded-full border border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span>สถานะ Real-time</span>
            </div>
          </div>
          
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-[#0f172a] text-[11px] text-gray-400 font-bold uppercase tracking-wider border-b border-[#2d3748] hidden md:grid">
            <div className="col-span-2">วันเวลาที่แจ้ง</div>
            <div className="col-span-3">ประเภทภัย / พื้นที่</div>
            <div className="col-span-4">รายละเอียดเบื้องต้น</div>
            <div className="col-span-3 text-right">การจัดการ</div>
          </div>

          <div className="relative h-[320px] overflow-hidden ticker-container">
            <div className="absolute w-full ticker-content">
              {scrollingIncidents.map((incident, idx) => {
                let statusColor = "";
                let statusText = incident.status || "รับเรื่องแล้ว";
                let icon = "";
                
                if (statusText.includes("เสร็จแล้ว") || statusText.includes("ปิดจ๊อบ")) {
                  statusColor = "bg-emerald-950 text-emerald-400 border-emerald-800";
                  statusText = "ดำเนินการเสร็จแล้ว";
                  icon = "✅";
                } else if (statusText.includes("กำลัง") || statusText.includes("ระหว่าง")) {
                  statusColor = "bg-orange-950 text-orange-400 border-orange-800";
                  statusText = "อยู่ระหว่างดำเนินการ";
                  icon = "🚧";
                } else {
                  statusColor = "bg-blue-950 text-blue-400 border-blue-800";
                  statusText = "รับเรื่องแจ้งเหตุแล้ว 🔍 อยู่ระหว่างตรวจสอบเพื่อดำเนินการ"; 
                  icon = "📥"; 
                }

                return (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 border-b border-[#2d3748]/50 hover:bg-[#1e293b]/60 transition-colors items-center">
                    <div className="col-span-1 md:col-span-2 flex md:flex-col items-center md:items-start justify-between md:justify-center">
                      <span className="text-gray-300 font-mono text-xs">{formatTime(incident.created_at)}</span>
                      <span className="text-gray-500 font-mono text-[10px]">{formatDate(incident.created_at)}</span>
                    </div>
                    <div className="col-span-1 md:col-span-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-bold text-[13px] truncate">{incident.risk_type}</span>
                        {incident.severity_level >= 4 && <span className="bg-red-500/20 text-red-400 text-[9px] px-1.5 py-0.5 rounded border border-red-500/30">ด่วน</span>}
                      </div>
                      <div className="text-gray-400 text-[11px] mt-0.5 flex items-center">
                        <span className="text-red-400 mr-1">📍</span> {incident.village_name}
                      </div>
                    </div>
                    <div className="col-span-1 md:col-span-4 text-gray-300 text-[12px] line-clamp-2 pr-4">
                      {incident.description.replace('[AI วิเคราะห์]', '🤖 ').substring(0, 80)}...
                    </div>
                    <div className="col-span-1 md:col-span-3 flex justify-start md:justify-end">
                      <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border ${statusColor}`}>
                        <span className="text-[10px]">{icon}</span>
                        <span className="text-[10px] md:text-[9px] lg:text-[10px] font-bold tracking-wide truncate">{statusText}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[#172033] to-transparent z-10 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#172033] to-transparent z-10 pointer-events-none"></div>
          </div>
        </div>

      </main>

      {/* 🔮 CSS สร้างเวทมนตร์การไหลและเบรก */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes vertical-scroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); } 
        }
        .ticker-content {
          animation: vertical-scroll 35s linear infinite; 
        }
        .ticker-container:hover .ticker-content {
          animation-play-state: paused !important;
        }
      `}} />
    </div>
  );
} 
