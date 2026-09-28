'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  countBy,
  filterIncidents,
  isResolvedStatus,
  type DashboardFilters,
  type PublicIncident,
} from '@/lib/dashboard/public-dashboard';

type DashboardMetadata = {
  generatedAt: string;
  newestIncidentAt: string | null;
  source: string;
  dataType: string;
  refreshSeconds: number;
  rowLimit: number;
  truncated: boolean;
};

type DashboardResponse = {
  ok: boolean;
  error?: string;
  metadata?: DashboardMetadata;
  incidents?: PublicIncident[];
};

const EMPTY_FILTERS: DashboardFilters = {
  dateFrom: '',
  dateTo: '',
  village: '',
  riskType: '',
  status: '',
};

const PIE_COLORS = ['#38bdf8', '#f97316', '#10b981', '#a78bfa', '#f43f5e', '#facc15'];

const dateTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

function formatDateTime(value: string | null) {
  if (!value) return 'ยังไม่มีข้อมูล';
  return `${dateTimeFormatter.format(new Date(value))} น.`;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'th'));
}

function statusPresentation(status: string) {
  if (isResolvedStatus(status)) {
    return { label: 'เสร็จสิ้น', className: 'border-emerald-700 bg-emerald-950 text-emerald-300' };
  }
  if (status.includes('กำลัง') || status.includes('ระหว่าง')) {
    return { label: 'กำลังดำเนินการ', className: 'border-orange-700 bg-orange-950 text-orange-300' };
  }
  return { label: status, className: 'border-sky-700 bg-sky-950 text-sky-300' };
}

