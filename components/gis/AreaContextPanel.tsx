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
  return <section aria-labelledby="area-context-title" className="mb-4 space-y-3 rounded-2xl border border-cyan-700 bg-slate-900 p-4 text-slate-100">
    <div className="flex items-center justify-between gap-2">
      <h2 id="area-context-title" className="font-bold text-cyan-200">พื้นที่ที่กำลังตรวจสอบ</h2>
      <button type="button" aria-label="ปิดแผงพื้นที่" onClick={onClose} className="min-h-11 shrink-0 rounded-lg border border-slate-600 px-3 text-xs lg:hidden">ปิดแผง</button>
    </div>
    <label htmlFor="village-context" className="block text-xs">เลือกหมู่บ้านจากขอบเขตจริง</label>
    <select id="village-context" className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-sm" value={area.id} onChange={e => onSelect(e.target.value)}>
      <option value="bo-luang">ภาพรวมตำบลบ่อหลวง</option>
      {villages.map(village => <option key={village.id} value={village.id}>หมู่ {village.id.slice(4)} · {village.name}</option>)}
    </select>
    {loading && <p role="status" className="text-xs text-slate-300">กำลังโหลดขอบเขตหมู่บ้าน…</p>}
    {error && <p role="status" className="text-xs text-amber-300">{error}</p>}
    <p className="text-sm font-bold">{area.name}</p>
    <p className="text-xs text-slate-300">จุดตัวแทน {area.lat.toFixed(4)}, {area.lng.toFixed(4)} • ไม่ใช่ค่าตรวจวัดครอบคลุมทั้งหมู่บ้าน</p>
    <div className="grid grid-cols-2 gap-2 text-xs font-bold">
      <Link className="flex min-h-11 items-center justify-center rounded-lg bg-cyan-900 p-2" href={areaHref('/center/weather', area)}>ฝนและอากาศของจุดนี้</Link>
      <Link className="flex min-h-11 items-center justify-center rounded-lg bg-blue-900 p-2" href={areaHref('/center/flood', area)}>สถานีน้ำและฝนรอบจุดนี้</Link>
    </div>
    <p className="text-xs text-slate-400">ชุดชั้นข้อมูลสำหรับงาน</p>
    <div className="flex flex-wrap gap-2 text-xs">
      <button onClick={() => onPreset('water')} className="min-h-11 rounded-lg border border-slate-600 px-3">น้ำป่า</button>
      <button onClick={() => onPreset('fire')} className="min-h-11 rounded-lg border border-slate-600 px-3">ไฟป่าและฝุ่น</button>
      <button onClick={() => onPreset('report')} className="min-h-11 rounded-lg border border-slate-600 px-3">แจ้งเหตุและจุดปลอดภัย</button>
    </div>
    <p className="text-xs text-slate-400">สีขอบเขตใช้แยกหมู่บ้าน ไม่ใช่ระดับภัย • พื้นที่ดินถล่มเป็นข้อมูลอ้างอิง ไม่ใช่คำเตือนปัจจุบัน</p>
  </section>;
}
