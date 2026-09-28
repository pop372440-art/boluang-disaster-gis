import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Open Data Portal | Bo Luang Disaster GIS',
  description: 'บัญชีชุดข้อมูลสาธารณะ Metadata และ Data Dictionary ของเทศบาลตำบลบ่อหลวง',
};

type DatasetCardProps = {
  icon: string;
  title: string;
  description: string;
  version: string;
  updated: string;
  frequency: string;
  owner: string;
  status: 'published' | 'context' | 'withheld';
  notice: string;
  actions?: Array<{ href: string; label: string; download?: string }>;
};

const statusPresentation = {
  published: { label: 'เผยแพร่', className: 'border-emerald-700 bg-emerald-950/70 text-emerald-300' },
  context: { label: 'ข้อมูลบริบท', className: 'border-amber-700 bg-amber-950/70 text-amber-200' },
  withheld: { label: 'ระงับเผยแพร่ชั่วคราว', className: 'border-rose-700 bg-rose-950/70 text-rose-200' },
};

function DatasetCard({ icon, title, description, version, updated, frequency, owner, status, notice, actions = [] }: DatasetCardProps) {
  const presentation = statusPresentation[status];
  return (
    <article className="rounded-2xl border border-slate-700 bg-slate-800/80 p-5 shadow-lg md:p-6">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 text-xl" aria-hidden="true">{icon}</span>
            <h2 className="text-lg font-extrabold text-white">{title}</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${presentation.className}`}>{presentation.label}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg bg-slate-950/60 p-3"><dt className="text-slate-500">รุ่นข้อมูล</dt><dd className="mt-1 break-words font-semibold text-slate-200">{version}</dd></div>
            <div className="rounded-lg bg-slate-950/60 p-3"><dt className="text-slate-500">ปรับปรุง/ออกรุ่น</dt><dd className="mt-1 font-semibold text-slate-200">{updated}</dd></div>
            <div className="rounded-lg bg-slate-950/60 p-3"><dt className="text-slate-500">ความถี่</dt><dd className="mt-1 font-semibold text-slate-200">{frequency}</dd></div>
            <div className="rounded-lg bg-slate-950/60 p-3"><dt className="text-slate-500">ผู้ดูแลข้อมูล</dt><dd className="mt-1 font-semibold text-slate-200">{owner}</dd></div>
          </dl>
          <p className={`mt-4 rounded-lg border p-3 text-xs leading-5 ${status === 'withheld' ? 'border-rose-800 bg-rose-950/40 text-rose-200' : 'border-slate-700 bg-slate-900/60 text-slate-300'}`}>{notice}</p>
        </div>
        <div className="flex min-w-[190px] flex-col gap-2 lg:pt-1">
          {actions.map(action => (
            <a key={action.href} href={action.href} download={action.download} className="rounded-xl border border-sky-500 bg-sky-700 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
              {action.label}
            </a>
          ))}
          {!actions.length ? <span className="cursor-not-allowed rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-center text-sm font-bold text-slate-400" aria-disabled="true">ยังไม่เปิดให้ดาวน์โหลด</span> : null}
        </div>
      </div>
    </article>
  );
}

export default function OpenDataPage() {
  return (
    <div className="min-h-screen bg-[#050b14] pb-20 text-white">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#0b132b]/95 px-4 py-4 backdrop-blur-xl md:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-xl shadow-lg shadow-blue-500/20" aria-hidden="true">⇩</div>
            <div><h1 className="text-xl font-black md:text-2xl">Open Data Portal</h1><p className="text-xs text-slate-400 md:text-sm">บัญชีชุดข้อมูลสาธารณะ เทศบาลตำบลบ่อหลวง</p></div>
          </div>
          <Link href="/" className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-bold transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">← กลับหน้าหลัก</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 md:px-6">
        <section className="rounded-2xl border border-amber-800/70 bg-amber-950/30 p-5 md:p-6" aria-labelledby="license-title">
          <h2 id="license-title" className="text-lg font-bold text-amber-200">สถานะสัญญาอนุญาตและข้อกำหนดการใช้</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            เทศบาลยังไม่ได้ประกาศชื่อสัญญาอนุญาตข้อมูลเปิดอย่างเป็นทางการ การเปิดให้ดาวน์โหลดจึงไม่ควรถูกตีความว่าเป็น Public Domain หรือ Open Government License
            ผู้ใช้ควรอ้างอิงแหล่งที่มา ตรวจข้อจำกัดของแต่ละชุด และติดต่อเทศบาลก่อนเผยแพร่ต่อหรือใช้เชิงพาณิชย์
          </p>
          <p className="mt-2 text-xs text-amber-300">เมื่อเทศบาลอนุมัติสัญญาอนุญาตแล้ว ต้องอัปเดต catalog และหน้าชุดข้อมูลก่อนใช้ข้อความว่า “ใช้ได้ฟรี” หรือ “Open License”</p>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="เอกสารกำกับชุดข้อมูล">
          <a href="/open-data/catalog.json" className="rounded-xl border border-sky-900 bg-sky-950/40 p-4 transition hover:border-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"><strong className="text-sky-300">Metadata Catalog</strong><span className="mt-1 block text-xs text-slate-400">เจ้าของ รุ่น วันที่ ความถี่ สถานะ และ checksum</span></a>
          <a href="/open-data/data-dictionary.json" className="rounded-xl border border-indigo-900 bg-indigo-950/40 p-4 transition hover:border-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"><strong className="text-indigo-300">Data Dictionary</strong><span className="mt-1 block text-xs text-slate-400">ความหมายฟิลด์และข้อมูลที่ถูกตัดออก</span></a>
          <a href="/geojson/metadata.json" className="rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 transition hover:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"><strong className="text-emerald-300">GIS Metadata</strong><span className="mt-1 block text-xs text-slate-400">CRS, provenance, ข้อจำกัด และ SHA-256</span></a>
        </section>

        <section className="space-y-5" aria-label="รายการชุดข้อมูล">
          <DatasetCard
            icon="🚨"
            title="ข้อมูลสรุปการรับแจ้งเหตุสาธารณะ"
            description="ชุดข้อมูลลดความเสี่ยงด้าน PDPA เหลือเฉพาะวันที่ ประเภทเหตุ ระดับความรุนแรง หมู่บ้าน และสถานะ ไม่รวมข้อความอิสระหรือพิกัด"
            version="incidents-public-v1.0"
            updated="ณ เวลาดาวน์โหลด"
            frequency="cache ประมาณ 60 วินาที"
            owner="เทศบาลตำบลบ่อหลวง"
            status="published"
            notice="CSV มี checksum ใน Digest/ETag header และป้องกัน CSV formula injection; JSON API คืน field allowlist ชุดเดียวกัน"
            actions={[
              { href: '/api/open-data/incidents', label: 'ดาวน์โหลด CSV' },
              { href: '/api/reports', label: 'เปิด JSON API' },
            ]}
          />
          <DatasetCard
            icon="🏥"
            title="ศูนย์พักพิงและจุดปลอดภัย"
            description="พิกัด 17 แห่งเดิมเป็นข้อมูล hard-coded ที่ยังไม่มีหลักฐานการตรวจรับรอง วันสำรวจ และเจ้าของข้อมูล จึงระงับการดาวน์โหลดเพื่อป้องกันการนำพิกัดที่คลาดเคลื่อนไปใช้ในเหตุฉุกเฉิน"
            version="ยังไม่มีรุ่นที่รับรอง"
            updated="รอตรวจภาคสนาม"
            frequency="หลังเจ้าหน้าที่รับรอง"
            owner="รอยืนยันผู้รับผิดชอบ"
            status="withheld"
            notice="เปิดเผยได้เมื่อมีผู้ตรวจสอบ วันที่ตรวจ พิกัดที่ยืนยัน ประเภทความพร้อม ความจุ ช่องทางติดต่อ และรอบทบทวนข้อมูล"
          />
          <DatasetCard
            icon="🗺️"
            title="ขอบเขตตำบลบ่อหลวง"
            description="GeoJSON สำหรับแสดงและวิเคราะห์ภาพรวมระดับตำบล ไม่ใช่แนวเขตทางกฎหมายหรือข้อมูลระดับแปลง"
            version="boundary-2026.09.28.1"
            updated="28 ก.ย. 2569 (วันออกรุ่น)"
            frequency="เมื่อผ่านการตรวจสอบ"
            owner="เทศบาลตำบลบ่อหลวง (ผู้ดูแลสำเนา)"
            status="published"
            notice="ไฟล์ต้นทางไม่บันทึกหน่วยงานเจ้าของและวันที่สำรวจ โปรดตรวจ GIS Metadata และ checksum ก่อนใช้"
            actions={[{ href: '/geojson/boluang.json', label: 'ดาวน์โหลด GeoJSON', download: 'boluang-boundary.geojson' }]}
          />
          <DatasetCard
            icon="⚠️"
            title="พื้นที่ความไวต่อดินถล่ม"
            description="Polygon ระดับความไวต่อดินถล่มสำหรับบริบทการวางแผน ไม่ใช่จุดเกิดเหตุภาคสนามและไม่ใช่ประกาศเตือนภัย"
            version="landslide-2026.09.28.1"
            updated="28 ก.ย. 2569 (วันออกรุ่น)"
            frequency="เมื่อผ่านการตรวจสอบ"
            owner="รอยืนยันหน่วยงานต้นทาง"
            status="context"
            notice="นำข้อความอ้างหน่วยงานเดิมออกจนกว่าจะมีหลักฐาน provenance; ห้ามใช้ชั้นข้อมูลนี้เพียงชุดเดียวเพื่อสั่งอพยพหรือตัดสินความปลอดภัย"
            actions={[{ href: '/geojson/boluang_landslide_risk.json', label: 'ดาวน์โหลด GeoJSON', download: 'boluang-landslide-susceptibility.geojson' }]}
          />
          <DatasetCard
            icon="🏘️"
            title="ขอบเขต 13 หมู่บ้าน"
            description="GeoJSON สำหรับการวิเคราะห์ระดับหมู่บ้าน ใช้รหัสคงที่ moo-1 ถึง moo-13 หลัง normalization ไม่ใช่แนวเขตกรรมสิทธิ์ที่ดิน"
            version="villages-2026.09.28.1"
            updated="28 ก.ย. 2569 (วันออกรุ่น)"
            frequency="เมื่อผ่านการตรวจสอบ"
            owner="เทศบาลตำบลบ่อหลวง (ผู้ดูแลสำเนา)"
            status="published"
            notice="ชื่อเดิมอ้างถึงแผนที่ภาษี แต่ source file ไม่มี provenance และวันที่สำรวจ จึงต้องใช้พร้อมคำเตือนนี้"
            actions={[{ href: '/geojson/block.json', label: 'ดาวน์โหลด GeoJSON', download: 'boluang-village-boundaries.geojson' }]}
          />
        </section>
      </main>
    </div>
  );
}