export default function PublicDashboard() {
  const [incidents, setIncidents] = useState<PublicIncident[]>([]);
  const [metadata, setMetadata] = useState<DashboardMetadata | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (manual = false, signal?: AbortSignal) => {
    if (manual) setRefreshing(true);
    try {
      const suffix = manual ? `?refresh=${Date.now()}` : '';
      const response = await fetch(`/api/dashboard${suffix}`, { signal, cache: 'no-store' });
      const result = await response.json() as DashboardResponse;
      if (!response.ok || !result.ok || !result.metadata || !result.incidents) {
        throw new Error(result.error || 'ไม่สามารถโหลดข้อมูลสรุปได้');
      }
      setIncidents(result.incidents);
      setMetadata(result.metadata);
      setError('');
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setError(loadError instanceof Error ? loadError.message : 'ไม่สามารถโหลดข้อมูลสรุปได้');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(false, controller.signal);
    const interval = window.setInterval(() => void loadDashboard(), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  const filtered = useMemo(() => filterIncidents(incidents, filters), [incidents, filters]);
  const resolved = useMemo(() => filtered.filter(item => isResolvedStatus(item.status)).length, [filtered]);
  const riskData = useMemo(() => countBy(filtered, 'riskType'), [filtered]);
  const villageData = useMemo(() => countBy(filtered, 'villageName').slice(0, 5), [filtered]);
  const villages = useMemo(() => uniqueSorted(incidents.map(item => item.villageName)), [incidents]);
  const riskTypes = useMemo(() => uniqueSorted(incidents.map(item => item.riskType)), [incidents]);
  const statuses = useMemo(() => uniqueSorted(incidents.map(item => item.status)), [incidents]);
  const hasFilters = Object.values(filters).some(Boolean);

  const updateFilter = (field: keyof DashboardFilters, value: string) => {
    setFilters(current => ({ ...current, [field]: value }));
  };

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#0b132b] text-white" aria-busy="true">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-sky-400 border-t-transparent" aria-hidden="true" />
        <p className="font-semibold text-sky-300" role="status">กำลังโหลดข้อมูลสรุปสถานการณ์…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-white">
      <header className="sticky top-0 z-40 border-b border-slate-700 bg-[#0f172a]/95 px-4 py-4 backdrop-blur-xl md:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-700 text-xl shadow-lg shadow-sky-500/20" aria-hidden="true">▥</div>
            <div>
              <h1 className="text-xl font-bold tracking-wide md:text-2xl">Public Dashboard</h1>
              <p className="text-xs text-sky-300 md:text-sm">สรุปข้อมูลการรับแจ้งเหตุสาธารณะ ตำบลบ่อหลวง</p>
            </div>
          </div>
          <Link href="/" className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-bold transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
            ← กลับหน้าแผนที่หลัก
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] space-y-7 px-4 py-7 md:px-10">
        <section className="rounded-2xl border border-sky-900/70 bg-sky-950/30 p-5" aria-labelledby="data-context-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="data-context-title" className="font-bold text-sky-200">สถานะและที่มาของข้อมูล</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                อัปเดตจากฐานข้อมูลทุกประมาณ 60 วินาที ไม่ใช่ระบบสั่งการหรือ dispatch สด
                ข้อมูลมาจากแบบฟอร์มประชาชนและสถานะที่เจ้าหน้าที่บันทึก
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                AI อาจช่วยเสนอประเภทภัยหรือข้อความในขั้นตอนแจ้งเหตุ แต่ระบบยังไม่ได้เก็บแหล่งที่มาระดับรายการ
                รายการในหน้านี้จึงไม่ถูกระบุว่าเป็นผลวิเคราะห์โดย AI
              </p>
            </div>
            <div className="text-left text-xs text-slate-300 md:text-right" aria-live="polite">
              <p>ดึงข้อมูลล่าสุด: <strong className="text-white">{formatDateTime(metadata?.generatedAt ?? null)}</strong></p>
              <p className="mt-1">เหตุล่าสุดในชุดข้อมูล: {formatDateTime(metadata?.newestIncidentAt ?? null)}</p>
              <button
                type="button"
                onClick={() => void loadDashboard(true)}
                disabled={refreshing}
                className="mt-3 rounded-lg border border-sky-700 bg-sky-950 px-3 py-2 font-bold text-sky-200 transition hover:bg-sky-900 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              >
                {refreshing ? 'กำลังอัปเดต…' : 'อัปเดตข้อมูล'}
              </button>
            </div>
          </div>
          {metadata?.truncated ? (
            <p className="mt-3 rounded-lg border border-amber-700 bg-amber-950/60 p-3 text-xs text-amber-200" role="note">
              ชุดข้อมูลถึงขีดจำกัด {metadata.rowLimit.toLocaleString('th-TH')} รายการ สถิติในหน้านี้ครอบคลุมรายการล่าสุดเท่านั้น
            </p>
          ) : null}
          {error ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-700 bg-red-950/60 p-3 text-sm text-red-200" role="alert">
              <span>{error} ข้อมูลเดิมที่โหลดสำเร็จจะยังคงแสดงอยู่</span>
              <button type="button" onClick={() => void loadDashboard(true)} className="rounded-md bg-red-800 px-3 py-1.5 font-bold hover:bg-red-700">ลองใหม่</button>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-[#172033] p-5" aria-labelledby="filters-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="filters-title" className="text-lg font-bold">ตัวกรองข้อมูล</h2>
              <p className="text-sm text-slate-400">สถิติ กราฟ และตารางด้านล่างจะเปลี่ยนตามตัวกรองเดียวกัน</p>
            </div>
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} disabled={!hasFilters} className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">ล้างตัวกรอง</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm font-semibold text-slate-300">ตั้งแต่วันที่
              <input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={event => updateFilter('dateFrom', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white focus:border-sky-400 focus:outline-none" />
            </label>
            <label className="text-sm font-semibold text-slate-300">ถึงวันที่
              <input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={event => updateFilter('dateTo', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white focus:border-sky-400 focus:outline-none" />
            </label>
            <label className="text-sm font-semibold text-slate-300">หมู่บ้าน
              <select value={filters.village} onChange={event => updateFilter('village', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white focus:border-sky-400 focus:outline-none">
                <option value="">ทุกหมู่บ้าน</option>{villages.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-300">ประเภทเหตุ
              <select value={filters.riskType} onChange={event => updateFilter('riskType', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white focus:border-sky-400 focus:outline-none">
                <option value="">ทุกประเภท</option>{riskTypes.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-300">สถานะ
              <select value={filters.status} onChange={event => updateFilter('status', event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white focus:border-sky-400 focus:outline-none">
                <option value="">ทุกสถานะ</option>{statuses.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-4" aria-label="สถิติสรุปตามตัวกรอง">
          <article className="rounded-2xl border border-slate-700 bg-[#172033] p-6 md:col-span-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">เหตุในช่วงที่เลือก</h2>
            <p className="mt-3 text-6xl font-black">{filtered.length.toLocaleString('th-TH')} <span className="text-xl font-normal text-slate-400">รายการ</span></p>
            <p className="mt-3 text-sm text-slate-400">จากข้อมูลทั้งหมด {incidents.length.toLocaleString('th-TH')} รายการที่ API คืนให้หน้า Dashboard</p>
          </article>
          <article className="rounded-2xl border border-orange-900 bg-[#172033] p-6"><h2 className="text-sm font-bold text-orange-300">กำลังดำเนินการ</h2><p className="mt-3 text-5xl font-black text-orange-400">{(filtered.length - resolved).toLocaleString('th-TH')}</p></article>
          <article className="rounded-2xl border border-emerald-900 bg-[#172033] p-6"><h2 className="text-sm font-bold text-emerald-300">เสร็จสิ้น</h2><p className="mt-3 text-5xl font-black text-emerald-400">{resolved.toLocaleString('th-TH')}</p></article>
        </section>

        <section className="grid gap-5 lg:grid-cols-2" aria-label="กราฟสรุปสถานการณ์">
          <article className="rounded-2xl border border-slate-700 bg-[#172033] p-5">
            <h2 className="text-lg font-bold">สัดส่วนประเภทเหตุ</h2>
            <div className="h-[330px]" role="img" aria-label={riskData.length ? `กราฟประเภทเหตุ ${riskData.map(item => `${item.name} ${item.value} รายการ`).join(', ')}` : 'ไม่พบข้อมูลประเภทเหตุ'}>
              {riskData.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={riskData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={68} outerRadius={108} paddingAngle={3} stroke="none">{riskData.map((item, index) => <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#475569', borderRadius: 10 }} /></PieChart></ResponsiveContainer> : <p className="flex h-full items-center justify-center text-slate-400">ไม่พบข้อมูลตามตัวกรอง</p>}
            </div>
            <ul className="grid gap-2 text-sm sm:grid-cols-2" aria-label="ข้อมูลประเภทเหตุแบบข้อความ">
              {riskData.map((item, index) => <li key={item.name} className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/60 px-3 py-2"><span><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} aria-hidden="true" />{item.name}</span><strong>{item.value.toLocaleString('th-TH')}</strong></li>)}
            </ul>
          </article>
          <article className="rounded-2xl border border-slate-700 bg-[#172033] p-5">
            <h2 className="text-lg font-bold">5 พื้นที่ที่มีการแจ้งเหตุสูงสุด</h2>
            <p className="mt-1 text-xs text-slate-400">เป็นจำนวนรายงาน ไม่ใช่ค่าความเสี่ยงเชิงพยากรณ์</p>
            <div className="h-[330px]" role="img" aria-label={villageData.length ? `กราฟพื้นที่ ${villageData.map(item => `${item.name} ${item.value} รายการ`).join(', ')}` : 'ไม่พบข้อมูลพื้นที่'}>
              {villageData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={villageData} margin={{ top: 24, right: 8, left: -12, bottom: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} /><XAxis dataKey="name" stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: '#334155', opacity: 0.35 }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8', borderRadius: 10 }} /><Bar dataKey="value" name="จำนวนแจ้งเหตุ" fill="#38bdf8" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <p className="flex h-full items-center justify-center text-slate-400">ไม่พบข้อมูลตามตัวกรอง</p>}
            </div>
            <ol className="space-y-2 text-sm" aria-label="อันดับพื้นที่แบบข้อความ">{villageData.map((item, index) => <li key={item.name} className="flex justify-between rounded-lg bg-slate-900/60 px-3 py-2"><span>{index + 1}. {item.name}</span><strong>{item.value.toLocaleString('th-TH')} รายการ</strong></li>)}</ol>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#172033]" aria-labelledby="incident-table-title">
          <div className="border-b border-slate-700 bg-slate-800/70 px-5 py-5"><h2 id="incident-table-title" className="text-lg font-bold">รายการรับแจ้งเหตุล่าสุด</h2><p className="mt-1 text-sm text-slate-400">แสดงสูงสุด 50 รายการตามตัวกรอง เรียงจากใหม่ไปเก่า</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <caption className="sr-only">รายการรับแจ้งเหตุสาธารณะ ประเภทเหตุ หมู่บ้าน ระดับความรุนแรง และสถานะ</caption>
              <thead className="bg-slate-950/70 text-xs uppercase tracking-wider text-slate-300"><tr><th scope="col" className="px-5 py-4">วันเวลา</th><th scope="col" className="px-5 py-4">ประเภทเหตุ</th><th scope="col" className="px-5 py-4">หมู่บ้าน</th><th scope="col" className="px-5 py-4">ระดับ</th><th scope="col" className="px-5 py-4">สถานะ</th><th scope="col" className="px-5 py-4">ที่มา</th></tr></thead>
              <tbody>
                {filtered.slice(0, 50).map((incident, index) => {
                  const presentation = statusPresentation(incident.status);
                  return <tr key={`${incident.createdAt}-${incident.villageName}-${index}`} className="border-t border-slate-700/70 hover:bg-slate-800/60"><td className="whitespace-nowrap px-5 py-4 text-slate-300">{formatDateTime(incident.createdAt)}</td><th scope="row" className="px-5 py-4 font-semibold text-white">{incident.riskType}</th><td className="px-5 py-4 text-slate-300">{incident.villageName}</td><td className="px-5 py-4 text-slate-300">{incident.severityLevel ?? 'ไม่ระบุ'}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${presentation.className}`}>{presentation.label}</span></td><td className="px-5 py-4 text-xs text-slate-400">แบบฟอร์มประชาชน</td></tr>;
                })}
                {!filtered.length ? <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-400">ไม่พบรายการที่ตรงกับตัวกรอง</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
