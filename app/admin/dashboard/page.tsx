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

  useEffect(() => {
    fetchDashboardData();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#38bdf8] border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-[#38bdf8] font-mono tracking-widest animate-pulse">LOADING DASHBOARD...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-white font-sans selection:bg-[#38bdf8] selection:text-[#0f172a]">
      {/* 🚀 Header */}
      <header className="bg-[#0f172a]/80 backdrop-blur-xl border-b border-[#1e293b] px-8 py-5 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-[#38bdf8] to-[#2563eb] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.4)]">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight tracking-wide">Public Dashboard</h1>
            <p className="text-sm text-[#38bdf8] font-mono">ศูนย์ข้อมูลสรุปสถิติสาธารณภัย ต.บ่อหลวง</p>
          </div>
        </div>
        <Link href="/" className="bg-[#1e293b] hover:bg-[#334155] border border-gray-700 px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center space-x-2 text-white">
          <span>⬅</span>
          <span>กลับหน้าแผนที่หลัก</span>
        </Link>
      </header>

      {/* 📊 Main Content - Expanded Full Width */}
      <main className="w-full max-w-[1600px] mx-auto px-6 md:px-12 py-10 space-y-8">
        
        {/* 🍱 Bento Box Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="col-span-1 md:col-span-2 bg-[#172033] p-8 rounded-2xl border border-[#2d3748] shadow-lg flex flex-col justify-center">
            <h2 className="text-gray-400 text-sm font-bold tracking-widest uppercase mb-2">TOTAL INCIDENTS</h2>
            <div className="text-7xl font-extrabold text-white">{stats.total} <span className="text-2xl text-gray-500 font-normal">รายการ</span></div>
            <p className="text-sm text-gray-400 mt-4">ภาพรวมการแจ้งเหตุสาธารณภัยทั้งหมดในพื้นที่เทศบาลตำบลบ่อหลวง ข้อมูลถูกซิงค์แบบ Real-time</p>
          </div>
          
          <div className="col-span-1 bg-[#172033] p-8 rounded-2xl border border-[#2d3748] shadow-lg flex flex-col relative overflow-hidden">
            <div className="text-orange-400 text-3xl mb-4">⚡</div>
            <h3 className="text-gray-400 text-sm font-bold tracking-widest uppercase mb-2">กำลังดำเนินการ</h3>
            <div className="text-6xl font-extrabold text-orange-400">{stats.active}</div>
          </div>
          
          <div className="col-span-1 bg-[#172033] p-8 rounded-2xl border border-[#2d3748] shadow-lg flex flex-col relative overflow-hidden">
            <div className="text-emerald-400 text-3xl mb-4">✅</div>
            <h3 className="text-gray-400 text-sm font-bold tracking-widest uppercase mb-2">แก้ไขเสร็จสิ้น</h3>
            <div className="text-6xl font-extrabold text-emerald-400">{stats.resolved}</div>
          </div>
          
          <div className="col-span-1 md:col-span-2 bg-[#172033] p-8 rounded-2xl border border-[#2d3748] shadow-lg flex flex-col h-[400px]">
            <h3 className="text-white text-lg font-bold mb-4 flex items-center"><span className="mr-3">📊</span> สัดส่วนประเภทภัยพิบัติ</h3>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={5} dataKey="value" stroke="none">
                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="col-span-1 md:col-span-2 bg-[#172033] p-8 rounded-2xl border border-[#2d3748] shadow-lg flex flex-col h-[400px]">
            <h3 className="text-white text-lg font-bold mb-4 flex items-center"><span className="mr-3">📍</span> Top 5 พื้นที่เสี่ยงภัย (Hotspots)</h3>
            <div className="flex-1 w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: '#334155', opacity: 0.4 }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8', borderRadius: '12px' }} />
                  <Bar dataKey="แจ้งเหตุ" fill="#38bdf8" radius={[6, 6, 0, 0]}>
                    {barData.map((entry, index) => <Cell key={`cell-${index}`} fill={index === 0 ? '#ef4444' : '#38bdf8'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 📋 LIVE TABLE */}
        <div className="bg-[#172033] border border-[#2d3748] rounded-2xl shadow-xl overflow-hidden mt-8">
          <div className="bg-[#1e293b] px-8 py-6 flex items-center justify-between border-b border-[#334155]">
            <h3 className="text-white font-bold text-lg tracking-wide uppercase">Live Incident Tracking</h3>
            <div className="flex items-center space-x-2 text-xs font-mono bg-emerald-900/40 text-emerald-400 px-4 py-2 rounded-full border border-emerald-800/50">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span>สถานะ Real-time</span>
            </div>
          </div>
          
          <div className="grid grid-cols-12 gap-4 px-8 py-4 bg-[#0f172a] text-xs text-gray-400 font-bold uppercase tracking-wider border-b border-[#2d3748]">
            <div className="col-span-2">วันเวลา</div>
            <div className="col-span-3">ประเภทภัย / พื้นที่</div>
            <div className="col-span-4">รายละเอียด</div>
            <div className="col-span-3 text-right">สถานะการจัดการ</div>
          </div>

          <div className="divide-y divide-[#2d3748]">
            {liveIncidents.map((incident, idx) => {
              let statusStyle = "bg-blue-950 text-blue-400 border-blue-800";
              let statusText = incident.status || "รับเรื่องแล้ว";
              
              if (statusText.includes("เสร็จแล้ว") || statusText.includes("ปิดจ๊อบ")) {
                statusStyle = "bg-emerald-950 text-emerald-400 border-emerald-800";
                statusText = "เสร็จสิ้น";
              } else if (statusText.includes("กำลัง") || statusText.includes("ระหว่าง")) {
                statusStyle = "bg-orange-950 text-orange-400 border-orange-800";
                statusText = "อยู่ระหว่างดำเนินการ";
              }

              return (
                <div key={idx} className="grid grid-cols-12 gap-4 px-8 py-5 hover:bg-[#1e293b]/60 items-center">
                  <div className="col-span-2 text-gray-300 font-mono text-sm">{formatTime(incident.created_at)}</div>
                  <div className="col-span-3 text-white font-bold text-sm">{incident.risk_type}</div>
                  <div className="col-span-4 text-gray-400 text-sm">{incident.description.substring(0, 60)}...</div>
                  <div className="col-span-3 text-right">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-bold border ${statusStyle}`}>{statusText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
