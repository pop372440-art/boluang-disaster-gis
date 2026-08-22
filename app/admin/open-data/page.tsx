'use client';

import React, { useState } from 'react';
import Link from 'next/link';
// สำคัญ: ต้องติดตั้ง @supabase/supabase-js
import { createClient } from '@supabase/supabase-js';

// กำหนดค่า Supabase (ใช้ Environment Variables)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function OpenDataPage() {
  const [isDownloading, setIsDownloading] = useState(false);

  // ----------------------------------------------------------------------
  // ฟังก์ชันที่ 1: ดึงข้อมูลจาก Supabase และแปลงเป็น CSV สดๆ (ปกปิดตัวตน - PDPA)
  // ----------------------------------------------------------------------
  const handleDownloadSupabaseCSV = async () => {
    setIsDownloading(true);
    try {
      // ดึงข้อมูลจากตาราง (ไม่เลือก reporter_name)
      const { data, error } = await supabase
        .from('boluang_disaster_reports')
        .select('id, created_at, reporter_role, risk_type, severity_level, description, latitude, longitude, village_name, status')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        alert('ไม่พบข้อมูลการแจ้งเหตุในระบบ');
        setIsDownloading(false);
        return;
      }

      // สร้าง Header สำหรับ CSV
      const headers = ['ID', 'วันที่แจ้งเหตุ', 'กลุ่มผู้แจ้ง', 'ประเภทภัย', 'ระดับความรุนแรง', 'รายละเอียด', 'ละติจูด', 'ลองจิจูด', 'หมู่บ้าน', 'สถานะ'];
      const csvRows = [headers.join(',')];

      // สร้างข้อมูลแต่ละบรรทัด
      data.forEach((row) => {
        const formattedDate = new Date(row.created_at).toLocaleString('th-TH');
        const cleanDesc = row.description ? `"${row.description.replace(/"/g, '""')}"` : '""';
        
        const rowData = [
          row.id,
          `"${formattedDate}"`,
          `"${row.reporter_role || ''}"`,
          `"${row.risk_type || ''}"`,
          row.severity_level || '',
          cleanDesc,
          row.latitude,
          row.longitude,
          `"${row.village_name || ''}"`,
          `"${row.status || ''}"`
        ];
        csvRows.push(rowData.join(','));
      });

      const csvString = csvRows.join('\n');
      
      // สร้างไฟล์และสั่งดาวน์โหลด (ใช้ BOM \uFEFF ให้ Excel อ่านภาษาไทยได้)
      const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `boluang_incidents_realtime_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error generating CSV:', error);
      alert('เกิดข้อผิดพลาดในการดึงข้อมูลจากระบบ');
    } finally {
      setIsDownloading(false);
    }
  };

  // ----------------------------------------------------------------------
  // ฟังก์ชันที่ 2: สร้างไฟล์ CSV ศูนย์พักพิง (Safe Zones) แบบ On-the-fly
  // ----------------------------------------------------------------------
  const handleDownloadSafeZonesCSV = () => {
    // ข้อมูลศูนย์พักพิงที่ฝังในระบบ
    const safeZonesData = [
      { id: 1, name: 'รพ.สต. บ่อหลวง (ศูนย์การแพทย์)', lat: 18.14913, lng: 98.35532, type: 'hospital' },
      { id: 2, name: 'เทศบาลตำบลบ่อหลวง (ศูนย์บัญชาการ)', lat: 18.14722, lng: 98.34933, type: 'shelter' },
      { id: 3, name: 'วัดบ่อหลวง (จุดอพยพรวมพล)', lat: 18.15199, lng: 98.35327, type: 'temple' },
      { id: 4, name: 'โรงเรียนบ้านบ่อหลวง (จุดพักพิงชั่วคราว)', lat: 18.15269, lng: 98.35439, type: 'school' },
      { id: 5, name: 'โรงเรียนบ้านแม่หืด (จุดพักพิงชั่วคราว)', lat: 18.21915, lng: 98.37122, type: 'school' },
      { id: 6, name: 'โรงเรียนบ้านวังตอง (จุดพักพิงชั่วคราว)', lat: 18.12107, lng: 98.35366, type: 'school' },
      { id: 7, name: 'โรงเรียนบ้านขุน (จุดพักพิงชั่วคราว)', lat: 18.10471, lng: 98.37400, type: 'school' },
      { id: 8, name: 'วัดบ่อสะแง๋ (จุดอพยพรวมพล)', lat: 18.15015, lng: 98.35515, type: 'temple' },
      { id: 9, name: 'โรงเรียนบ้านพุย (จุดพักพิงชั่วคราว)', lat: 18.03907, lng: 98.30002, type: 'school' },
      { id: 10, name: 'คริสตจักรบิ๊กบ้านพุย (จุดอพยพรวมพล)', lat: 18.03681, lng: 98.30693, type: 'church' },
      { id: 11, name: 'โรงเรียนบ้านนาฟ่อน (จุดพักพิงชั่วคราว)', lat: 18.08870, lng: 98.36053, type: 'school' },
      { id: 12, name: 'โรงเรียนบ้านกิ่วลม (จุดพักพิงชั่วคราว)', lat: 18.14027, lng: 98.36942, type: 'school' },
      { id: 13, name: 'วัดบ่อพะแวน (จุดอพยพรวมพล)', lat: 18.14681, lng: 98.35252, type: 'temple' },
      { id: 14, name: 'โรงเรียนบ้านแม่ลาย (จุดพักพิงชั่วคราว)', lat: 18.04770, lng: 98.36286, type: 'school' },
      { id: 15, name: 'โรงเรียนบ้านแม่ลายเหนือ (จุดพักพิงชั่วคราว)', lat: 18.06555, lng: 98.33780, type: 'school' },
      { id: 16, name: 'โรงเรียนบ้านเด่นอาวง (จุดพักพิงชั่วคราว)', lat: 18.03097, lng: 98.40366, type: 'school' },
      { id: 17, name: 'คริสตจักรเจริญธรรมห้วยบง (จุดอพยพรวมพล)', lat: 18.01215, lng: 98.43016, type: 'church' },
    ];

    const headers = ['ลำดับ', 'ชื่อสถานที่/จุดพักพิง', 'ละติจูด (Latitude)', 'ลองจิจูด (Longitude)', 'ประเภทสถานที่'];
    const csvRows = [headers.join(',')];

    safeZonesData.forEach(zone => {
      const row = [
        zone.id,
        `"${zone.name}"`, 
        zone.lat,
        zone.lng,
        `"${zone.type}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `boluang_safe_zones.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ----------------------------------------------------------------------
  // RENDER UI
  // ----------------------------------------------------------------------
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
        
        {/* กล่องคำอธิบายนโยบาย */}
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
          
          {/* Dataset 1: สถิติการแจ้งเหตุ (ดึงสดจาก Supabase) */}
          <div className="bg-[#1e293b] border border-[#334155] hover:border-[#38bdf8]/50 transition-all rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-[#38bdf8] text-[#0f172a] text-[9px] font-black px-2 py-0.5 rounded-bl-lg">LIVE API</div>
            <div>
              <div className="flex items-center space-x-3 mb-1 mt-1">
                <span className="text-2xl">🚨</span>
                <h4 className="text-white font-bold text-base">สถิติการรับแจ้งเหตุสาธารณภัย (Citizen Reports)</h4>
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-500/30">PDPA Compliant</span>
              </div>
              <p className="text-gray-400 text-sm ml-9">ข้อมูลประวัติการแจ้งเหตุถูกสร้างขึ้นใหม่แบบ Real-time จากระบบฐานข้อมูลกลาง พร้อมปกปิดข้อมูลผู้แจ้ง</p>
            </div>
            
            <button 
              onClick={handleDownloadSupabaseCSV} 
              disabled={isDownloading}
              className={`ml-9 md:ml-0 ${isDownloading ? 'bg-gray-600 border-gray-500' : 'bg-gradient-to-r from-[#0284c7] to-[#2563eb] hover:from-[#0369a1] hover:to-[#1d4ed8] border border-[#38bdf8]/50 shadow-[0_4px_12px_rgba(37,99,235,0.25)]'} text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center space-x-2 flex-shrink-0 min-w-[160px]`}
            >
              {isDownloading ? (
                <>
                  <span className="animate-spin text-xl">⏳</span><span>กำลังสร้างไฟล์...</span>
                </>
              ) : (
                <>
                  <span className="text-white text-lg">⬇️</span><span>ดาวน์โหลด CSV สด</span>
                </>
              )}
            </button>
          </div>

          {/* Dataset 2: ศูนย์พักพิง (ดึงสดจาก Array หน้าบ้าน) */}
          <div className="bg-[#1e293b] border border-[#334155] hover:border-[#10b981]/50 transition-all rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
             <div className="absolute top-0 right-0 bg-[#10b981] text-[#0f172a] text-[9px] font-black px-2 py-0.5 rounded-bl-lg">LIVE API</div>
            <div>
              <div className="flex items-center space-x-3 mb-1 mt-1">
                <span className="text-2xl">🏥</span>
                <h4 className="text-white font-bold text-base">พิกัดศูนย์พักพิงและจุดปลอดภัย (Safe Zones)</h4>
              </div>
              <p className="text-gray-400 text-sm ml-9">พิกัดสถานที่ ชื่อหมู่บ้าน ศูนย์การแพทย์ และจุดอพยพรวมพลในตำบลบ่อหลวง จำนวน 17 แห่ง</p>
            </div>
            <button 
              onClick={handleDownloadSafeZonesCSV} 
              className="ml-9 md:ml-0 bg-[#10b981] hover:bg-[#059669] text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 border border-emerald-400 flex-shrink-0 min-w-[160px]"
            >
              <span>📥</span><span>ดาวน์โหลด .CSV</span>
            </button>
          </div>

          {/* Dataset 3: ข้อมูลแผนที่แนวเขตตำบล (boluang.json) */}
          <div className="bg-[#1e293b] border border-[#334155] hover:border-[#38bdf8]/50 transition-all rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <span className="text-2xl">🗺️</span>
                <h4 className="text-white font-bold text-base">ข้อมูลแนวเขตตำบลบ่อหลวง (Boluang Boundary Data)</h4>
              </div>
              <p className="text-gray-400 text-sm ml-9">พิกัดภูมิศาสตร์แนวเขตตำบลบ่อหลวง (GeoJSON Format)</p>
            </div>
            <a 
              href="/geojson/boluang.json" 
              download="ข้อมูลแนวเขตตำบลบ่อหลวง.geojson" 
              className="ml-9 md:ml-0 bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 border border-sky-400 flex-shrink-0 min-w-[160px]"
            >
              <span>📍</span><span>ดาวน์โหลด GeoJSON</span>
            </a>
          </div>

          {/* Dataset 4: ข้อมูลพื้นที่เสี่ยงดินถล่ม (boluang_landslide_risk.json) */}
          <div className="bg-[#1e293b] border border-[#334155] hover:border-[#f43f5e]/50 transition-all rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <span className="text-2xl">⚠️</span>
                <h4 className="text-white font-bold text-base">พิกัดพื้นที่เสี่ยงภัยดินถล่ม (Landslide Risk Zones)</h4>
                <span className="bg-rose-500/20 text-rose-400 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-500/30">Hazard Data</span>
              </div>
              <p className="text-gray-400 text-sm ml-9">พิกัดทางภูมิศาสตร์ระบุแนวเขตพื้นที่เสี่ยงดินโคลนถล่มในเขตตำบลบ่อหลวง อ้างอิงจากกรมทรัพยากรธรณี (GeoJSON Format)</p>
            </div>
            <a 
              href="/geojson/boluang_landslide_risk.json" 
              download="ข้อมูลพื้นที่เสี่ยงดินถล่ม_กรมทรัพยากรธรณี.geojson" 
              className="ml-9 md:ml-0 bg-[#e11d48] hover:bg-[#be123c] text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 border border-rose-400 flex-shrink-0 min-w-[160px]"
            >
              <span>📍</span><span>ดาวน์โหลด GeoJSON</span>
            </a>
          </div>

          {/* Dataset 5: ข้อมูลแนวเขตหมู่บ้าน แผนที่ภาษี (block.json) */}
          <div className="bg-[#1e293b] border border-[#334155] hover:border-[#38bdf8]/50 transition-all rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <span className="text-2xl">🏘️</span>
                <h4 className="text-white font-bold text-base">ข้อมูลแนวเขตหมู่บ้าน จากแผนที่ภาษี (Village Boundary Data)</h4>
              </div>
              <p className="text-gray-400 text-sm ml-9">พิกัดทางภูมิศาสตร์ระบุแนวเขตหมู่บ้านและแปลงพื้นที่ (Block) อ้างอิงจากระบบแผนที่ภาษี (GeoJSON Format)</p>
            </div>
            <a 
              href="/geojson/block.json" 
              download="ข้อมูลแนวเขตหมู่บ้าน_แผนที่ภาษี.geojson" 
              className="ml-9 md:ml-0 bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 border border-blue-400 flex-shrink-0 min-w-[160px]"
            >
              <span>📍</span><span>ดาวน์โหลด GeoJSON</span>
            </a>
          </div>

        </div>
      </main>
    </div>
  );
}
