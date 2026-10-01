'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CenterNav from '@/components/center/CenterNav';
import { getScreeningStatus } from '@/lib/environment/screening-status';

type CenterPayload = {
  fetchedAt?: string;
  weather?: { current?: Record<string, number | null> };
  airQuality?: { current?: Record<string, number | null> };
  fire?: { state?: string; count?: number; message?: string };
  sources?: Record<string, { state?: string; source?: string; fetchedAt?: string | null }>;
};

type NwpPayload = {
  runAt?: string | null;
  models?: Array<{ id: string; name: string; freshness?: string; windows?: Array<{ key: string; label: string; totalMm: number | null }> }>;
  consensus?: { usable?: boolean; label?: string; summary?: string; agreement?: string };
};

const fmt = (value: unknown, digits = 1) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
const bangkokTime = (value?: string | null) => value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value)) : 'ไม่ทราบเวลา';

const STATUS_STYLE = {
  normal: { label: 'ติดตามปกติ', badge: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-400' },
  watch: { label: 'เฝ้าระวัง', badge: 'border-amber-400/40 bg-amber-400/10 text-amber-100', dot: 'bg-amber-400' },
  warning: { label: 'ควรตรวจสอบเร่งด่วน', badge: 'border-rose-400/50 bg-rose-400/10 text-rose-100', dot: 'bg-rose-400' },
} as const;

export default function SituationCenterPage() {
  const [environment, setEnvironment] = useState<CenterPayload | null>(null);
  const [nwp, setNwp] = useState<NwpPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [environmentResult, nwpResult] = await Promise.allSettled([
        fetch('/api/environment/summary', { cache: 'no-store' }).then(async (response) => {
          if (!response.ok && response.status !== 207) throw new Error(`Environment HTTP ${response.status}`);
          return response.json() as Promise<CenterPayload>;
        }),
        fetch('/api/weather/nwp', { cache: 'no-store' }).then(async (response) => {
          if (!response.ok) throw new Error(`NWP HTTP ${response.status}`);
          return response.json() as Promise<NwpPayload>;
        }),
      ]);
      if (environmentResult.status === 'fulfilled') setEnvironment(environmentResult.value);
      if (nwpResult.status === 'fulfilled') setNwp(nwpResult.value);
      if (environmentResult.status === 'rejected' && nwpResult.status === 'rejected') throw new Error('แหล่งข้อมูลหลักไม่ตอบสนอง');
      setError(environmentResult.status === 'rejected' || nwpResult.status === 'rejected' ? 'ข้อมูลบางแหล่งขัดข้อง ระบบแสดงเฉพาะข้อมูลที่ตรวจสอบได้' : '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'โหลดข้อมูลสถานการณ์ไม่สำเร็จ');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 300_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const current = environment?.weather?.current;
  const air = environment?.airQuality?.current;
  const screening = useMemo(() => getScreeningStatus({
    precipitationMm: current?.precipitation,
    windGustKmh: current?.wind_gusts_10m,
    pm25: air?.pm2_5,
    hotspotCount: environment?.fire?.state === 'ready' ? environment.fire.count : null,
  }), [air?.pm2_5, current?.precipitation, current?.wind_gusts_10m, environment?.fire?.count, environment?.fire?.state]);
  const status = STATUS_STYLE[screening.level];
  const ageMinutes = environment?.fetchedAt ? Math.max(0, Math.floor((Date.now() - new Date(environment.fetchedAt).getTime()) / 60_000)) : null;
  const sourceRows = Object.entries(environment?.sources ?? {});
  const degradedSources = sourceRows.filter(([, source]) => source.state !== 'ready').length;
  const dataLimited = ageMinutes === null || ageMinutes > 20 || degradedSources > 0;

  return (
    <main className="min-h-screen bg-[#06111e] text-slate-100">
      <CenterNav />
      <section className="border-b border-white/10 bg-gradient-to-br from-[#0d2740] via-[#071827] to-[#06111e]">
        <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-8 md:py-12">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black tracking-[0.2em] text-cyan-300">BO LUANG ENVIRONMENTAL INTELLIGENCE</p>
              <h1 className="mt-2 max-w-4xl text-3xl font-black tracking-tight text-white md:text-5xl">ศูนย์สถานการณ์บ่อหลวง</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">รวมสภาพอากาศ แบบจำลองฝน สิ่งแวดล้อม น้ำ และข้อมูลสนับสนุนการตัดสินใจไว้ในเส้นทางเดียว โดยแยกข้อมูลตรวจวัด แบบจำลอง และคำแนะนำอย่างชัดเจน</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void load(true)} disabled={refreshing} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-bold text-cyan-100 disabled:opacity-60">{refreshing ? 'กำลังอัปเดต…' : 'อัปเดตข้อมูล'}</button>
              <Link href="/admin" className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-200">เข้าสู่ระบบเจ้าหน้าที่</Link>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3 text-xs">
            <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-black ${status.badge}`}><span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />{loading ? 'กำลังประเมิน…' : status.label}</span>
            <span className={`rounded-full border px-4 py-2 font-bold ${dataLimited ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'}`}>Data Quality: {dataLimited ? 'ข้อมูลมีข้อจำกัด' : 'พร้อมใช้คัดกรอง'}</span>
            <span className="text-slate-400">อัปเดต {bangkokTime(environment?.fetchedAt)}{ageMinutes === null ? '' : ` · อายุ ${ageMinutes} นาที`}</span>
          </div>
          {error ? <p role="status" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{error}</p> : null}
        </div>
      </section>

      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 md:px-8 md:py-8">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="ตัวชี้วัดสถานการณ์ปัจจุบัน">
          {[
            ['อุณหภูมิ', `${fmt(current?.temperature_2m)}°C`, 'แบบจำลอง Open-Meteo'],
            ['ฝนปัจจุบัน', `${fmt(current?.precipitation)} มม.`, 'แบบจำลอง ไม่ใช่สถานี'],
            ['ลมกระโชก', `${fmt(current?.wind_gusts_10m, 0)} กม./ชม.`, 'แบบจำลอง Open-Meteo'],
            ['PM2.5', `${fmt(air?.pm2_5)} µg/m³`, 'ค่าประเมิน CAMS'],
            ['Hotspot 50 กม.', environment?.fire?.state === 'ready' ? `${environment.fire.count ?? 0} จุด` : 'ตรวจสอบไม่ได้', 'ดาวเทียม GISTDA'],
          ].map(([label, value, source]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-[#0b1b2b] p-4 shadow-xl">
              <p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-white">{loading ? '…' : value}</p><p className="mt-2 text-[10px] text-slate-500">{source}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2" aria-labelledby="center-services-title">
          <h2 id="center-services-title" className="sr-only">ระบบย่อยของศูนย์สถานการณ์</h2>
          {[
            { href: '/center/weather', eyebrow: 'FORECAST & OBSERVATION', title: 'อากาศ เรดาร์ และ NWP', text: 'ดูเรดาร์ฝนแยกจากแบบจำลอง ECMWF/GFS พร้อมแนวโน้ม 24–72 ชั่วโมง', tone: 'border-sky-400/30', badge: 'ข้อมูลหลักสำหรับประชาชน' },
            { href: '/center/environment', eyebrow: 'ENVIRONMENTAL INTELLIGENCE', title: 'สิ่งแวดล้อมและ 13 หมู่บ้าน', text: 'ติดตาม PM2.5 ลม Hotspot ฤดูกาล และวิเคราะห์พื้นที่ระดับหมู่บ้าน', tone: 'border-emerald-400/30', badge: 'ภาพรวมพื้นที่' },
            { href: '/center/flood', eyebrow: 'FLOOD WATCH', title: 'น้ำและน้ำท่วม', text: 'สถานีอ้างอิงรอบตำบล อายุข้อมูล และแนวโน้มฝนเพื่อประกอบการเฝ้าระวังน้ำป่า', tone: 'border-blue-400/30', badge: 'ข้อมูลประกอบ' },
            { href: '/center/executive', eyebrow: 'DECISION SUPPORT', title: 'ภาพรวมผู้บริหาร — Experimental', text: 'สรุปคุณภาพข้อมูลและประเด็นที่ต้องตรวจสอบ โดยไม่มีคำสั่งปฏิบัติการอัตโนมัติ', tone: 'border-violet-400/30', badge: 'ต้องมี Human Approval' },
          ].map((item) => (
            <Link key={item.href} href={item.href} className={`group rounded-2xl border ${item.tone} bg-[#0b1b2b] p-5 transition hover:-translate-y-0.5 hover:bg-[#10263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black tracking-[0.18em] text-cyan-300">{item.eyebrow}</p><h3 className="mt-2 text-xl font-black text-white">{item.title}</h3></div><span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-300">{item.badge}</span></div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{item.text}</p><p className="mt-4 text-sm font-black text-cyan-200">เปิดระบบ →</p>
            </Link>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0b1b2b] p-5 md:p-6" aria-labelledby="nwp-center-title">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div><p className="text-[10px] font-black tracking-[0.18em] text-cyan-300">NWP MODEL COMPARISON</p><h2 id="nwp-center-title" className="mt-2 text-xl font-black">ECMWF และ GFS ช่วง 24–72 ชั่วโมง</h2><p className="mt-2 text-xs text-slate-400">ผลแบบจำลอง ไม่ใช่เรดาร์ ไม่ใช่เครื่องวัดฝน และไม่ใช้ประกาศเตือนโดยลำพัง</p></div>
            <Link href="/center/weather#nwp" className="self-start rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-100">ดูกราฟและรายละเอียด →</Link>
          </div>
          {nwp?.consensus?.usable ? <div className="mt-5 grid gap-3 md:grid-cols-3">{[0, 1, 2].map((index) => {
            const ecmwf = nwp.models?.find((model) => model.id === 'ecmwf')?.windows?.[index];
            const gfs = nwp.models?.find((model) => model.id === 'gfs')?.windows?.[index];
            return <div key={ecmwf?.key ?? index} className="rounded-xl border border-white/10 bg-black/10 p-4"><p className="text-xs font-black text-white">{ecmwf?.label ?? `${index * 24}–${(index + 1) * 24} ชม.`}</p><p className="mt-2 text-sm text-sky-200">ECMWF {fmt(ecmwf?.totalMm)} มม.</p><p className="mt-1 text-sm text-violet-200">GFS {fmt(gfs?.totalMm)} มม.</p></div>;
          })}<p className="md:col-span-3 text-xs text-slate-400">{nwp.consensus.label} · รอบรัน {bangkokTime(nwp.runAt)} · ความสอดคล้องไม่ใช่การรับรองความแม่นยำ</p></div> : <p className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">ข้อมูล NWP ไม่ครบหรือหมดอายุ จึงไม่สรุปความสอดคล้องของแบบจำลอง</p>}
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#091724] p-5" aria-labelledby="source-policy-title">
          <h2 id="source-policy-title" className="text-lg font-black">นโยบายแยกประเภทข้อมูล</h2>
          <div className="mt-4 grid gap-3 text-xs md:grid-cols-4">
            <p className="rounded-xl border border-sky-400/20 p-3 text-slate-300"><strong className="block text-sky-200">Observation</strong>Radar และ Hotspot แสดงสิ่งที่ตรวจพบพร้อมเวลาอ้างอิง</p>
            <p className="rounded-xl border border-violet-400/20 p-3 text-slate-300"><strong className="block text-violet-200">Model</strong>Open-Meteo, CAMS, ECMWF และ GFS คือค่าคาดการณ์/ประมาณ</p>
            <p className="rounded-xl border border-blue-400/20 p-3 text-slate-300"><strong className="block text-blue-200">Reference</strong>สถานีน้ำ/ฝนรอบตำบลต้องผ่านเกณฑ์ระยะและ freshness</p>
            <p className="rounded-xl border border-amber-400/20 p-3 text-slate-300"><strong className="block text-amber-200">Decision</strong>ประกาศหรือสั่งการต้องผ่านเจ้าหน้าที่ผู้มีอำนาจอนุมัติ</p>
          </div>
        </section>
      </div>
    </main>
  );
}
