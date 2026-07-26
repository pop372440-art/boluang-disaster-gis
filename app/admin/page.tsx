'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Swal from 'sweetalert2';

// 🌟 ตั้งค่า Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvtjjhvvtaswzhwhowlj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dGpqaHZ2dGFzd3pod2hvd2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDA3NjcsImV4cCI6MjA5MjExNjc2N30.Jjqi1LWgxEgpT2nBdjuNyoLxEP_VQcKf3GEbIYKPI8Y';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AdminPanel() {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  // State สำหรับ Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // State สำหรับข้อมูลแจ้งเหตุ
  const [reports, setReports] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // 🔐 ตรวจสอบการ Login
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 📥 ดึงข้อมูลเมื่อ Login สำเร็จ
  useEffect(() => {
    if (session) {
      fetchActiveReports();
    }
  }, [session]);

  const fetchActiveReports = async () => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('boluang_disaster_reports')
        .select('*')
        .neq('status', 'ดำเนินการเสร็จแล้ว') // ดึงเฉพาะเคสที่ยังไม่เสร็จ
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setReports(data);
    } catch (error) {
      console.error('Error fetching:', error);
    } finally {
      setLoadingData(false);
    }
  };

  // 🚀 ฟังก์ชัน Login
  const handleLogin = async (e: any) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      Swal.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'เข้าสู่ระบบล้มเหลว', text: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 🚪 ฟังก์ชัน Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // ✅ ฟังก์ชัน "ปิดจ๊อบ" อัจฉริยะ
  const handleCloseJob = async (reportId: string, currentRiskType: string) => {
    const { value: actionText } = await Swal.fire({
      title: '📝 บันทึกการปฏิบัติงาน',
      html: `ระบุรายละเอียดการแก้ไขปัญหา<br/><b>${currentRiskType}</b>`,
      input: 'textarea',
      inputPlaceholder: 'เช่น นำรถแบคโฮเข้าเคลียร์พื้นที่เรียบร้อย...',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#ef4444',
      confirmButtonText: 'บันทึกและปิดงาน',
      cancelButtonText: 'ยกเลิก',
      inputValidator: (value) => {
        if (!value) return 'กรุณาระบุรายละเอียดการดำเนินการครับ!';
      }
    });

    if (actionText) {
      try {
        Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const now = new Date().toISOString();
        const userEmail = session?.user?.email;

        // อัปเดตข้อมูลขึ้น Database
        const { error } = await supabase
          .from('boluang_disaster_reports')
          .update({ 
            status: 'ดำเนินการเสร็จแล้ว',
            action_taken: actionText,
            resolved_at: now,
            resolved_by: userEmail // บันทึกว่าใครเป็นคนกดปิดจ๊อบ
          })
          .eq('id', reportId);

        if (error) throw error;

        Swal.fire({ icon: 'success', title: 'ปิดงานสำเร็จ!', text: 'ข้อมูลถูกบันทึกและลบออกจากแผนที่ประชาชนแล้ว', confirmButtonColor: '#10b981' });
        
        // รีเฟรชตารางใหม่
        fetchActiveReports();
        
      } catch (error) {
        console.error(error);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้' });
      }
    }
  };

  // ⏳ หน้า Loading รอตรวจสอบระบบ
  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans">กำลังตรวจสอบสิทธิ์...</div>;
  }

  // 🔐 หน้าต่าง Login (ถ้ายังไม่ได้เข้าระบบ)
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a] font-sans">
        <div className="bg-[#1e293b] p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              <span className="text-2xl">🛡️</span>
            </div>
            <h1 className="text-2xl font-bold text-white">ระบบจัดการหลังบ้าน</h1>
            <p className="text-sm text-gray-400 mt-1">ศูนย์บัญชาการสาธารณภัย ต.บ่อหลวง</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">อีเมลเจ้าหน้าที่</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-[#0b132b] border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="admin@boluang.go.th" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">รหัสผ่าน</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#0b132b] border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={isLoggingIn} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg mt-2">
              {isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 🎯 หน้า Dashboard สำหรับ Admin (เมื่อ Login ผ่านแล้ว)
  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans">
      {/* Navbar */}
      <header className="bg-[#1e293b] border-b border-gray-700 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">🚨</span>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Admin Command Center</h1>
            <p className="text-xs text-blue-400">ระบบจัดการคำร้องสาธารณภัย ต.บ่อหลวง</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium text-gray-200">เข้าสู่ระบบโดย:</p>
            <p className="text-xs text-green-400 font-mono">{session.user.email}</p>
          </div>
          <button onClick={handleLogout} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/50 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
            ออกจากระบบ
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">รายการแจ้งเหตุที่ต้องดำเนินการ</h2>
            <p className="text-gray-400 mt-1 text-sm">เรียงลำดับจากรายการใหม่ล่าสุด</p>
          </div>
          <button onClick={fetchActiveReports} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm flex items-center space-x-2 border border-gray-700 transition-colors">
            <span>🔄</span> <span>รีเฟรชข้อมูล</span>
          </button>
        </div>

        {/* ตารางข้อมูล */}
        <div className="bg-[#1e293b] rounded-xl border border-gray-700 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-800/50 border-b border-gray-700 text-sm font-semibold text-gray-300">
                  <th className="p-4 w-48">วันเวลาที่แจ้ง</th>
                  <th className="p-4 w-56">ประเภทภัย / พื้นที่</th>
                  <th className="p-4 text-center">ระดับ</th>
                  <th className="p-4">รายละเอียดผู้แจ้ง</th>
                  <th className="p-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {loadingData ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td></tr>
                ) : reports.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400 text-lg">✨ ยอดเยี่ยม! ขณะนี้ไม่มีเหตุการณ์ที่ต้องดำเนินการ</td></tr>
                ) : (
                  reports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="p-4 text-sm font-mono text-gray-300">
                        {new Date(report.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} น.
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-white">{report.risk_type}</div>
                        <div className="text-sm text-blue-400 mt-0.5 flex items-center">
                          📍 {report.village_name}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${report.severity_level >= 4 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : report.severity_level === 3 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>
                          ระดับ {report.severity_level}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-gray-200 line-clamp-2 max-w-xs">{report.description}</div>
                        <div className="text-xs text-gray-500 mt-1">👤 {report.reporter_name} ({report.reporter_role})</div>
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => handleCloseJob(report.id, report.risk_type)}
                          className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/50 hover:border-emerald-500 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                        >
                          ✅ ปิดจ๊อบ
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
