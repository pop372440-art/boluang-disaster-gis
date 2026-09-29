'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FreshnessStatus, SituationLevel } from '@/lib/executive/situation-quality';

type SourceStatus = 'available' | 'unavailable';
type SituationData = {
  generatedAt: string;
  experimental: true;
  currentModel: {
    source: string; providerStatus: SourceStatus; referenceAt: string | null; retrievedAt: string;
    intervalMinutes: number | null; precipitationMm: number | null; precipitationUnit: string;
    temperatureC: number | null; windKph: number | null;
  };
  groundReference: {
    source: string; providerStatus: SourceStatus; retrievedAt: string;
    station: null | { name: string; rain24hMm: number | null; observedAt: string | null; distanceKm: number };
  };
  sevenDayForecast: { source: string; referenceAt: string | null; time: string[]; precipitationSum: Array<number | null> };
  planningOutlook: {
    source: string; providerStatus: SourceStatus; retrievedAt: string; horizon: string;
    memberCount: number; peakMedianMm: number | null; peakDate: string | null;
  };
  nwpComparison: {
    runAt: string | null;
    models: Array<{ id: 'ecmwf' | 'gfs'; name: string; freshness: FreshnessStatus; gridLatitude: number | null; gridLongitude: number | null; windows: Array<{ key: string; label: string; totalMm: number | null }> }>;
    consensus: { usable: boolean; agreement: string; label: string; summary: string; officialWarningAllowed: false; requiresHumanApproval: true };
  };
  derived: { antecedentRainProxy: number | null; label: string; method: string };
  assessment: {
    level: SituationLevel; label: string; summary: string; dataQuality: 'ready' | 'limited' | 'unavailable';
    modelFreshness: { status: FreshnessStatus; ageMinutes: number | null; referenceAt: string | null };
    stationFreshness: { status: FreshnessStatus; ageMinutes: number | null; referenceAt: string | null };
    stationUsable: boolean; officialWarningAllowed: false; requiresHumanApproval: true; reviewItems: string[];
  };
  decisionPolicy: { automatedOperationalActions: false; humanApprovalRequired: true; message: string };
};

const LEVEL_STYLE: Record<SituationLevel, { border: string; text: string; badge: string }> = {
  normal: { border: 'border-emerald-500/40', text: 'text-emerald-300', badge: 'bg-emerald-500/15 text-emerald-200' },
  limited: { border: 'border-amber-500/40', text: 'text-amber-300', badge: 'bg-amber-500/15 text-amber-200' },
  monitor: { border: 'border-orange-500/50', text: 'text-orange-300', badge: 'bg-orange-500/15 text-orange-200' },
  unavailable: { border: 'border-slate-600', text: 'text-slate-300', badge: 'bg-slate-700 text-slate-200' },
};

const FRESHNESS_LABEL: Record<FreshnessStatus, string> = {
  fresh: 'ข้อมูลสดตามเกณฑ์', stale: 'ข้อมูลเริ่มเก่า', expired: 'ข้อมูลหมดอายุ', unknown: 'ไม่ทราบเวลาอ้างอิง',
};

function formatDateTime(value: string | null) {
  if (!value) return 'ไม่มีเวลาอ้างอิง';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'เวลาไม่ถูกต้อง';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(timestamp));
}

function formatMetric(value: number | null, digits = 1) {
  return value === null ? 'ไม่มีข้อมูล' : value.toFixed(digits);
}

function SourceBadge({ label, status }: { label: string; status: SourceStatus }) {
  const available = status === 'available';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${available ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
      <span className={`h-2 w-2 rounded-full ${available ? 'bg-emerald-400' : 'bg-rose-400'}`} aria-hidden="true" />
      {label}: {available ? 'พร้อมใช้' : 'ขัดข้อง'}
    </span>
  );
}

