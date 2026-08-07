'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// 🌟 ตั้งค่า Supabase 
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvtjjhvvtaswzhwhowlj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dGpqaHZ2dGFzd3pod2hvd2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDA3NjcsImV4cCI6MjA5MjExNjc2N30.Jjqi1LWgxEgpT2nBdjuNyoLxEP_VQcKf3GEbIYKPI8Y';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function StatusPage() {
  const [trackingCode, setTrackingCode] = useState('');
  const [reportData, setReportData] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 🚀 ฟังก์ชันค้นหาข้อมูล (แยกออกมาเพื่อให้เรียกใช้แบบอัตโนมัติได้)
  const fetchStatusData = useCallback(async (codeToSearch: string) => {
    if (!codeToSearch.trim()) return;
    
    setIsSearching(true);
    setErrorMsg('');
    setReportData(null);

    try {
      const { data, error } = await supabase
        .from('boluang_disaster_reports')
        .select('*')
        .eq('tracking_code', codeToSearch.trim().toUpperCase())
        .single();

      if (error) throw error;
      if (data) {
        setReportData(data);
      } else {
        setErrorMsg('ไม่พบข้อมูลคำร้อง กรุณาตรวจสอบหมายเลขอีกครั้ง');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('ไม่พบข้อมูลคำร้อง หรือรหัสไม่ถูกต้อง');
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 🧠 เวทมนตร์: ทำงานทันทีเมื่อเปิดหน้านี้
  useEffect(() => {
    // 1. ลองอ่านรหัสจากการสแกน QR Code (URL Parameter)
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('code');

    // 2. ลองอ่านรหัสที่จำไว้ในเครื่อง (Local Storage)
    const codeFromStorage = localStorage.getItem('bl_latest_tracking_code');

    // ถ้ามีรหัสจาก QR ให้ใช้ QR ก่อน (เพราะ อสม. อาจจะสแกนของคนอื่น) ถ้าไม่มีให้ใช้ของในเครื่องตัวเอง
    const initialCode = codeFromUrl || codeFromStorage;

    if (initialCode) {
      setTrackingCode(initialCode);
      fetchStatusData(initialCode); // สั่งค้นหาข้อมูลอัตโนมัติทันที!
    }
  }, [fetchStatusData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStatusData(trackingCode);
  };

  const getStatusColor = (status: string) => {
    if (status === 'ดำเนินการเสร็จแล้ว') return 'bg-green-100 text-green-700 border-green-200';
    if (status === 'กำลังดำเนินการ') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-blue-100 text-blue-700 border-blue-200'; 
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4 font-sans">
      
      <div className="w-full max-w-lg mb-8 flex flex-col items-center">
        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-lg mb-4 text-2xl">🔍</div>
        <h1 className="text-2xl font-bold text-gray-800">ตรวจสอบสถานะคำร้อง</h1>
        <p className="text-sm text-gray-500 mt-2 text-center">ระบบสารสนเทศทางภูมิศาสตร์ ต.บ่อหลวง</p>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <form onSubmit={handleSearch} className="flex flex-col space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">หมายเลขติดตามคำร้อง (Tracking Code)</label>
            <input 
              type="text" 
              placeholder="เช่น BL-123456" 
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              className="w-full border border-gray-300 rounded-xl p-3.5 text-gray-700 focus:ring-blue-500 focus:border-blue-500 uppercase tracking-widest text-center font-bold outline-none transition-all bg-gray-50 focus:bg-white"
            />
          </div>
          <button 
            type="submit" 
            disabled={isSearching || !trackingCode}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex justify-center items-center space-x-2 disabled:bg-gray-300"
          >
            {isSearching ? <span className="animate-spin">⏳</span> : <span>ค้นหาข้อมูล</span>}
          </button>
        </form>

        {errorMsg && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-center text-sm font-bold text-red-600">
            ❌ {errorMsg}
          </div>
        )}
      </div>

      {reportData && (
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <span className="text-xs font-bold text-gray-500">ข้อมูลคำร้อง</span>
            <span className="font-mono text-sm font-bold text-gray-800 bg-white px-3 py-1 rounded-lg border shadow-sm">{reportData.tracking_code}</span>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="text-center">
              <span className={`px-4 py-2 rounded-full border text-sm font-bold shadow-sm ${getStatusColor(reportData.status || 'รับเรื่องแล้ว')}`}>
                สถานะ: {reportData.status || 'รับเรื่องแล้ว'}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 font-medium">ประเภทภัย:</span><span className="font-bold text-gray-800">{reportData.risk_type}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 font-medium">พื้นที่เกิดเหตุ:</span><span className="font-bold text-gray-800">{reportData.village_name}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 font-medium">ระดับความรุนแรง:</span><span className="font-bold text-red-600">ระดับ {reportData.severity_level}</span>
              </div>
              <div className="flex flex-col border-b pb-2">
                <span className="text-gray-500 font-medium mb-1">รายละเอียด:</span><span className="text-gray-700 bg-gray-50 p-3 rounded-lg border">{reportData.description}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 font-medium">วันที่แจ้ง:</span><span className="text-gray-700">{new Date(reportData.created_at).toLocaleString('th-TH')}</span>
              </div>
            </div>

            {reportData.image_url && (
              <div className="mt-4">
                <span className="text-xs font-bold text-gray-500 block mb-2">รูปภาพประกอบ:</span>
                <img src={reportData.image_url} alt="Disaster Image" className="w-full h-auto max-h-64 object-cover rounded-xl border shadow-sm" />
              </div>
            )}
          </div>
          
          <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-center space-x-4">
            <a href="/report" className="text-blue-600 font-bold text-sm hover:underline flex items-center">
              ← กลับไปแจ้งเหตุใหม่
            </a>
          </div>
        </div>
      )}

    </div>
  );
}
