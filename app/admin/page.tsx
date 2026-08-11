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

  // 📥 ดึงข้อมูลเมื่อ Login สำเร็จ (พร้อมระบบ Auto-Refresh)
  useEffect(() => {
    if (session) {
      // 1. ดึงข้อมูลครั้งแรกเมื่อเปิดหน้าเว็บ (โชว์ Loading)
      fetchActiveReports(false); 

      // 2. 🚀 ตั้งเวลา Auto-Refresh แบบ "Silent" (ไม่โชว์ Loading) ทุกๆ 15 วินาที
      const intervalId = setInterval(() => {
        fetchActiveReports(true); // true = isSilent (ทำแบบเงียบๆ ไม่กระพริบ)
      }, 15000); // 15000 ms = 15 วินาที

      // 3. ทำความสะอาดการตั้งเวลาเมื่อปิดหน้าเว็บ
      return () => clearInterval(intervalId);
    }
  }, [session]);

  // 🔄 ฟังก์ชันดึงข้อมูล (เพิ่มพารามิเตอร์ isSilent)
  const fetchActiveReports = async (isSilent = false) => {
    if (!isSilent) setLoadingData(true); // โชว์ Loading เฉพาะตอนกดปุ่มรีเฟรชมือ หรือโหลดครั้งแรก
    
    try {
      const { data, error } = await supabase
        .from('boluang_disaster_reports')
        .select('*')
        .neq('status', 'ดำเนินการเสร็จแล้ว') 
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setReports(data);
    } catch (error) {
      console.error('Error fetching:', error);
    } finally {
      if (!isSilent) setLoadingData(false);
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

  // 🔍 ฟังก์ชันกดขยายรูปภาพบนแผนที่ (สำหรับ Admin)
  const handleViewImage = (imageUrl: string) => {
    Swal.fire({
      imageUrl: imageUrl,
      imageAlt: 'ภาพแจ้งเหตุจากประชาชน',
      showConfirmButton: false,
      showCloseButton: true,
      width: 'auto',
      padding: '1em',
      background: '#1e293b', 
      backdrop: 'rgba(0,0,0,0.85)',
      customClass: {
        popup: 'border border-gray-700 rounded-2xl shadow-2xl',
        image: 'rounded-lg max-h-[80vh] object-contain'
      }
    });
  };

  // ✅ ฟังก์ชัน "ปิดจ๊อบ" อัจฉริยะ (อัปเกรดแนบรูปได้)
  const handleCloseJob = async (reportId: string, currentRiskType: string) => {
    const { value: formValues } = await Swal.fire({
      title: '📝 บันทึกการปฏิบัติงาน',
      html: `
        <div class="text-left mb-2 text-sm text-gray-700">ระบุรายละเอียดการแก้ไขปัญหา <b>${currentRiskType}</b></div>
        <textarea id="swal-input-text" class="swal2-textarea" placeholder="เช่น นำรถแบคโฮเข้าเคลียร์พื้นที่เรียบร้อย..." style="margin: 0 auto 15px auto; width: 100%; font-size: 14px;"></textarea>
        
        <div class="text-left mb-2 text-sm font-bold text-gray-700">📷 แนบภาพผลการปฏิบัติงาน (หลังดำเนินการ)</div>
        <input type="file" id="swal-input-file" class="swal2-file" accept="image/*" style="display: flex; width: 100%; font-size: 14px; margin: 0 auto;">
      `,
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#ef4444',
      confirmButtonText: 'บันทึกและปิดงาน',
      cancelButtonText: 'ยกเลิก',
      preConfirm: () => {
        const text = (document.getElementById('swal-input-text') as HTMLTextAreaElement).value;
        const fileInput = document.getElementById('swal-input-file') as HTMLInputElement;
        const file = fileInput.files ? fileInput.files[0] : null;

        if (!text) {
          Swal.showValidationMessage('กรุณาระบุรายละเอียดการดำเนินการครับ!');
          return false;
        }
        return { text, file };
      }
    });

    if (formValues) {
      const { text: actionText, file: resolveFile } = formValues;

      try {
        Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        let resolvedImageUrl = null;

        if (resolveFile) {
          const fileExt = resolveFile.name.split('.').pop();
          const fileName = `resolved-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `reports/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('disaster_images')
            .upload(filePath, resolveFile);

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage
            .from('disaster_images')
            .getPublicUrl(filePath);

          resolvedImageUrl = publicUrlData.publicUrl;
        }

        const now = new Date().toISOString();
        const userEmail = session?.user?.email;

        const { error } = await supabase
          .from('boluang_disaster_reports')
          .update({ 
            status: 'ดำเนินการเสร็จแล้ว',
            action_taken: actionText,
            resolved_image_url: resolvedImageUrl, 
            resolved_at: now,
            resolved_by: userEmail
          })
          .eq('id', reportId);

        if (error) throw error;

        Swal.fire({ icon: 'success', title: 'ปิดงานสำเร็จ!', text: 'ข้อมูลถูกบันทึกและลบออกจากแผนที่ประชาชนแล้ว', confirmButtonColor: '#10b981' });
        
        fetchActiveReports(false); // อัปเดตตารางใหม่ทันที (แบบโชว์ Loading นิดนึงเพื่อความมั่นใจ)
        
      } catch (error) {
        console.error(error);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้' });
      }
    }
  };

  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans">กำลังตรวจสอบสิทธิ์...</div>;
  }

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

  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans">
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

      <main className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
              <span>รายการแจ้งเหตุที่ต้องดำเนินการ</span>
              {/* 🟢 ไฟสถานะกระพริบ แสดงว่าระบบทำงานและ Auto-refresh อยู่ */}
              <span className="relative flex h-2.5 w-2.5 ml-2 mt-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </h2>
            <p className="text-gray-400 mt-1 text-sm">เรียงลำดับจากรายการใหม่ล่าสุด (อัปเดตอัตโนมัติทุก 15 วินาที)</p>
          </div>
          
          {/* ปุ่มรีเฟรชมือ (เผื่อแอดมินใจร้อน) */}
          <button onClick={() => fetchActiveReports(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm flex items-center space-x-2 border border-gray-700 transition-colors">
            <span>🔄</span> <span>รีเฟรชข้อมูล</span>
          </button>
        </div>

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
                      
                      {/* 📸 แสดงภาพขนาดย่อ และข้อความ */}
                      <td className="p-4">
                        <div className="flex items-start space-x-3">
                          {report.image_url && (
                            <div 
                              className="flex-shrink-0 cursor-pointer relative group"
                              onClick={() => handleViewImage(report.image_url)}
                            >
                              <img 
                                src={report.image_url} 
                                alt="รูปแจ้งเหตุ" 
                                className="w-16 h-16 md:w-20 md:h-14 object-cover rounded-lg border border-gray-600 group-hover:border-blue-400 transition-colors" 
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                <span className="text-white text-xs drop-shadow-md">🔍</span>
                              </div>
                            </div>
                          )}
                          <div>
                            <div className="text-sm text-gray-200 line-clamp-2 max-w-xs">{report.description}</div>
                            <div className="text-xs text-gray-500 mt-1">👤 {report.reporter_name} ({report.reporter_role})</div>
                          </div>
                        </div>
                      </td>

                      {/* 🚀 ชุดปุ่มจัดการ (เปิดแผนที่ / นำทาง / ปิดจ๊อบ) */}
                      <td className="p-4 align-middle text-right">
                        <div className="flex items-center justify-end space-x-2">
                          
                          {/* 📍 ปุ่มเปิดพิกัด (Google Maps) */}
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            title="เปิดพิกัดใน Google Maps"
                            className="w-8 h-8 bg-[#0f172a] hover:bg-[#1e293b] border border-[#38bdf8] text-[#38bdf8] rounded-lg flex items-center justify-center transition-all shadow-sm hover:shadow-[#38bdf8]/30 group"
                          >
                            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </a>

                          {/* 🚗 ปุ่มนำทาง (Directions) */}
                          <a 
                            href={`https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            title="นำทางไปยังจุดเกิดเหตุ"
                            className="w-8 h-8 bg-[#0f172a] hover:bg-[#1e293b] border border-[#2dd4bf] text-[#2dd4bf] rounded-lg flex items-center justify-center transition-all shadow-sm hover:shadow-[#2dd4bf]/30 group"
                          >
                            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                          </a>

                          {/* ✅ ปุ่มปิดจ๊อบ */}
                          <button 
                            onClick={() => handleCloseJob(report.id, report.risk_type)}
                            title="บันทึกและปิดงาน"
                            className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/50 hover:border-emerald-500 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] whitespace-nowrap flex items-center space-x-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>ปิดจ๊อบ</span>
                          </button>

                        </div>
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