export default function ExecutiveSituationOverview() {
  const [data, setData] = useState<SituationData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/executive/summary', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'โหลดข้อมูลสถานการณ์ไม่สำเร็จ');
        if (active) { setData(payload as SituationData); setError(''); }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'โหลดข้อมูลสถานการณ์ไม่สำเร็จ');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(load, 300_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200"><p role="status">กำลังตรวจสอบข้อมูลและเวลาอ้างอิง...</p></main>;
  }

  if (!data || error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <section className="max-w-lg rounded-2xl border border-rose-500/40 bg-slate-900 p-7 text-center">
          <h1 className="text-2xl font-black">Executive Situation Overview — Experimental</h1>
          <p className="mt-4 text-rose-200">{error || 'ไม่สามารถประเมินสถานการณ์ได้'}</p>
          <p className="mt-2 text-sm text-slate-400">ระบบไม่สร้างสถานะปกติหรือคำสั่งปฏิบัติการเมื่อข้อมูลไม่พร้อม</p>
          <Link href="/" className="mt-6 inline-block rounded-xl border border-slate-600 px-4 py-2">กลับหน้าหลัก</Link>
        </section>
      </main>
    );
  }

  const theme = LEVEL_STYLE[data.assessment.level];
  const station = data.groundReference.station;
  const maxDaily = Math.max(10, ...data.sevenDayForecast.precipitationSum.filter((value): value is number => value !== null));

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl md:p-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Bo Luang Decision Support</p>
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-200">EXPERIMENTAL</span>
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">Executive Situation Overview</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">ภาพรวมเพื่อคัดกรองและเตรียมตรวจสอบ ไม่ใช่ประกาศเตือนภัย ไม่ใช่ระบบสั่งการ และยังไม่ผ่านการสอบเทียบด้วยสถานีในตำบล</p>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
              <SourceBadge label="Open-Meteo model" status={data.currentModel.providerStatus} />
              <SourceBadge label="ThaiWater reference" status={data.groundReference.providerStatus} />
              <SourceBadge label="WeatherNext ensemble" status={data.planningOutlook.providerStatus} />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4 text-xs text-slate-400">
            <span>สร้างสรุปล่าสุด: {formatDateTime(data.generatedAt)}</span>
            <Link href="/" className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200 hover:bg-slate-800">← กลับหน้าหลัก</Link>
          </div>
        </header>

        <section className={`rounded-3xl border ${theme.border} bg-slate-900 p-6 md:p-8`} aria-labelledby="situation-title">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Data Quality Guard</p>
              <h2 id="situation-title" className={`mt-2 text-2xl font-black md:text-3xl ${theme.text}`}>{data.assessment.label}</h2>
              <p className="mt-3 max-w-3xl leading-7 text-slate-200">{data.assessment.summary}</p>
            </div>
            <span className={`self-start rounded-full px-4 py-2 text-sm font-black ${theme.badge}`}>คุณภาพข้อมูล: {data.assessment.dataQuality === 'ready' ? 'พร้อมคัดกรอง' : data.assessment.dataQuality === 'limited' ? 'จำกัด' : 'ใช้ประเมินไม่ได้'}</span>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <DataQualityRow label="แบบจำลองปัจจุบัน" freshness={data.assessment.modelFreshness} />
            <DataQualityRow label="สถานีฝนอ้างอิง" freshness={data.assessment.stationFreshness} extra={data.assessment.stationUsable ? 'ใช้ประกอบการคัดกรองได้' : 'ไม่ใช้ยกระดับสถานะ'} />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="ตัวชี้วัดสถานการณ์">
          <MetricCard title="ฝนจากแบบจำลองช่วงปัจจุบัน" value={formatMetric(data.currentModel.precipitationMm)} unit={data.currentModel.precipitationUnit} badge="แบบจำลอง — ไม่ใช่ Radar/Satellite" source={data.currentModel.source} referenceAt={data.currentModel.referenceAt} note={data.currentModel.intervalMinutes ? `ค่าของช่วงเวลา ${data.currentModel.intervalMinutes} นาที ไม่ใช่ค่าตรวจวัดภาคพื้นดิน` : 'ไม่ทราบช่วงเวลาของค่า'} />
          <MetricCard title="ฝนสะสม 24 ชม. สถานีอ้างอิง" value={formatMetric(station?.rain24hMm ?? null)} unit="มม." badge={station ? `ห่างบ่อหลวง ${station.distanceKm.toFixed(1)} กม.` : 'ไม่พบสถานี'} source={station ? `${data.groundReference.source} · ${station.name}` : data.groundReference.source} referenceAt={station?.observedAt ?? null} note={data.assessment.stationUsable ? 'สถานีสดและอยู่ในรัศมีอ้างอิง' : 'สถานีไม่ใกล้พอ ข้อมูลเก่า หรือไม่ทราบเวลา จึงไม่ใช้ยกระดับสถานะ'} />
          <MetricCard title={data.derived.label} value={data.derived.antecedentRainProxy === null ? 'คำนวณไม่ได้' : String(data.derived.antecedentRainProxy)} unit={data.derived.antecedentRainProxy === null ? '' : '/100'} badge="ค่าประมาณจากฝน" source="สูตรคัดกรองภายใน" referenceAt={station?.observedAt ?? null} note={data.derived.method} />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">7-Day Forecast</p><h2 className="mt-2 text-xl font-black">ฝนรายวันจาก Open-Meteo</h2></div>
              <span className="text-xs text-slate-400">เวลาอ้างอิง: {formatDateTime(data.sevenDayForecast.referenceAt)}</span>
            </div>
            <div className="mt-7 grid h-64 grid-cols-7 items-end gap-2" role="img" aria-label="กราฟพยากรณ์ฝนรายวัน 7 วัน">
              {data.sevenDayForecast.time.map((date, index) => {
                const rain = data.sevenDayForecast.precipitationSum[index];
                const height = rain === null ? 3 : Math.max(4, rain / maxDaily * 100);
                return (
                  <div key={date} className="flex h-full min-w-0 flex-col justify-end text-center">
                    <span className="mb-2 text-xs font-bold text-slate-200">{rain === null ? '–' : rain.toFixed(0)}</span>
                    <div className="flex flex-1 items-end justify-center"><div className="w-full max-w-10 rounded-t-lg bg-cyan-500/80" style={{ height: `${height}%` }} /></div>
                    <span className="mt-3 truncate text-[10px] text-slate-400">{new Intl.DateTimeFormat('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(`${date}T00:00:00+07:00`))}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-400">ตัวเลขคือมิลลิเมตรต่อวันจากแบบจำลอง ไม่ใช่ค่าตรวจวัดหรือเรดาร์ และไม่ใช้เป็นคำสั่งปฏิบัติการโดยลำพัง</p>
          </article>

          <article className="rounded-3xl border border-violet-500/30 bg-slate-900 p-6 md:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Planning Outlook</p>
            <h2 className="mt-2 text-xl font-black">Open-Meteo ensemble · Google WeatherNext 2</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">สรุปด้วยค่ามัธยฐานของสมาชิกแบบจำลอง {data.planningOutlook.memberCount} ชุด เพื่อลดผลจากสมาชิกที่รุนแรงที่สุดเพียงชุดเดียว</p>
            <div className="mt-6 rounded-2xl bg-slate-950 p-5">
              <p className="text-sm text-slate-400">ค่าสูงสุดของมัธยฐานรายวันในช่วงแผน</p>
              <p className="mt-2 text-4xl font-black text-violet-300">{formatMetric(data.planningOutlook.peakMedianMm)} <span className="text-base text-slate-500">มม./วัน</span></p>
              <p className="mt-2 text-xs text-slate-400">วันที่แบบจำลองชี้: {data.planningOutlook.peakDate || 'ไม่มีข้อมูล'} · เรียกข้อมูลเมื่อ {formatDateTime(data.planningOutlook.retrievedAt)}</p>
            </div>
            <p className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">{data.planningOutlook.horizon} ความไม่แน่นอนเพิ่มขึ้นตามระยะพยากรณ์</p>
          </article>
        </section>

        <section className="rounded-3xl border border-cyan-500/30 bg-slate-900 p-6 md:p-8" aria-labelledby="executive-nwp-title">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">NWP Comparison · Planning Input</p>
              <h2 id="executive-nwp-title" className="mt-2 text-xl font-black">ECMWF และ GFS ช่วง 24–72 ชั่วโมง</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{data.nwpComparison.consensus.summary}</p>
            </div>
            <span className={`self-start rounded-full px-4 py-2 text-xs font-black ${data.nwpComparison.consensus.usable ? 'bg-cyan-500/15 text-cyan-200' : 'bg-amber-500/15 text-amber-200'}`}>{data.nwpComparison.consensus.label}</span>
          </div>
          {data.nwpComparison.consensus.usable ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((index) => {
                const ecmwf = data.nwpComparison.models.find((model) => model.id === 'ecmwf')?.windows[index];
                const gfs = data.nwpComparison.models.find((model) => model.id === 'gfs')?.windows[index];
                return <article key={ecmwf?.key ?? index} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4"><p className="text-xs font-bold text-slate-400">{ecmwf?.label}</p><p className="mt-2 text-sm font-black text-white">ECMWF {formatMetric(ecmwf?.totalMm ?? null)} · GFS {formatMetric(gfs?.totalMm ?? null)} มม.</p></article>;
              })}
            </div>
          ) : <p className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">ข้อมูลสองแบบจำลองไม่ผ่าน Data Quality Guard จึงไม่นำมาแสดงเป็นสถานการณ์หรือคำสั่ง</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400"><span>รอบรันเดียวกัน: {formatDateTime(data.nwpComparison.runAt)} · ความสอดคล้องไม่ใช่การรับรองความแม่นยำ</span><Link href="/weather#nwp" className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">เปิดรายละเอียดแบบจำลอง →</Link></div>
        </section>

        <section className="rounded-3xl border border-amber-500/40 bg-amber-950/20 p-6 md:p-8" aria-labelledby="approval-title">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Human Approval Gate</p>
              <h2 id="approval-title" className="mt-2 text-2xl font-black text-white">ระบบปิดคำสั่งปฏิบัติการอัตโนมัติ</h2>
              <p className="mt-3 max-w-3xl leading-7 text-amber-100">{data.decisionPolicy.message}</p>
            </div>
            <span className="self-start rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-black text-amber-200">รอเจ้าหน้าที่ตรวจสอบ</span>
          </div>
          <h3 className="mt-6 font-bold text-white">รายการตรวจสอบประกอบการตัดสินใจ</h3>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {data.assessment.reviewItems.map((item) => <li key={item} className="rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-200">□ {item}</li>)}
          </ul>
        </section>
      </div>
    </main>
  );
}

function DataQualityRow({ label, freshness, extra }: { label: string; freshness: { status: FreshnessStatus; ageMinutes: number | null; referenceAt: string | null }; extra?: string }) {
  return <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4"><p className="font-bold text-white">{label}</p><p className="mt-1 text-sm text-slate-300">{FRESHNESS_LABEL[freshness.status]}{freshness.ageMinutes === null ? '' : ` · อายุ ${freshness.ageMinutes} นาที`}</p><p className="mt-1 text-xs text-slate-500">อ้างอิง {formatDateTime(freshness.referenceAt)}{extra ? ` · ${extra}` : ''}</p></div>;
}

function MetricCard({ title, value, unit, badge, source, referenceAt, note }: { title: string; value: string; unit: string; badge: string; source: string; referenceAt: string | null; note: string }) {
  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex min-h-12 items-start justify-between gap-3"><h2 className="text-sm font-bold text-slate-300">{title}</h2><span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-300">{badge}</span></div>
      <p className="mt-4 break-words text-4xl font-black text-white">{value} <span className="text-base text-slate-500">{unit}</span></p>
      <p className="mt-5 text-xs leading-5 text-slate-400">แหล่งข้อมูล: {source}<br />เวลาอ้างอิง: {formatDateTime(referenceAt)}</p>
      <p className="mt-3 rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-300">{note}</p>
    </article>
  );
}
