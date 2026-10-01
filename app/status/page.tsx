'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import type { PublicReportStatus } from '@/lib/report-status/security';

type StatusResponse = { ok: true; report: PublicReportStatus } | {
  ok: false;
  code?: string;
  error: string;
  retryAfterSeconds?: number;
  receivedLength?: number;
};

const statusStyle = (status: string) => {
  if (status === 'ดำเนินการเสร็จแล้ว') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'กำลังดำเนินการ') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-blue-200 bg-blue-50 text-blue-800';
};

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'ยังไม่มีข้อมูลเวลา';

export default function StatusPage() {
  const [token, setToken] = useState('');
  const [report, setReport] = useState<PublicReportStatus | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchStatus = useCallback(async (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setIsSearching(true);
    setErrorMessage('');
    setReport(null);

    try {
      const response = await fetch('/api/report-status', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: normalized }),
      });
      const payload = await response.json() as StatusResponse;
      if (!response.ok || !payload.ok) {
        if (!payload.ok && payload.code === 'RATE_LIMITED' && payload.retryAfterSeconds) {
          throw new Error(`${payload.error} (ประมาณ ${Math.ceil(payload.retryAfterSeconds / 60)} นาที)`);
        }
        if (!payload.ok && payload.code === 'INVALID_TOKEN_FORMAT' && typeof payload.receivedLength === 'number') {
          throw new Error(`${payload.error} ระบบได้รับ ${payload.receivedLength} ตัวอักษร`);
        }
        throw new Error(payload.ok ? 'ไม่สามารถค้นหาคำร้องได้' : payload.error);
      }
      setReport(payload.report);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ระบบติดตามขัดข้องชั่วคราว กรุณาลองใหม่');
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const tokenFromUrl = fragment.get('token') || parameters.get('token') || parameters.get('code');
    const tokenFromStorage = localStorage.getItem('bl_latest_tracking_code');
    const initialToken = tokenFromUrl || tokenFromStorage;
    if (initialToken) {
      if (tokenFromUrl) window.history.replaceState({}, '', window.location.pathname);
      setToken(initialToken);
      void fetchStatus(initialToken);
    }
  }, [fetchStatus]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void fetchStatus(token);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-lg shadow-blue-200" aria-hidden="true">⌕</div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">ติดตามสถานะคำร้อง</h1>
          <p className="mt-2 text-sm text-slate-600">เทศบาลตำบลบ่อหลวง จังหวัดเชียงใหม่</p>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="lookup-title">
          <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
            <p className="font-bold">ใช้โทเคนจากสลิปหรือเปิดผ่าน QR Code</p>
            <p className="mt-1 text-xs text-blue-700">โทเคนเป็นกุญแจดูข้อมูลคำร้อง กรุณาเก็บเป็นความลับและไม่เผยแพร่ในที่สาธารณะ</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label id="lookup-title" htmlFor="tracking-token" className="mb-2 block text-sm font-extrabold text-slate-800">โทเคนติดตามคำร้อง</label>
              <input
                id="tracking-token"
                type="text"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="BL_xxxxxxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="token-help"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3.5 font-mono text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
              <p id="token-help" className="mt-2 text-xs text-slate-500">รหัส 6 หลักแบบเดิมถูกยกเลิกเพื่อป้องกันการคาดเดาคำร้อง หากมีรหัสเดิมให้ติดต่อเทศบาล</p>
            </div>
            <button
              type="submit"
              disabled={isSearching || !token.trim()}
              className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 font-bold text-white shadow-md shadow-blue-100 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {isSearching ? 'กำลังตรวจสอบอย่างปลอดภัย…' : 'ตรวจสอบสถานะ'}
            </button>
          </form>

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm font-bold text-rose-700" role="alert">
              {errorMessage}
            </div>
          )}
        </section>

        {report && (
          <article className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">เลขอ้างอิงแบบปกปิด</p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-800">{report.reference}</p>
              </div>
              <span className={`rounded-full border px-4 py-2 text-sm font-extrabold ${statusStyle(report.status)}`}>{report.status}</span>
            </div>

            <div className="space-y-6 p-5 sm:p-7">
              <section className="grid gap-3 sm:grid-cols-2" aria-label="ข้อมูลสาธารณะของคำร้อง">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">ประเภทภัย</p><p className="mt-1 font-extrabold text-slate-900">{report.riskType}</p></div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">พื้นที่ระดับหมู่บ้าน</p><p className="mt-1 font-extrabold text-slate-900">{report.villageName}</p></div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">ระดับความเร่งด่วน</p><p className="mt-1 font-extrabold text-slate-900">{report.severityLevel ? `ระดับ ${report.severityLevel}` : 'ไม่เปิดเผย'}</p></div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">รับเรื่องเมื่อ</p><p className="mt-1 font-semibold text-slate-800">{formatDate(report.createdAt)}</p></div>
              </section>

              <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4" aria-labelledby="public-update-title">
                <h2 id="public-update-title" className="text-sm font-extrabold text-blue-900">ข้อมูลความคืบหน้าที่เปิดเผยได้</h2>
                <p className="mt-2 text-sm leading-relaxed text-blue-800">{report.publicUpdate}</p>
                {report.resolvedAt && <p className="mt-2 text-xs font-semibold text-blue-700">ปิดงานเมื่อ {formatDate(report.resolvedAt)}</p>}
              </section>

              {(report.beforeImageUrl || report.afterImageUrl) && (
                <section aria-labelledby="evidence-title">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <h2 id="evidence-title" className="text-sm font-extrabold text-slate-800">ภาพประกอบการดำเนินงาน</h2>
                    <p className="text-[11px] text-slate-500">ลิงก์ภาพมีอายุชั่วคราว 5 นาที</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {report.beforeImageUrl && <figure><img src={report.beforeImageUrl} alt="ภาพเหตุการณ์ก่อนดำเนินการ" className="aspect-video w-full rounded-2xl border border-slate-200 object-cover" /><figcaption className="mt-2 text-xs font-bold text-slate-600">ก่อนดำเนินการ</figcaption></figure>}
                    {report.afterImageUrl && <figure><img src={report.afterImageUrl} alt="ภาพผลหลังดำเนินการ" className="aspect-video w-full rounded-2xl border border-emerald-200 object-cover" /><figcaption className="mt-2 text-xs font-bold text-emerald-700">หลังดำเนินการ</figcaption></figure>}
                  </div>
                </section>
              )}

              <div className="rounded-2xl border border-slate-200 p-4 text-xs leading-relaxed text-slate-600">
                เพื่อคุ้มครองผู้แจ้ง หน้านี้ไม่แสดงชื่อผู้แจ้ง เบอร์ติดต่อ ที่อยู่ พิกัดละเอียด หรือข้อความเหตุการณ์ฉบับเต็ม
              </div>
            </div>
          </article>
        )}

        <nav className="mt-6 flex flex-wrap justify-center gap-3 text-sm font-bold" aria-label="ลิงก์ที่เกี่ยวข้อง">
          <Link href="/report" prefetch={false} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-blue-700 hover:bg-blue-50">แจ้งเหตุใหม่</Link>
          <Link href="/" prefetch={false} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 hover:bg-slate-100">กลับหน้าหลัก GIS</Link>
        </nav>
      </div>
    </main>
  );
}
