'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { areaHref, containsPoint, villageContexts, type AreaContext } from '@/lib/gis/area-context';
import { localStationEvidence, record } from '@/lib/gis/evidence';
import type { PolygonGeometry } from '@/lib/radar/geojson-validation';
import { evaluateWeatherFreshness } from '@/lib/weather/data-quality';

async function read(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('ข้อมูลไม่พร้อม');
  return response.json();
}
const timeLabel = (value: string | null) => value ? new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'ไม่ทราบเวลา';

function EvidenceContent({ area }: { area: AreaContext }) {
  const [data, setData] = useState<{ environment: unknown; rain: unknown; water: unknown; geometry?: PolygonGeometry; land: unknown; failures: number } | null>(null);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    Promise.allSettled([
      read(`/api/environment/summary?latitude=${area.lat}&longitude=${area.lng}`, controller.signal),
      read(`/api/gis/stations?lat=${area.lat}&lng=${area.lng}`, controller.signal),
      read('/geojson/block.json', controller.signal),
      read('/geojson/boluang_landslide_risk.json', controller.signal),
    ]).then(results => {
      if (controller.signal.aborted) return;
      const value = (index: number) => results[index].status === 'fulfilled' ? results[index].value : null;
      let geometry: PolygonGeometry | undefined;
      try { geometry = villageContexts(value(2)).find(v => v.id === area.id)?.feature.geometry; } catch { /* ขอบเขตที่ไม่ยืนยันจะไม่ใช้กรองจุด */ }
      const stations = record(value(1));
      setData({ environment: value(0), rain: stations.rain ?? null, water: stations.water ?? null, land: value(3), geometry, failures: results.filter(result => result.status === 'rejected').length + (stations.partial ? 1 : 0) });
    });
    return () => { controller.abort(); clearInterval(timer); };
  }, [area.id, area.lat, area.lng]);
  if (!data) return <p role="status" className="py-3 text-base">กำลังตรวจหลักฐานรอบ {area.name}…</p>;
  const env = record(data.environment), fire = record(env.fire);
  const geometryMissing = area.id.startsWith('moo-') && !data.geometry;
  const hotspots = Array.isArray(fire.hotspots) ? fire.hotspots.map(record).filter(point => !data.geometry || containsPoint([Number(point.longitude), Number(point.latitude)], data.geometry)) : [];
  const acquired = hotspots.map(point => typeof point.acquiredAt === 'string' ? point.acquiredAt : null).filter((time): time is string => time !== null);
  const latest = acquired.sort().at(-1) ?? null;
  const recent = hotspots.filter(point => evaluateWeatherFreshness(typeof point.acquiredAt === 'string' ? point.acquiredAt : null, 360, 1440, clock).status === 'fresh');
  const coverageTime = typeof fire.coverageCheckedAt === 'string' ? fire.coverageCheckedAt : null;
  const fireReady = fire.state === 'ready' && evaluateWeatherFreshness(coverageTime, 360, 1440, clock).status === 'fresh' && !geometryMissing;
  const stations = [...localStationEvidence(data.rain, 'rain', area, clock, data.geometry), ...localStationEvidence(data.water, 'water', area, clock, data.geometry)].sort((a, b) => a.distanceKm - b.distanceKm);
  const air = record(record(env.airQuality).current);
  const airTime = typeof air.time === 'string' ? `${air.time}${/(Z|[+-]\d\d:\d\d)$/.test(air.time) ? '' : '+07:00'}` : null;
  const airFreshness = evaluateWeatherFreshness(airTime, 180, 720, clock);
  const land = record(data.land);
  const landFeatures = Array.isArray(land.features) ? land.features : [];
  const intersects = landFeatures.some(feature => {
    const candidate = record(record(feature).geometry);
    if (candidate.type !== 'Polygon' && candidate.type !== 'MultiPolygon') return false;
    try { return containsPoint([area.lng, area.lat], candidate as PolygonGeometry); } catch { return false; }
  });
  return <div className="space-y-4 py-3 text-base">
    <p>{area.name} • จุดอ้างอิง {area.lat.toFixed(4)}, {area.lng.toFixed(4)}</p>
    {data.failures > 0 && <p role="status">บางแหล่งไม่พร้อม แสดงเฉพาะหลักฐานที่ตรวจสอบได้</p>}
    <div><h4 className="font-bold">ดาวเทียม · จุดความร้อน</h4>
      <p>{fireReady ? `${recent.length} จุดอายุไม่เกิน 6 ชม. ${data.geometry ? 'ภายในขอบเขตหมู่บ้าน' : 'ในรัศมีข้อมูล 50 กม. รอบจุดอ้างอิง'}` : 'ประเมินจำนวนปัจจุบันไม่ได้: ข้อมูลหรือขอบเขตไม่พร้อม/เก่า'}</p>
      <p className="text-sm opacity-75">{String(fire.source ?? 'GISTDA / NASA FIRMS')} • ล่าสุดในชุดจุด {timeLabel(latest)} • ตรวจชุดข้อมูล {timeLabel(coverageTime)} • จุดความร้อนไม่ใช่การยืนยันไฟป่า</p>
    </div>
    <div><h4 className="font-bold">แบบจำลอง · PM2.5 ณ จุดอ้างอิง</h4>
      <p>{typeof air.pm2_5 === 'number' && airFreshness.status === 'fresh' ? `${air.pm2_5.toFixed(1)} µg/m³` : 'ไม่มีค่าปัจจุบันที่ใช้สรุปได้'}</p>
      <p className="text-sm opacity-75">CAMS ผ่าน Open-Meteo • {timeLabel(airTime)} • ไม่ใช่สถานีตรวจวัดหรือค่าเฉลี่ยทั้งหมู่บ้าน</p>
    </div>
    <div><h4 className="font-bold">สถานีตรวจวัด · รอบจุดอ้างอิงไม่เกิน 50 กม.</h4>
      <p>{data.rain === null || data.water === null ? 'ข้อมูลสถานีบางประเภทไม่พร้อม' : `${stations.filter(s => s.value !== null && s.freshness.status === 'fresh').length} รายการข้อมูลสดที่มีค่า จาก ${stations.length} รายการในรัศมี`}</p>
      <ul className="mt-2 space-y-2">{stations.slice(0, 5).map((station, index) => <li key={`${station.type}-${station.name}-${index}`} className="rounded-lg border border-current/20 p-2">
        {station.name} · {station.distanceKm.toFixed(1)} กม. · {station.type === 'rain' ? 'ฝน 24 ชม.' : 'ระดับน้ำ'}
        <p>{station.value !== null && station.freshness.status === 'fresh' ? `${station.value.toFixed(1)} ${station.type === 'rain' ? 'มม.' : 'ม.'}` : 'ประเมินไม่ได้ / ข้อมูลเก่าหรือไม่มีค่า'} {station.withinVillage === true ? '· ในขอบเขตหมู่บ้าน' : station.withinVillage === false ? '· นอกหมู่บ้าน' : ''}</p>
        <p className="text-sm opacity-75">ThaiWater / สทนช. • {timeLabel(station.freshness.observedAt)}</p>
      </li>)}</ul>
      <p className="mt-2 text-sm opacity-75">ระยะใกล้ไม่ยืนยันว่าอยู่ต้นน้ำ ต้องตรวจลุ่มน้ำและภาคสนามก่อนสรุปน้ำป่า</p>
      <Link className="mt-2 inline-block min-h-11 underline" href={areaHref('/center/flood', area)}>ดูสถานีทั้งหมดรอบจุดนี้ →</Link>
    </div>
    <div><h4 className="font-bold">พื้นที่อ้างอิง · ดินถล่ม</h4>
      <p>{data.land === null || !landFeatures.length ? 'ข้อมูลพื้นที่อ้างอิงไม่พร้อม' : intersects ? 'จุดอ้างอิงอยู่ในขอบเขตพื้นที่เสี่ยง' : 'จุดอ้างอิงไม่อยู่ในขอบเขตที่โหลดได้ ไม่ได้แปลว่าทั้งหมู่บ้านปลอดภัย'}</p>
      <p className="text-sm opacity-75">ชุด boluang_landslide_risk • ไม่ทราบวันสำรวจในชุดข้อมูล • ไม่ใช่สถานการณ์ปัจจุบัน</p>
    </div>
    <p className="text-sm opacity-75">รายงานประชาชน: ยังไม่มีชุดพิกัดที่ยืนยันและเปิดเผยได้สำหรับรวมในแผงนี้ โปรดตรวจผ่านระบบรับแจ้งเหตุ • หลักฐานนี้ไม่ออกประกาศหรือส่งแจ้งเตือนอัตโนมัติ</p>
  </div>;
}
export default function AreaEvidencePanel({ area }: { area: AreaContext }) {
  const [open, setOpen] = useState(false);
  return <details className="rounded-xl border border-slate-400/40 p-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer text-base font-bold">หลักฐานภัยรอบพื้นที่ที่เลือก</summary>
    {open && <EvidenceContent key={`${area.id}:${area.lat}:${area.lng}`} area={area} />}
  </details>;
}
