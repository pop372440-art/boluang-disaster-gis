'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import Link from 'next/link';

// 🌟 ตั้งค่า Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvtjjhvvtaswzhwhowlj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dGpqaHZ2dGFzd3pod2hvd2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDA3NjcsImV4cCI6MjA5MjExNjc2N30.Jjqi1LWgxEgpT2nBdjuNyoLxEP_VQcKf3GEbIYKPI8Y';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 🎨 ชุดสีสำหรับกราฟแบบ Neon Pro
const PIE_COLORS = ['#ef4444', '#f97316', '#38bdf8', '#10b981', '#8b5cf6'];

export default function ExecutiveDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, resolved: 0, critical: 0 });
  const [pieData, setPieData] = useState<any[]>([]);
  const [barData, setBarData] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('boluang_disaster_reports').select('*');
      if (error) throw error;

      // 💡 หากมีข้อมูลจริง นำมาประมวลผล
      if (data && data.length > 0) {
        const total = data.length;
        const active = data.filter(d => d.status !== 'ดำเนินการเสร็จแล้ว').length;
        const resolved = data.filter(d => d.status === 'ดำเนินการเสร็จแล้ว').length;
        const critical = data.filter(d => d.severity_level >= 4 && d.status !== 'ดำเนินการเสร็จแล้ว').length;
        setStats({ total, active, resolved, critical });

        // ประมวลผล กราฟโดนัท (ประเภทภัยพิบัติ)
        const typeCount: any = {};
        data.forEach(d => { typeCount[d.risk_type] = (typeCount[d.risk_type] || 0) + 1; });
        setPieData(Object.keys(typeCount).map(k => ({ name: k, value: typeCount[k] })));

        // ประมวลผล กราฟแท่ง (หมู่บ้านที่เกิดเหตุสูงสุด)
        const villageCount: any = {};
        data.forEach(d => { villageCount[d.village_name] = (villageCount[d.village_name] || 0) + 1; });
        const sortedVillages = Object.keys(villageCount)
          .map(k => ({ name: k.replace('บ้าน', ''), แจ้งเหตุ: villageCount[k] }))
          .sort((a, b) => b.แจ้งเหตุ - a.แจ้งเหตุ)
          .slice(0, 5); // เอาแค่ Top 5
        setBarData(sortedVillages);
      } else {
        // 💡 หากฐานข้อมูลว่างเปล่า (ใช้ข้อมูลจำลองเพื่อการนำเสนอแบบ Pro)
        setStats({ total: 142, active: 18, resolved: 124, critical: 3 });
        setPieData([
          { name: 'ดินถล่ม', value: 45 }, { name: 'ไฟป่า/จุดความร้อน', value: 35 }, 
          { name: 'น้ำท่วมฉับพลัน', value: 40 }, { name: 'ต้นไม้ล้มขวางทาง', value: 15 }, { name: 'อื่นๆ', value: 7 }
        ]);
        setBarData([
          { name: 'พุย', แจ้งเหตุ: 32 }, { name: 'แม่หืด', แจ้งเหตุ: 28 }, 
          { name: 'บ่อหลวง', แจ้งเหตุ: 24 }, { name: 'ขุน', แจ้งเหตุ: 18 }, { name: 'วังกะทะ', แจ้งเหตุ: 12 }
        ]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#38bdf8] border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-[#38bdf8] font-mono tracking-widest animate-pulse">LOADING COMMAND CENTER...</div>
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
            <h1 className="text-[18px] font-bold text-white leading-tight tracking-wide">Executive Dashboard</h1>
            <p className="text-[12px] text-[#38bdf8] font-mono">เทศบาลตำบลบ่อหลวง จ.เชียงใหม่</p>
          </div>
        </div>
        <Link href="/admin" className="flex items-center space-x-2 bg-[#1e293b] hover:bg-[#334155] border border-gray-700 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-md">
          <span>⬅️</span> <span>กลับหน้ารายการแจ้งเหตุ</span>
        </Link>
      </header>

      <main className="p-4 md:p-8 max-w-[1400px] mx-auto">
        
        {/* 🍱 Bento Box Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

          {/* 📦 กล่องที่ 1: สรุปภาพรวม (Hero Card) - กินพื้นที่ 2 คอลัมน์ */}
          <div className="col-span-1 md:col-span-2 bg-gradient-to-br from-[#1e293b] to-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-xl relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#38bdf8] rounded-full blur-[80px] opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
            <h2 className="text-gray-400 text-sm font-bold tracking-widest uppercase mb-1">Total Incidents</h2>
            <div className="text-4xl md:text-5xl font-extrabold text-white mb-2">{stats.total} <span className="text-lg text-gray-500 font-normal">รายการ</span></div>
            <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
              ภาพรวมการแจ้งเหตุสาธารณภัยทั้งหมดในพื้นที่เทศบาลตำบลบ่อหลวง ข้อมูลถูกซิงค์แบบ Real-time
            </p>
            <div className="mt-6 inline-flex items-center px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
              ระบบวิเคราะห์ข้อมูลทำงานปกติ
            </div>
          </div>

          {/* 📦 กล่องที่ 2: งานที่กำลังดำเนินการ (Active) */}
          <div className="col-span-1 bg-[#1e293b]/80 backdrop-blur-sm p-6 rounded-3xl border border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.05)] relative overflow-hidden">
            <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center mb-4 border border-orange-500/50">
              <span className="text-orange-400 text-lg">⚡</span>
            </div>
            <h3 className="text-gray-400 text-sm font-bold tracking-widest uppercase mb-1">กำลังดำเนินการ</h3>
            <div className="text-4xl font-extrabold text-orange-400">{stats.active}</div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-orange-600 to-orange-400"></div>
          </div>

          {/* 📦 กล่องที่ 3: ปิดจ๊อบแล้ว (Resolved) */}
          <div className="col-span-1 bg-[#1e293b]/80 backdrop-blur-sm p-6 rounded-3xl border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.05)] relative overflow-hidden">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 border border-emerald-500/50">
              <span className="text-emerald-400 text-lg">✅</span>
            </div>
            <h3 className="text-gray-400 text-sm font-bold tracking-widest uppercase mb-1">แก้ไขเสร็จสิ้น</h3>
            <div className="text-4xl font-extrabold text-emerald-400">{stats.resolved}</div>
            <div className="text-xs text-gray-500 mt-2 font-mono">Success Rate: {stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0}%</div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-emerald-400"></div>
          </div>

          {/* 📦 กล่องที่ 4: กราฟโดนัท (สัดส่วนประเภทภัยพิบัติ) - กินพื้นที่ 2 คอลัมน์ แนวนอน */}
          <div className="col-span-1 md:col-span-2 bg-[#1e293b]/50 p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col h-[380px]">
            <h3 className="text-white text-lg font-bold mb-1 flex items-center">
              <span className="mr-2">📊</span> สัดส่วนประเภทภัยพิบัติ
            </h3>
            <p className="text-xs text-gray-400 mb-6">วิเคราะห์ความถี่ของเหตุการณ์เพื่อวางแผนทรัพยากร</p>
            <div className="flex-1 w-full h-full min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                    itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📦 กล่องที่ 5: กราฟแท่ง (Top 5 พื้นที่เกิดเหตุซ้ำซาก) - กินพื้นที่ 2 คอลัมน์ */}
          <div className="col-span-1 md:col-span-2 bg-[#1e293b]/50 p-6 rounded-3xl border border-[#334155] shadow-lg flex flex-col h-[380px]">
            <h3 className="text-white text-lg font-bold mb-1 flex items-center">
              <span className="mr-2">📍</span> Top 5 พื้นที่เสี่ยงภัย (Hotspots)
            </h3>
            <p className="text-xs text-gray-400 mb-6">หมู่บ้านที่ได้รับการแจ้งเหตุมากที่สุด</p>
            <div className="flex-1 w-full h-full min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{ fill: '#334155', opacity: 0.4 }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8', borderRadius: '12px', color: '#fff' }}
                  />
                  <Bar dataKey="แจ้งเหตุ" fill="#38bdf8" radius={[6, 6, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#ef4444' : '#38bdf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 📦 กล่องที่ 6: Critical Alert Banner (กินพื้นที่เต็มความกว้าง) */}
          <div className="col-span-1 md:col-span-4 mt-2">
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between">
              <div className="flex items-center space-x-4 mb-4 md:mb-0">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/50">
                  <span className="text-red-400 text-2xl animate-pulse">🚨</span>
                </div>
                <div>
                  <h4 className="text-red-400 font-bold text-lg">Critical Alerts (เหตุรุนแรงระดับ 4-5)</h4>
                  <p className="text-red-400/70 text-sm">มีเคสเร่งด่วนที่รอการจัดการจำนวน {stats.critical} รายการ</p>
                </div>
              </div>
              <Link href="/admin" className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl shadow-lg transition-colors whitespace-nowrap">
                เปิดหน้าต่างสั่งการด่วน
              </Link>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
