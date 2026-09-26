'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { inferSeasonalMode, SEASONAL_MODES, type SeasonalMode } from '@/lib/environment/seasonal-mode';
import { getScreeningStatus } from '@/lib/environment/screening-status';

const MapContainer = dynamic(() => import('react-leaflet').then((module) => module.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((module) => module.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then((module) => module.GeoJSON), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then((module) => module.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then((module) => module.Popup), { ssr: false });

const MODES = Object.keys(SEASONAL_MODES) as SeasonalMode[];
const VILLAGES = ['บ้านบ่อหลวง','บ้านวังกอง','บ้านขุน','บ้านนาฟ่อน','บ้านแม่ลายเหนือ','บ้านแม่ลายใต้','บ้านพุย','บ้านกิ่วลม','บ้านแม่สะนาม','บ้านเตียนอาง','บ้านบ่อสะแง๋','บ้านบ่อพะแวน','บ้านแม่หืด'];

const fmt = (value: unknown, digits = 0) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
const aqLabel = (pm25: number | null) => pm25 == null ? 'รอข้อมูล' : pm25 <= 15 ? 'ดีมาก' : pm25 <= 25 ? 'ดี' : pm25 <= 37.5 ? 'ปานกลาง' : pm25 <= 75 ? 'เริ่มมีผลกระทบ' : 'มีผลกระทบ';
const timeLabel = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value)) : 'ไม่ทราบเวลา';

export default function IntelligencePage() {
  const [audience, setAudience] = useState<'public' | 'ops'>('public');
  const [mode, setMode] = useState<SeasonalMode>(() => inferSeasonalMode(new Date().getMonth() + 1));
  const [payload, setPayload] = useState<any>(null);
  const [boundary, setBoundary] = useState<any>(null);
  const [villageBoundaries, setVillageBoundaries] = useState<any>(null);
  const [visibleLayers, setVisibleLayers] = useState({ villages: true, hotspots: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/environment/summary', { signal: controller.signal }).then(async (response) => {
        if (!response.ok && response.status !== 207) throw new Error(`Environment API HTTP ${response.status}`);
        return response.json();
      }),
      fetch('/geojson/boluang.json', { signal: controller.signal }).then((response) => response.json()),
      fetch('/geojson/block.json', { signal: controller.signal }).then((response) => response.json()),
    ]).then(([summary, tambonGeojson, villageGeojson]) => {
      setPayload(summary); setBoundary(tambonGeojson); setVillageBoundaries(villageGeojson); setError(null);
    }).catch((reason) => {
      if (reason?.name !== 'AbortError') setError('โหลดข้อมูลสิ่งแวดล้อมไม่สำเร็จ กรุณาลองใหม่');
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const current = payload?.weather?.current;
  const air = payload?.airQuality?.current;
  const daily = payload?.weather?.daily;
  const config = SEASONAL_MODES[mode];
  const sourceRows = useMemo(() => Object.values(payload?.sources ?? {}) as any[], [payload]);
  const hotspots = useMemo(() => Array.isArray(payload?.fire?.hotspots) ? payload.fire.hotspots : [], [payload]);
  const screening = useMemo(() => getScreeningStatus({
    precipitationMm: current?.precipitation,
    windGustKmh: current?.wind_gusts_10m,
    pm25: air?.pm2_5,
    hotspotCount: payload?.fire?.count,
  }), [air?.pm2_5, current?.precipitation, current?.wind_gusts_10m, payload?.fire?.count]);
  const isStale = payload?.fetchedAt ? Date.now() - new Date(payload.fetchedAt).getTime() > 20 * 60 * 1000 : true;
  const weatherCards = [
    { label: 'อุณหภูมิ', value: `${fmt(current?.temperature_2m, 1)}°`, meta: `รู้สึก ${fmt(current?.apparent_temperature, 1)}°C`, tone: 'text-orange-200' },
    { label: 'ฝนขณะนี้', value: `${fmt(current?.precipitation, 1)}`, unit: 'มม.', meta: `วันนี้ ${fmt(daily?.precipitation_sum?.[0], 1)} มม.`, tone: 'text-sky-200' },
    { label: 'ลม / ลมกระโชก', value: `${fmt(current?.wind_speed_10m)}`, unit: 'กม./ชม.', meta: `กระโชก ${fmt(current?.wind_gusts_10m)} กม./ชม.`, tone: 'text-cyan-200' },
    { label: 'PM2.5 ประเมิน', value: `${fmt(air?.pm2_5, 1)}`, unit: 'µg/m³', meta: aqLabel(air?.pm2_5 ?? null), tone: 'text-amber-200' },
  ];

  return (
    <main className="min-h-screen bg-[#06111e] text-slate-100">
      <header className="sticky top-0 z-[1200] border-b border-white/10 bg-[#071522]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[.18em] text-cyan-300">BO LUANG ENVIRONMENTAL INTELLIGENCE</p>
            <h1 className="truncate text-base font-extrabold text-white md:text-xl">ศูนย์เฝ้าระวังอากาศ สิ่งแวดล้อม และภัยพิบัติ</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1" role="group" aria-label="เลือกมุมมองผู้ใช้งาน">
              <button aria-pressed={audience === 'public'} onClick={() => setAudience('public')} className={`rounded-lg px-2 py-2 text-xs font-bold sm:px-3 sm:text-sm ${audience === 'public' ? 'bg-cyan-300 text-slate-950' : 'text-slate-300'}`}>ประชาชน</button>
              <button aria-pressed={audience === 'ops'} onClick={() => setAudience('ops')} className={`rounded-lg px-2 py-2 text-xs font-bold sm:px-3 sm:text-sm ${audience === 'ops' ? 'bg-cyan-300 text-slate-950' : 'text-slate-300'}`}>เจ้าหน้าที่</button>
            </div>
            <Link href="/radar" className="rounded-xl bg-[#1769aa] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#2180c8]">เปิด Radar</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_340px] lg:p-6">
        <aside className="order-2 space-y-4 lg:order-1">
          <div className="rounded-2xl border border-white/10 bg-[#0b1b2b] p-4 shadow-2xl">
            <p className="mb-3 text-sm font-extrabold text-white">โหมดตามฤดูกาล</p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {MODES.map((key) => (
                <button key={key} aria-pressed={mode === key} onClick={() => setMode(key)} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${mode === key ? 'border-cyan-300/60 bg-cyan-300/10 text-white' : 'border-white/10 bg-white/[.03] text-slate-300 hover:bg-white/[.07]'}`}>
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: SEASONAL_MODES[key].accent }} />
                  {SEASONAL_MODES[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b1b2b] p-4">
            <div className="flex items-center justify-between"><p className="text-sm font-extrabold">ชั้นข้อมูลแนะนำ</p><span className="text-xs text-slate-400">{config.layers.length} ชั้น</span></div>
            <div className="mt-3 space-y-2">
              {config.layers.map((layer, index) => (
                <div key={layer} className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2.5 text-sm text-slate-200">
                  <span className={`h-2.5 w-2.5 rounded-sm ${index < 3 ? 'bg-emerald-400' : 'bg-slate-500'}`} />{layer}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="order-1 min-w-0 space-y-4 lg:order-2">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {weatherCards.map((card) => (
              <article key={card.label} className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#10283d] to-[#091724] p-4">
                <p className="text-sm font-semibold text-slate-400">{card.label}</p>
                <p className={`mt-2 text-3xl font-black ${card.tone}`}>{loading ? '…' : card.value} <span className="text-sm font-semibold text-slate-400">{card.unit}</span></p>
                <p className="mt-1 text-sm text-slate-300">{card.meta}</p>
              </article>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0b1b2b] px-4 py-3 text-xs text-slate-300">
            <span>อัปเดตล่าสุด: <strong className={isStale ? 'text-rose-300' : 'text-white'}>{timeLabel(payload?.fetchedAt)}{isStale ? ' · ข้อมูลเก่า' : ''}</strong></span>
            <div className="flex gap-2" role="group" aria-label="เปิดปิดชั้นข้อมูลแผนที่">
              <button aria-pressed={visibleLayers.villages} onClick={() => setVisibleLayers((value) => ({ ...value, villages: !value.villages }))} className={`rounded-lg border px-3 py-1.5 font-bold ${visibleLayers.villages ? 'border-cyan-300 bg-cyan-300/10 text-cyan-200' : 'border-white/10 text-slate-400'}`}>13 หมู่บ้าน</button>
              <button aria-pressed={visibleLayers.hotspots} onClick={() => setVisibleLayers((value) => ({ ...value, hotspots: !value.hotspots }))} className={`rounded-lg border px-3 py-1.5 font-bold ${visibleLayers.hotspots ? 'border-orange-300 bg-orange-300/10 text-orange-200' : 'border-white/10 text-slate-400'}`}>Hotspot {hotspots.length}</button>
            </div>
          </div>

          <div className="relative h-[460px] overflow-hidden rounded-2xl border border-white/10 bg-[#102235] shadow-2xl lg:h-[620px]">
            <MapContainer center={[18.1633, 98.3744]} zoom={12} minZoom={8} maxZoom={18} zoomControl className="h-full w-full">
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" attribution="Tiles © Esri" />
              {visibleLayers.villages && villageBoundaries && <GeoJSON
                data={villageBoundaries}
                style={{ color: '#b8d7e8', weight: 1.2, opacity: 0.8, fillColor: config.accent, fillOpacity: 0.06 }}
                onEachFeature={(feature: any, layer: any) => layer.bindTooltip(feature?.properties?.own_villag ?? 'เขตหมู่บ้าน', { sticky: true, direction: 'top' })}
              />}
              {boundary && <GeoJSON data={boundary} style={{ color: config.accent, weight: 3, fillColor: config.accent, fillOpacity: 0.08 }} />}
              {visibleLayers.hotspots && hotspots.map((hotspot: any, index: number) => <CircleMarker
                key={`${hotspot.id ?? hotspot.latitude}-${hotspot.longitude}-${index}`}
                center={[hotspot.latitude, hotspot.longitude]}
                radius={8}
                pathOptions={{ color: '#fff7ed', weight: 2, fillColor: '#f97316', fillOpacity: 0.9 }}
              ><Popup><div className="text-sm text-slate-900"><strong>จุดความร้อนจากดาวเทียม</strong><br />ห่างจากจุดกลางบ่อหลวง {fmt(hotspot.distanceKm, 1)} กม.<br />แหล่งข้อมูล: GISTDA</div></Popup></CircleMarker>)}
            </MapContainer>
            <div className="absolute left-4 top-4 z-[800] max-w-[280px] rounded-xl border border-white/15 bg-[#071522]/90 p-3 backdrop-blur-lg">
              <p className="text-xs font-bold text-cyan-300">สถานการณ์ที่กำลังติดตาม</p>
              <p className="mt-1 text-base font-extrabold text-white">{config.label}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">ข้อมูลบนแผนที่เป็นระดับตำบลและหมู่บ้าน ไม่ใช่ระดับแปลงหรืออาคาร</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-200">
                <span className="rounded-md border-2 px-2 py-1" style={{ borderColor: config.accent }}>ขอบเขตตำบล</span>
                <span className="rounded-md border border-[#b8d7e8] px-2 py-1">ขอบเขต 13 หมู่บ้าน</span>
              </div>
            </div>
            <Link href="/radar" className="absolute bottom-4 right-4 z-[800] rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 shadow-xl hover:bg-cyan-200">เปิดแผนที่ปฏิบัติการเต็มจอ</Link>
          </div>
        </div>

        <aside className="order-3 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#0b1b2b] p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold">สรุปเพื่อการตัดสินใจ</p><p className="mt-1 text-xs text-slate-400">{audience === 'public' ? 'คำแนะนำสำหรับประชาชน' : 'รายการตรวจสอบสำหรับเจ้าหน้าที่'}</p></div><span className={`rounded-lg px-2 py-1 text-xs font-bold ${screening.level === 'warning' ? 'bg-rose-400/10 text-rose-300' : screening.level === 'watch' ? 'bg-amber-400/10 text-amber-300' : 'bg-emerald-400/10 text-emerald-300'}`}>{screening.label}</span></div>
            <ol className="mt-4 space-y-3">
              {config.priorities.map((item, index) => <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-200"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black">{index + 1}</span>{item}</li>)}
            </ol>
            {screening.reasons.length > 0 && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 p-3"><p className="text-xs font-extrabold text-amber-100">เหตุผลที่ระบบคัดกรอง</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-100">{screening.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
            <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 p-3 text-xs leading-relaxed text-amber-100">ข้อมูลพยากรณ์และดาวเทียมใช้สนับสนุนการตัดสินใจ ไม่ใช่ค่าตรวจวัดภาคพื้นดิน ณ ทุกหมู่บ้าน</p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">สถานะนี้เป็นการคัดกรองอัตโนมัติเบื้องต้น ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ เจ้าหน้าที่ต้องตรวจสอบก่อนเผยแพร่</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b1b2b] p-4">
            <div className="flex items-center justify-between"><p className="text-sm font-extrabold">13 หมู่บ้าน</p><Link href="/radar" className="text-xs font-bold text-cyan-300">ดูค่าฝน →</Link></div>
            <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {VILLAGES.map((village, index) => <div key={village} className="rounded-lg border border-white/8 bg-black/10 px-2.5 py-2 text-xs text-slate-300"><span className="mr-1.5 text-slate-500">{index + 1}</span>{village}</div>)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b1b2b] p-4">
            <p className="text-sm font-extrabold">สถานะแหล่งข้อมูล</p>
            <div className="mt-3 space-y-2">
              {sourceRows.length ? sourceRows.map((source, index) => <div key={`${source.source}-${index}`} className="rounded-lg bg-black/10 px-3 py-2 text-xs"><div className="flex items-center justify-between gap-3"><span className="truncate text-slate-300">{source.source}{typeof source.count === 'number' ? ` · ${source.count} จุด` : ''}</span><span className={`font-bold ${source.state === 'ready' ? 'text-emerald-300' : source.state === 'unconfigured' ? 'text-amber-300' : 'text-rose-300'}`}>{source.state === 'ready' ? 'พร้อมใช้' : source.state === 'unconfigured' ? 'ยังไม่ตั้งค่า' : 'ขัดข้อง'}</span></div><p className="mt-1 text-[10px] text-slate-500">{timeLabel(source.fetchedAt)}</p></div>) : <p className="text-sm text-slate-400">กำลังตรวจสอบ…</p>}
            </div>
          </div>
        </aside>
      </section>
      {error && <div className="fixed bottom-4 left-1/2 z-[1500] -translate-x-1/2 rounded-xl border border-rose-300/30 bg-rose-950/95 px-4 py-3 text-sm text-rose-100 shadow-2xl">{error}</div>}
    </main>
  );
}
