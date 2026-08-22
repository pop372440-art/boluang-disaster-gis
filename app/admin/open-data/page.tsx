'use client';

import React from 'react';
import Link from 'next/link';

export default function OpenDataPage() {
  // ฟังก์ชันจำลองการดาวน์โหลดไฟล์
  const handleDownload = (filename: string) => {
    alert(`กำลังเตรียมไฟล์: ${filename}\n(ในระบบจริงจะเริ่มดาวน์โหลดไฟล์ CSV/GeoJSON)`);
  };

  return (
    <div className="min-h-screen bg-[#050b14] text-white font-sans selection:bg-[#38bdf8] selection:text-white pb-20">
      
      {/* 🚀 Header */}
      <header className="bg-[#0b132b] px-6 py-5 flex items-center justify-between border-b border-[#1e293b] sticky top-0 z-50">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-[#0284c7] to-[#2563eb] rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              Open Data Portal
            </h1>
            <h2 className="text-sm font-bold text-gray-400">ศูนย์ดาวน์โหลดข้อมูลเปิด เทศบาลตำบลบ่อหลวง</h2>
          </div>
        </div>
        
        <Link href="/" className="bg-[#1e293b] hover:bg-[#334155] border border-gray-700 px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center space-x-2">
          <span>⬅️</span> <span className="hidden sm:inline">กลับหน้าหลัก</span>
        </Link>
      </header>

      {/* 📊 Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        
        {/* กล่องคำอธิบาย */}
        <div className="bg-[#0f172a] border border-blue-900/50 rounded-2xl p-6 mb-8 shadow-lg">
          <h3 className="text-blue-400 font-bold text-lg mb-2 flex items-center">
            <span className="mr-2">⚖️</span> นโยบายการใช้ข้อมูลสาธารณะ (Open License)
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            ข้อมูลทั้งหมดในหน้านี้เป็นข้อมูลเปิด (Open Data) ภายใต้การดูแลของเทศบาลตำบลบ่อหลวง ประชาชน นักวิจัย และนักพัฒนาซอฟต์แวร์ สามารถนำไปใช้งาน ประมวลผล หรือพัฒนาต่อยอดได้ฟรี 
            <br/><span className="text-emerald-400 font-medium">หมายเหตุ: ข้อมูลส่วนบุคคล (ชื่อ, เบอร์โทรศัพท์) ได้ถูกลบและปกปิดแล้ว ตามหลัก พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</span>
          </p>
        </div>

        {/* รายการชุดข้อมูล (Datasets) */}
        <div className="space-y-4">
          
          {/* Dataset 1 */}
          <div className="bg-[#1e293b] border border-[#334155] hover:border-[#38bdf8]/50 transition-all rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <span className="text-2xl">🚨</span>
                <h4 className="text-white font-bold text-base">สถิติการรับแจ้งเหตุสาธารณภัย (Citizen Reports)</h4>
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-500/30">PDPA Compliant</span>
              </div>
              <p className="text-gray-400 text-sm ml-9">ข้อมูลประวัติการแจ้งเหตุ น้ำท่วม ดินถล่ม ไฟป่า และปัญหาสิ่งแวดล้อม พร้อมพิกัดภูมิศาสตร์และสถานะการแก้ไข (ย้อนหลัง 1 ปี)</p>
            </div>
            <button onClick={() => handleDownload('bo_luang_incidents_2026.csv')} className="ml-9 md:ml-0 bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 border border-blue-400 flex-shrink-0">
              <span>📥</span><span>ดาวน์โหลด .CSV</span>
            </button>
          </div>

          {/* Dataset 2 */}
          <div className="bg-[#1e293b] border border-[#334155] hover:border-[#38bdf8]/50 transition-all rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <span className="text-2xl">🗺️</span>
                <h4 className="text-white font-bold text-base">พิกัดศูนย์พักพิงและจุดเสี่ยงภัยเชิงพื้นที่ (Spatial Data)</h4>
              </div>
              <p className="text-gray-400 text-sm ml-9">พิกัดทางภูมิศาสตร์ของจุดปลอดภัย ศูนย์พักพิงชั่วคราว และแนวเขตพื้นที่เสี่ยงดินถล่ม</p>
            </div>
            <button onClick={() => handleDownload('bo_luang_spatial_zones.geojson')} className="ml-9 md:ml-0 bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 border border-sky-400 flex-shrink-0">
              <span>📍</span><span>ดาวน์โหลด .GeoJSON</span>
            </button>
          </div>

          {/* Dataset 3 */}
          <div className="bg-[#1e293b] border border-[#334155] hover:border-[#38bdf8]/50 transition-all rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <span className="text-2xl">📊</span>
                <h4 className="text-white font-bold text-base">ผลสำรวจความต้องการชุมชน (Smart Environment V3)</h4>
              </div>
              <p className="text-gray-400 text-sm ml-9">สถิติสรุปภาพรวมความต้องการของประชาชนทั้ง 13 หมู่บ้าน ด้านการบริหารจัดการสิ่งแวดล้อมและสาธารณภัย (Aggregated Data)</p>
            </div>
            <button onClick={() => handleDownload('bo_luang_survey_v3_results.csv')} className="ml-9 md:ml-0 bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 border border-blue-400 flex-shrink-0">
              <span>📥</span><span>ดาวน์โหลด .CSV</span>
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
