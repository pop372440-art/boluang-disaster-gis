'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

// 🌟 ตั้งค่า Supabase (ดึงจาก Environment Variables ปลอดภัย 100%)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ ขาดการตั้งค่า Supabase Environment Variables');
}

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export default function ReportPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // 🕒 State สำหรับจัดการ Cooldown Timer
  const [cooldownTime, setCooldownTime] = useState(0);

  const [formData, setFormData] = useState({
    village_name: '',
    risk_type: '',
    description: '',
    severity_level: 3,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. ส่งข้อมูลเข้า Supabase
      const { error } = await supabase
        .from('boluang_disaster_reports')
        .insert([
          {
            village_name: formData.village_name,
            risk_type: formData.risk_type,
            description: formData.description,
            severity_level: formData.severity_level,
            status: 'รับเรื่องแล้ว',
          }
        ]);

      if (error) throw error;

      // 2. แสดงสถานะสำเร็จและล้างฟอร์ม
      setSuccess(true);
      setFormData({ village_name: '', risk_type: '', description: '', severity_level: 3 });
      
      // 3. 🛡️ เริ่มระบบ Cooldown ล็อคปุ่ม 60 วินาที ป้องกันคนกดสแปม
      setCooldownTime(60);
      
      const timer = setInterval(() => {
        setCooldownTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0; // ปลดล็อคปุ่มเมื่อครบเวลา
          }
          return prev - 1;
        });
      }, 1000);

      // ซ่อนข้อความสำเร็จหลังผ่านไป 5 วินาที
      setTimeout(() => setSuccess(false), 5000);

    } catch (error) {
      console.error('Error submitting report:', error);
      alert('เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b132b] flex flex-col items-center py-10 px-4 font-sans">
      <div className="max-w-xl w-full bg-[#172033] p-8 rounded-3xl shadow-[0_0_40px_rgba(56,189,248,0.1)] border border-[#2d3748]">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 border border-blue-500/30">
            🚨
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">แจ้งเหตุสาธารณภัย</h1>
          <p className="text-sm text-gray-400">ศูนย์ข้อมูลสาธารณะ เทศบาลตำบลบ่อหลวง</p>
        </div>

        {/* ฟอร์มแจ้งเหตุ */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">หมู่บ้านที่เกิดเหตุ</label>
            <select 
              required
              value={formData.village_name}
              onChange={(e) => setFormData({...formData, village_name: e.target.value})}
              className="w-full bg-[#0f172a] text-white border border-[#334155] rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              <option value="">-- เลือกหมู่บ้าน --</option>
              <option value="บ้านแม่สะนาม">บ้านแม่สะนาม</option>
              <option value="บ้านพุย">บ้านพุย</option>
              <option value="บ้านขุน">บ้านขุน</option>
              <option value="บ้านแม่หืด">บ้านแม่หืด</option>
              <option value="บ้านเตียนอาง">บ้านเตียนอาง</option>
              <option value="บ้านบ่อหลวง">บ้านบ่อหลวง</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">ประเภทภัยพิบัติ</label>
            <select 
              required
              value={formData.risk_type}
              onChange={(e) => setFormData({...formData, risk_type: e.target.value})}
              className="w-full bg-[#0f172a] text-white border border-[#334155] rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              <option value="">-- เลือกประเภทภัย --</option>
              <option value="ไฟป่า / หมอกควัน">ไฟป่า / หมอกควัน</option>
              <option value="น้ำป่าไหลหลาก / น้ำท่วม">น้ำป่าไหลหลาก / น้ำท่วม</option>
              <option value="ดินโคลนถล่ม / ดินสไลด์">ดินโคลนถล่ม / ดินสไลด์</option>
              <option value="ต้นไม้ล้มขวางทาง">ต้นไม้ล้มขวางทาง</option>
              <option value="อื่นๆ">อื่นๆ</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">รายละเอียดเบื้องต้น</label>
            <textarea 
              required
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="อธิบายเหตุการณ์ที่พบเห็น..."
              className="w-full bg-[#0f172a] text-white border border-[#334155] rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            ></textarea>
          </div>

          {success && (
            <div className="bg-emerald-900/40 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-xl text-sm text-center animate-pulse">
              ✅ ส่งข้อมูลแจ้งเหตุเรียบร้อยแล้ว เจ้าหน้าที่จะเร่งตรวจสอบโดยเร็วที่สุด
            </div>
          )}

          {/* 🛡️ ปุ่ม Submit ที่มีระบบ Cooldown ป้องกันสแปม */}
          <button 
            type="submit" 
            disabled={loading || cooldownTime > 0}
            className={`w-full font-bold py-4 rounded-xl transition-all shadow-lg flex justify-center items-center space-x-2
              ${(loading || cooldownTime > 0) 
                ? 'bg-[#334155] text-gray-400 cursor-not-allowed border border-[#475569]' 
                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white border border-blue-400/30 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]'
              }`}
          >
            {loading ? (
              <>
                <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                <span>กำลังประมวลผล...</span>
              </>
            ) : cooldownTime > 0 ? (
              <>
                <span>⏳</span>
                <span>กรุณารอ {cooldownTime} วินาที เพื่อแจ้งเหตุครั้งถัดไป</span>
              </>
            ) : (
              <>
                <span>📤</span>
                <span>ส่งข้อมูลแจ้งเหตุ</span>
              </>
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <Link href="/admin/dashboard" className="text-[12px] text-gray-500 hover:text-blue-400 underline underline-offset-4 transition-colors">
            กลับไปหน้า Dashboard ผู้บริหาร
          </Link>
        </div>

      </div>
    </div>
  );
}
