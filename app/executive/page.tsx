'use client';
import React, { useState, useEffect } from 'react';

export default function ExecutiveDashboard() {
  const [aiReport, setAiReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAndAnalyzeData = async () => {
      setIsLoading(true);
      try {
        // 📡 1. ดึงข้อมูล 2 แหล่งพร้อมกัน (ONWR ปัจจุบัน + Open-Meteo พยากรณ์ล่วงหน้า 3 วัน)
        const lat = 18.1633;
        const lng = 98.3744;
        
        const [onwrRes, forecastRes] = await Promise.allSettled([
          fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum,windspeed_10m_max,weathercode&timezone=Asia%2FBangkok&forecast_days=3`)
        ]);

        // 🧠 2. เตรียมข้อมูลให้ AI วิเคราะห์
        let currentRain = 0;
        let forecastData = null;

        if (onwrRes.status === 'fulfilled') {
            const onwrJson = await onwrRes.value.json();
            // ค้นหาสถานีใกล้บ่อหลวง (สมมติว่าดึงค่าฝนเฉลี่ยหรือสถานีที่ใกล้ที่สุด)
            // ใน MVP นี้เราจำลองค่าสูงสุดที่พบในโซนเชียงใหม่/ฮอด
            currentRain = 15.5; // (จำลองค่าจาก ONWR)
        }

        if (forecastRes.status === 'fulfilled') {
            const forecastJson = await forecastRes.value.json();
            forecastData = forecastJson.daily;
        }

        // 🤖 3. ตรรกะปัญญาประดิษฐ์ (Rule-based AI Engine) สำหรับประเมินและสั่งการ
        let status = 'NORMAL'; // NORMAL, WARNING, CRITICAL
        let executiveSummary = 'สถานการณ์ปกติ ไม่มีแนวโน้มภัยพิบัติรุนแรงในพื้นที่';
        let recommendedActions = [
            'ติดตามรายงานสถานการณ์ประจำวันตามปกติ',
            'เตรียมความพร้อมระบบสื่อสารและเจ้าหน้าที่เวรยาม'
        ];

        // วิเคราะห์พยากรณ์ล่วงหน้า (Windy/ECMWF Model)
        const tomorrowRain = forecastData?.precipitation_sum[1] || 0;
        const windMax = forecastData?.windspeed_10m_max[1] || 0;

        if (currentRain > 50 || tomorrowRain > 50) {
            status = 'CRITICAL';
            executiveSummary = `วิกฤต: พบฝนตกหนักสะสม (${currentRain} มม.) และโมเดลพยากรณ์ชี้ว่าพรุ่งนี้จะมีฝนตกเพิ่มอีก ${tomorrowRain} มม. เสี่ยงดินถล่มสูงมาก!`;
            recommendedActions = [
                '🚨 สั่งการอพยพประชาชนในพื้นที่เสี่ยง (หมู่บ้านตีนเขา)',
                'เตรียมเครื่องจักรกลหนัก (แบ็คโฮ) สแตนด์บายเปิดทางน้ำ',
                'เปิดศูนย์พักพิงชั่วคราวที่โรงเรียนบ้านบ่อหลวง ทันที'
            ];
        } else if (tomorrowRain > 20 || windMax > 40) {
            status = 'WARNING';
            executiveSummary = `เฝ้าระวัง: พยากรณ์ล่วงหน้าพบกลุ่มฝน/ลมแรงกำลังเคลื่อนเข้าพื้นที่ (ความเร็วลม ${windMax} กม./ชม.) เสี่ยงต้นไม้ล้มทับเสาไฟฟ้า`;
            recommendedActions = [
                'แจ้งเตือนกำนัน/ผู้ใหญ่บ้าน ให้ประกาศหอกระจายข่าวเฝ้าระวัง 24 ชม.',
                'ประสานการไฟฟ้าฯ สแตนด์บายชุดซ่อมบำรุง',
                'ตรวจสอบระดับน้ำในลำห้วยสาธารณะ'
            ];
        }

        // 4. บันทึกผลลัพธ์เพื่อแสดงผล
        setAiReport({ status, currentRain, tomorrowRain, windMax, executiveSummary, recommendedActions });
        
      } catch (error) {
        console.error("AI Analysis failed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndAnalyzeData();
  }, []);

  if (isLoading) return <div className="flex h-screen items-center justify-center text-white bg-[#0b132b]">กำลังวิเคราะห์ข้อมูล...</div>;
  if (!aiReport) return null;

  // ตั้งค่าสีตามระดับวิกฤต
  const theme = {
      NORMAL: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', icon: '✅' },
      WARNING: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', icon: '⚠️' },
      CRITICAL: { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50', icon: '🚨' }
  }[aiReport.status as 'NORMAL' | 'WARNING' | 'CRITICAL'];

  return (
    <div className="min-h-screen bg-[#050b14] p-6 text-white font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="border-b border-gray-800 pb-4">
          <h1 className="text-2xl font-bold text-white tracking-wide">Executive Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">ระบบวิเคราะห์ข้อมูลและสนับสนุนการตัดสินใจ (Decision Support System)</p>
        </div>

        {/* AI Summary Card */}
        <div className={`border ${theme.border} ${theme.bg} rounded-2xl p-6 shadow-lg backdrop-blur-sm animate-fade-in-api`}>
          <div className="flex items-center space-x-3 mb-4">
            <span className="text-3xl">{theme.icon}</span>
            <div>
              <h2 className={`text-lg font-bold ${theme.color}`}>บทวิเคราะห์สถานการณ์ (AI Executive Summary)</h2>
              <span className="text-xs text-gray-300 font-mono">อ้างอิงข้อมูล: ONWR & Global Forecast Models</span>
            </div>
          </div>
          <p className="text-white text-[16px] leading-relaxed font-semibold bg-[#0f172a]/50 p-4 rounded-xl border border-gray-700">
            {aiReport.executiveSummary}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ข้อมูลดิบ (Data Evidence) */}
          <div className="bg-[#0b132b] border border-gray-800 rounded-2xl p-6">
            <h3 className="text-sm text-gray-400 font-bold mb-4 uppercase tracking-widest border-b border-gray-800 pb-2">ข้อมูลเชิงประจักษ์ (Data Evidence)</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-300 text-sm">ฝนสะสม 24 ชม. (ONWR)</span>
                <span className="text-[#38bdf8] font-bold">{aiReport.currentRain} มม.</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300 text-sm">พยากรณ์ฝนพรุ่งนี้ (Model)</span>
                <span className="text-yellow-400 font-bold">{aiReport.tomorrowRain} มม.</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300 text-sm">พยากรณ์ลมสูงสุด</span>
                <span className="text-white font-bold">{aiReport.windMax} กม./ชม.</span>
              </div>
            </div>
          </div>

          {/* ข้อเสนอแนะการสั่งการ */}
          <div className="bg-[#0f172a] border border-[#38bdf8]/30 rounded-2xl p-6 shadow-[0_0_15px_rgba(56,189,248,0.1)]">
            <h3 className="text-sm text-[#38bdf8] font-bold mb-4 uppercase tracking-widest border-b border-[#1e293b] pb-2">คำแนะนำการสั่งการ (Action Required)</h3>
            <ul className="space-y-3">
              {aiReport.recommendedActions.map((action: string, idx: number) => (
                <li key={idx} className="flex items-start space-x-2 text-sm text-gray-200">
                  <span className="text-[#38bdf8] mt-0.5">👉</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
