'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Swal from 'sweetalert2';

// 🌟 ตั้งค่า Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AdminPanel() {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  // State สำหรับ Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // State สำหรับข้อมูลแจ้งเหตุ & Tabs
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending');
  const [reports, setReports] = useState<any[]>([]);
  const [resolvedReports, setResolvedReports] = useState<any[]>([]);
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

  // 📥 ดึงข้อมูลเมื่อ Login สำเร็จ หรือเปลี่ยน Tab
  useEffect(() => {
    if (session) {
      if (activeTab === 'pending') fetchActiveReports(false);
      else fetchResolvedReports(false);

      const intervalId = setInterval(() => {
        if (activeTab === 'pending') fetchActiveReports(true);
        else fetchResolvedReports(true);
      }, 15000); 

      return () => clearInterval(intervalId);
    }
  }, [session, activeTab]);

  const fetchActiveReports = async (isSilent = false) => {
    if (!isSilent) setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('boluang_disaster_reports')
        .select('*')
        .neq('status', 'ดำเนินการเสร็จแล้ว') 
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setReports(data);
    } catch (error) {
      console.error('Error fetching pending:', error);
    } finally {
      if (!isSilent) setLoadingData(false);
    }
  };

  const fetchResolvedReports = async (isSilent = false) => {
    if (!isSilent) setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('boluang_disaster_reports')
        .select('*')
        .eq('status', 'ดำเนินการเสร็จแล้ว') 
        .order('resolved_at', { ascending: false });

      if (error) throw error;
      if (data) setResolvedReports(data);
    } catch (error) {
      console.error('Error fetching resolved:', error);
    } finally {
      if (!isSilent) setLoadingData(false);
    }
  };

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleViewImage = (imageUrl: string) => {
    Swal.fire({
      imageUrl: imageUrl,
      imageAlt: 'ภาพแจ้งเหตุ',
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

  // ✅ ฟังก์ชันช่วยอัปโหลดไฟล์ (ลดความซ้ำซ้อนของโค้ด)
  const uploadImage = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `resolved-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `reports/${fileName}`;
    const { error } = await supabase.storage.from('disaster_images').upload(filePath, file);
    if (error) throw error;
    const { data } = supabase.storage.from('disaster_images').getPublicUrl(filePath);
    return data.publicUrl;
  };

  // ✅ ฟังก์ชัน "ปิดจ๊อบ" อัจฉริยะ (อัปเกรด 2 รูป)
  const handleCloseJob = async (reportId: string, currentRiskType: string) => {
    const { value: formValues } = await Swal.fire({
      title: '📝 บันทึกการปฏิบัติงาน',
      html: `
        <div class="text-left mb-2 text-sm text-gray-700">ระบุรายละเอียดการแก้ไขปัญหา <b>${currentRiskType}</b></div>
        <textarea id="swal-input-text" class="swal2-textarea" placeholder="เช่น นำรถแบคโฮเข้าเคลียร์พื้นที่เรียบร้อย..." style="margin: 0 auto 15px auto; width: 100%; font-size: 14px;"></textarea>
        
        <div class="text-left mb-2 text-sm font-bold text-gray-700">📷 ภาพที่ 1 (ผลการปฏิบัติงาน)</div>
        <input type="file" id="swal-input-file-1" class="swal2-file" accept="image/*" style="display: flex; width: 100%; font-size: 14px; margin: 0 auto 15px auto;">

        <div class="text-left mb-2 text-sm font-bold text-gray-700">📷 ภาพที่ 2 (มุมมองอื่น - ถ้ามี)</div>
        <input type="file" id="swal-input-file-2" class="swal2-file" accept="image/*" style="display: flex; width: 100%; font-size: 14px; margin: 0 auto;">
      `,
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#ef4444',
      confirmButtonText: 'บันทึกและปิดงาน',
      cancelButtonText: 'ยกเลิก',
      preConfirm: () => {
        const text = (document.getElementById('swal-input-text') as HTMLTextAreaElement).value;
        const file1 = (document.getElementById('swal-input-file-1') as HTMLInputElement).files?.[0] || null;
        const file2 = (document.getElementById('swal-input-file-2') as HTMLInputElement).files?.[0] || null;

        if (!text) {
          Swal.showValidationMessage('กรุณาระบุรายละเอียดการดำเนินการครับ!');
          return false;
        }
        return { text, file1, file2 };
      }
    });

    if (formValues) {
      const { text: actionText, file1, file2 } = formValues;

      try {
        Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        let url1 = null;
        let url2 = null;

        // อัปโหลดรูปภาพ (ทำทีละไฟล์)
        if (file1) url1 = await uploadImage(file1);
        if (file2) url2 = await uploadImage(file2);

        const now = new Date().toISOString();
        const userEmail = session?.user?.email;

        const { error } = await supabase
          .from('boluang_disaster_reports')
          .update({ 
            status: 'ดำเนินการเสร็จแล้ว',
            action_taken: actionText,
            resolved_image_url: url1, 
            resolved_image_url_2: url2, // บันทึกรูปที่ 2 ลงฐานข้อมูล
            resolved_at: now,
            resolved_by: userEmail
          })
          .eq('id', reportId);

        if (error) throw error;

        Swal.fire({ icon: 'success', title: 'ปิดงานสำเร็จ!', text: 'ข้อมูลถูกบันทึกและย้ายไปที่ประวัติการแก้ไขแล้ว', confirmButtonColor: '#10b981' });
        
        fetchActiveReports(false); 
        
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 space-y-4 md:space-y-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
              <span>{activeTab === 'pending' ? 'รายการแจ้งเหตุที่ต้องดำเนินการ' : 'ประวัติการแก้ไขปัญหา'}</span>
              <span className="relative flex h-2.5 w-2.5 ml-2 mt-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </h2>
            <p className="text-gray-400 mt-1 text-sm">อัปเดตข้อมูลอัตโนมัติทุก 15 วินาที</p>
          </div>
          
          <div className="flex space-x-2">
            <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700">
              <button 
                onClick={() => setActiveTab('pending')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === 'pending' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              >
                🚨 รอดำเนินการ
              </button>
              <button 
                onClick={() => setActiveTab('resolved')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === 'resolved' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              >
                ✅ ปิดงานแล้ว
              </button>
            </div>
            
            <button onClick={() => activeTab === 'pending' ? fetchActiveReports(false) : fetchResolvedReports(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm flex items-center space-x-2 border border-gray-700 transition-colors">
              <span>🔄</span>
            </button>
          </div>
        </div>

        <div className="bg-[#1e293b] rounded-xl border border-gray-700 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-800/50 border-b border-gray-700 text-sm font-semibold text-gray-300">
                  <th className="p-4 w-48">{activeTab === 'pending' ? 'วันเวลาที่แจ้ง' : 'วันเวลาที่ปิดงาน'}</th>
                  <th className="p-4 w-56">ประเภทภัย / พื้นที่</th>
                  {activeTab === 'pending' && <th className="p-4 text-center">ระดับ</th>}
                  <th className="p-4">{activeTab === 'pending' ? 'รายละเอียดผู้แจ้ง' : 'ผลการดำเนินการ'}</th>
                  {activeTab === 'resolved' && <th className="p-4">ผู้ดำเนินการ</th>}
                  {activeTab === 'pending' && <th className="p-4 text-right">การจัดการ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {loadingData ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td></tr>
                ) : (activeTab === 'pending' ? reports : resolvedReports).length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400 text-lg">
                    {activeTab === 'pending' ? '✨ ยอดเยี่ยม! ขณะนี้ไม่มีเหตุการณ์ที่ต้องดำเนินการ' : 'ยังไม่มีประวัติการปิดงาน'}
                  </td></tr>
                ) : (
                  (activeTab === 'pending' ? reports : resolvedReports).map((report) => (
                    <tr key={report.id} className="hover:bg-gray-800/30 transition-colors">
                      
                      <td className="p-4 text-sm font-mono text-gray-300 align-top">
                        {new Date(activeTab === 'pending' ? report.created_at : report.resolved_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} น.
                      </td>
                      
                      <td className="p-4 align-top">
                        <div className="font-bold text-white">{report.risk_type}</div>
                        <div className="text-sm text-blue-400 mt-0.5 flex items-center">
                          📍 {report.village_name}
                        </div>
                      </td>

                      {activeTab === 'pending' && (
                        <td className="p-4 text-center align-top">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${report.severity_level >= 4 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : report.severity_level === 3 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>
                            ระดับ {report.severity_level}
                          </span>
                        </td>
                      )}
                      
                      <td className="p-4 align-top">
                        {activeTab === 'pending' ? (
                          <div className="flex items-start space-x-3">
                            {report.image_url && (
                              <div className="flex-shrink-0 cursor-pointer relative group" onClick={() => handleViewImage(report.image_url)}>
                                <img src={report.image_url} alt="รูปแจ้งเหตุ" className="w-16 h-16 object-cover rounded-lg border border-gray-600 group-hover:border-blue-400 transition-colors" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center"><span className="text-white text-xs drop-shadow-md">🔍</span></div>
                              </div>
                            )}
                            <div>
                              <div className="text-sm text-gray-200 line-clamp-2 max-w-sm cursor-help" title={report.description}>{report.description}</div>
                              <div className="text-xs text-gray-500 mt-1">👤 {report.reporter_name} ({report.reporter_role})</div>
                            </div>
                          </div>
                        ) : (
                          // ✅ ส่วนแสดงรูปภาพ 2 รูป ในสถานะปิดงานแล้ว
                          <div className="flex flex-col space-y-2">
                            <div className="flex space-x-2">
                              {report.resolved_image_url && (
                                <div className="flex-shrink-0 cursor-pointer relative group" onClick={() => handleViewImage(report.resolved_image_url)}>
                                  <img src={report.resolved_image_url} alt="รูปผลการแก้ไข 1" className="w-16 h-16 object-cover rounded-lg border border-emerald-600 group-hover:border-emerald-400 transition-colors" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center"><span className="text-white text-xs drop-shadow-md">🔍</span></div>
                                </div>
                              )}
                              {report.resolved_image_url_2 && (
                                <div className="flex-shrink-0 cursor-pointer relative group" onClick={() => handleViewImage(report.resolved_image_url_2)}>
                                  <img src={report.resolved_image_url_2} alt="รูปผลการแก้ไข 2" className="w-16 h-16 object-cover rounded-lg border border-emerald-600 group-hover:border-emerald-400 transition-colors" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center"><span className="text-white text-xs drop-shadow-md">🔍</span></div>
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="text-sm text-emerald-300 font-medium whitespace-pre-line">{report.action_taken || 'ไม่มีรายละเอียดเพิ่มเติม'}</div>
                              <div className="text-[11px] text-gray-500 mt-2">อ้างอิง: {report.tracking_code}</div>
                            </div>
                          </div>
                        )}
                      </td>

                      {activeTab === 'resolved' && (
                        <td className="p-4 align-top">
                          <div className="text-sm text-gray-300 break-all">{report.resolved_by || '-'}</div>
                        </td>
                      )}

                      {activeTab === 'pending' && (
                        <td className="p-4 align-top text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <a href={`https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`} target="_blank" rel="noopener noreferrer" title="เปิดพิกัดใน Google Maps" className="w-8 h-8 bg-[#0f172a] hover:bg-[#1e293b] border border-[#38bdf8] text-[#38bdf8] rounded-lg flex items-center justify-center transition-all shadow-sm group">
                              <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </a>
                            <a href={`https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`} target="_blank" rel="noopener noreferrer" title="นำทางไปยังจุดเกิดเหตุ" className="w-8 h-8 bg-[#0f172a] hover:bg-[#1e293b] border border-[#2dd4bf] text-[#2dd4bf] rounded-lg flex items-center justify-center transition-all shadow-sm group">
                              <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                            </a>
                            <button onClick={() => handleCloseJob(report.id, report.risk_type)} title="บันทึกและปิดงาน" className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/50 hover:border-emerald-500 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] whitespace-nowrap flex items-center space-x-1">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              <span>ปิดจ๊อบ</span>
                            </button>
                          </div>
                        </td>
                      )}
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
