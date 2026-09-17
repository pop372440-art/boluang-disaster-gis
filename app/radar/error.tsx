'use client';

import { useEffect } from 'react';

export default function RadarError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({
      level: 'error',
      message: 'radar_error_boundary',
      error: error.message,
      digest: error.digest ?? null,
      timestamp: new Date().toISOString(),
    }));
  }, [error]);

  return (
    <main className="min-h-screen bg-[#111319] text-white flex items-center justify-center p-6">
      <section className="max-w-md w-full rounded-2xl border border-orange-500/50 bg-[#1A1D24] p-6 text-center shadow-2xl">
        <div className="text-3xl" aria-hidden="true">⚠️</div>
        <h1 className="mt-3 text-lg font-bold">หน้า Radar ทำงานผิดพลาด</h1>
        <p className="mt-2 text-sm text-slate-300">ระบบจะไม่ใช้ข้อมูลที่โหลดไม่สำเร็จสร้างคำเตือน กรุณาลองโหลดใหม่</p>
        <button onClick={reset} className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold hover:bg-blue-500">
          ลองอีกครั้ง
        </button>
      </section>
    </main>
  );
}
