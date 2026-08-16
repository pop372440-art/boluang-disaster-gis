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
  const [stats, setStats] = useState({ total: 0, active: 0, resolved: 0, critical: 0 });
  const [pieData, setPieData] = useState<any[]>([]);
  const [barData, setBarData] = useState<any[]>([]);
  
  // 🛫 State สำหรับระบบ Flight Board (ตารางแจ้งเหตุล่าสุด)
  const [liveIncidents, setLiveIncidents] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // ดึงข้อมูลทั้งหมดเพื่อทำสถิติ และเรียงลำดับเวลาล่าสุดเพื่อทำบอร์ด
      const { data, error } = await supabase
        .from('boluang_disaster_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const total = data.length;
        const resolved = data.filter(d => d.status === 'ดำเนินการเสร็จแล้ว' || d.status === 'ปิดจ๊อบ').length;
        const active = total - resolved;
        const critical = data.filter(d => d.severity_level >= 4 && (d.status !== 'ดำเนินการเสร็จแล้ว' && d.status !== 'ปิดจ๊อบ')).length;
        
        setStats({ total, active, resolved, critical });

        // เอา 10 รายการล่าสุดไปใส่ใน Flight Board
        setLiveIncidents(data.slice(0, 10));

        // ประมวลผล กราฟโดนัท
        const typeCount: any = {};
        data.forEach(d => { typeCount[d.risk_type] = (typeCount[d.risk_type] || 0) + 1; });
        setPieData(Object.keys(typeCount).map(k => ({ name: k, value: typeCount[k] })));

        // ประมวลผล กราฟแท่ง (Top 5)
        const villageCount: any = {};
        data.forEach(d => { villageCount[d.village_name] = (villageCount[d.village_name] || 0) + 1; });
        const sortedVillages = Object.keys(villageCount)
          .map(k => ({ name: k.replace('บ้าน', ''), แจ้งเหตุ: villageCount[k] }))
          .sort((a, b) => b.แจ้งเหตุ - a.แจ้งเหตุ)
          .slice(0, 5);
        setBarData(sortedVillages);
      } else {
        // Mock Data กรณีไม่มีข้อมูล
        setLiveIncidents([
          { created_at: new Date().toISOString(), risk_type: 'ไฟป่า / หมอกควัน', village_name: 'บ้านเตียนอาง', description: 'เสาไฟโซล่าเซลล์หัก', severity_level: 2, status: 'ดำเนินการเสร็จแล้ว' },
          { created_at: new Date(Date.now() - 3600000).toISOString(), risk_type: 'อื่นๆ', village_name: 'บ้านแม่หืด', description: 'ทิ้งขยะไม่เป็นที่', severity_level: 3, status: 'อยู่ระหว่างดำเนินการ' },
          { created_at: new Date(Date.now() - 7200000).toISOString(), risk_type: 'ดินโคลนถล่ม', village_name: 'บ้านขุน', description: 'ดินสไลด์ปิดถนน', severity_level: 5, status: 'รับเรื่องแล้ว' },
        ]);
        setStats({ total: 3, active: 2, resolved: 1, critical: 1 });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ฟังก์ชันแปลงวันที่ให้สวยงามแบบตารางสนามบิน
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
        
        {/* 🍱 Bento Box Grid Layout (สถิติ) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="col-span-1 md:col-span-2 bg-gradient-to-br from-[#1e293b] to-[#0f172a] p-6 rounded-3xl border border-[#334155] shadow-xl relative overflow-hidden group">
            <h2 className="text-gray-400 text-sm font-bold tracking-widest uppercase mb-1">Total Incidents</h2>
            <div className="text-4xl md:text-5xl font-extrabold text-white mb-2">{stats.total} <span className="text-lg text-gray-500 font-normal">รายการ</span></div>
            <p className="text-sm text-gray-400">สถิติการแจ้งเหตุสาธารณภัยทั้งหมดในพื้นที่</p>
          </div>
          <div className="col-span-1 bg-[#1e293b]/80 backdrop-blur-sm p-6 rounded-3xl border border-orange-500/30">
            <h3 className="text-gray-400 text-sm font-bold tracking-widest uppercase mb-1">อยู่ระหว่างดำเนินการ</h3>
            <div className="text-4xl font-extrabold text-orange-400">{stats.active}</div>
          </div>
          <div className="col-span-1 bg-[#1e293b]/80 backdrop-blur-sm p-6 rounded-3xl border border-emerald-500/30">
            <h3 className="text-gray-400 text-sm font-bold tracking-widest uppercase mb-1">แก้ไขเสร็จสิ้น</h3>
            <div className="text-4xl font-extrabold text-emerald-400">{stats.resolved}</div>
          </div>
        </div>

        {/* 🛫 LIVE FLIGHT BOARD: ตารางติดตามสถานะแบบเรียลไทม์ */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          <div className="bg-[#1e293b] px-6 py-4 flex items-center justify-between border-b border-[#334155]">
            <div className="flex items-center space-x-3">
              <span className="text-2xl animate-pulse">📡</span>
              <h3 className="text-white font-bold text-lg tracking-wide uppercase">Live Incident Tracking</h3>
            </div>
            <div className="flex items-center space-x-2 text-xs font-mono bg-emerald-900/40 text-emerald-400 px-3 py-1 rounded-full border border-emerald-800/50">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span>ระบบอัปเดตอัตโนมัติ</span>
            </div>
          </div>
          
          {/* ส่วนหัวตาราง */}
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-[#0b132b]/50 text-xs text-gray-400 font-bold uppercase tracking-wider border-b border-[#1e293b] hidden md:grid">
            <div className="col-span-2">วันเวลาที่แจ้ง</div>
            <div className="col-span-3">ประเภทภัย / พื้นที่</div>
            <div className="col-span-4">รายละเอียดเบื้องต้น</div>
            <div className="col-span-3 text-right">สถานะการจัดการ</div>
          </div>

          {/* ส่วนข้อมูลไหล (Auto-scroll container) */}
          <div className="relative h-[400px] overflow-hidden group">
            <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-2 space-y-2">
              {liveIncidents.map((incident, idx) => {
                // กำหนดสีและข้อความของสถานะ
                let statusColor = "bg-gray-800 text-gray-300 border-gray-600";
                let statusText = incident.status || "รับเรื่องแล้ว";
                let icon = "⏳";
                
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
                  statusText = "รับเรื่องแจ้งเหตุแล้ว";
                  icon = "📥";
                }

                // แอนิเมชันให้แถวค่อยๆ เลื่อนขึ้นมาแบบสมูทๆ
                return (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-4 py-4 bg-[#1e293b]/40 hover:bg-[#1e293b]/80 border border-[#334155]/50 rounded-xl transition-all duration-300 items-center transform hover:scale-[1.01]">
                    
                    {/* วันเวลา */}
                    <div className="col-span-1 md:col-span-2 flex md:flex-col items-center md:items-start justify-between md:justify-center">
                      <span className="text-gray-300 font-mono text-sm">{formatTime(incident.created_at)}</span>
                      <span className="text-gray-500 font-mono text-xs">{formatDate(incident.created_at)}</span>
                    </div>
                    
                    {/* ประเภทภัยและพื้นที่ */}
                    <div className="col-span-1 md:col-span-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-bold text-sm truncate">{incident.risk_type}</span>
                        {incident.severity_level >= 4 && <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full border border-red-500/30">ด่วน</span>}
                      </div>
                      <div className="text-gray-400 text-xs mt-1 flex items-center">
                        <span className="text-red-400 mr-1">📍</span> {incident.village_name}
                      </div>
                    </div>
                    
                    {/* รายละเอียด */}
                    <div className="col-span-1 md:col-span-4 text-gray-300 text-sm line-clamp-2 md:pr-4">
                      {incident.description.replace('[AI วิเคราะห์]', '🤖 ').substring(0, 80)}...
                    </div>
                    
                    {/* สถานะ */}
                    <div className="col-span-1 md:col-span-3 flex justify-start md:justify-end">
                      <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border ${statusColor} shadow-sm backdrop-blur-sm`}>
                        <span className="text-sm">{icon}</span>
                        <span className="text-xs font-bold tracking-wide">{statusText}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Fade effect ด้านล่างให้ดูเหมือนกำลังเลื่อนมา */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0f172a] to-transparent pointer-events-none"></div>
          </div>
        </div>

      </main>

      {/* สไตล์สำหรับซ่อน Scrollbar แต่ยังเลื่อนได้ด้วยเมาส์/นิ้ว */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #475569; }
      `}} />
    </div>
  );
}
