'use client';

import Link from 'next/link';
import { areaHref, type AreaContext, type VillageContext } from '@/lib/gis/area-context';

interface Props {
  area: AreaContext;
  villages: VillageContext[];
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onPreset: (preset: 'water' | 'fire' | 'report') => void;
  onClose: () => void;
}
export default function AreaContextPanel({ area, villages, loading, error, onSelect, onPreset, onClose }: Props) {
  return <section aria-labelledby="area-context-title" className="bl-area-context mb-4 space-y-3 rounded-xl border border-sky-200 bg-white p-4 text-slate-900">
    <div className="flex items-center justify-between gap-2">
      <h2 id="area-context-title" className="font-bold text-cyan-700">พื้นที่ที่กำลังตรวจสอบ</h2>
      <button type="button" aria-label="ปิดแผงชั้นข้อมูล" onClick={onClose} className="min-h-11 shrink-0 rounded-lg border border-slate-200 px-3 text-xs">ปิด</button>
    </div>
    <label htmlFor="village-context" className="block text-xs">เลือกหมู่บ้านจากขอบเขตจริง</label>
    <select id="village-context" className="min-h-11 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm" value={area.id} onChange={e => onSelect(e.target.value)}>
      <option value="bo-luang">ภาพรวมตำบลบ่อหลวง</option>
      {area.id === 'point' && <option value="point">พิกัดที่เลือก · {area.name}</option>}
      {villages.map(village => <option key={village.id} value={village.id}>หมู่ {village.id.slice(4)} · {village.name}</option>)}
    </select>
    {loading && <p role="status" className="text-xs text-slate-700">กำลังโหลดขอบเขตหมู่บ้าน…</p>}
    {error && <p role="status" className="text-xs text-amber-700">{error}</p>}
    <p className="text-xs text-slate-700">จุดตัวแทน {area.lat.toFixed(4)}, {area.lng.toFixed(4)} • ไม่ใช่ค่าตรวจวัดครอบคลุมทั้งหมู่บ้าน</p>
    <div className="grid grid-cols-2 gap-2 text-xs font-bold">
      <Link className="flex min-h-11 items-center justify-center rounded-lg bg-sky-50 p-2" href={areaHref('/center/weather', area)}>อากาศของพื้นที่นี้</Link>
      <Link className="flex min-h-11 items-center justify-center rounded-lg bg-blue-50 p-2" href={areaHref('/center/flood', area)}>สถานีรอบพื้นที่นี้</Link>
    </div>
    <p className="text-xs text-slate-600">เปิดชั้นข้อมูลเป็นชุด</p>
    <div className="grid grid-cols-3 gap-2 text-[11px]">
      <button onClick={() => onPreset('water')} className="min-h-11 rounded-lg border border-slate-200 px-1">ฝน / พื้นที่เสี่ยง</button>
      <button onClick={() => onPreset('fire')} className="min-h-11 rounded-lg border border-slate-200 px-1">ไฟป่า / ฝุ่น</button>
      <button onClick={() => onPreset('report')} className="min-h-11 rounded-lg border border-slate-200 px-1">รายงาน / ที่พัก</button>
    </div>
    <p className="text-[11px] text-slate-600">สีขอบเขตใช้แยกหมู่บ้าน ไม่ใช่ระดับภัย</p>
  </section>;
}
