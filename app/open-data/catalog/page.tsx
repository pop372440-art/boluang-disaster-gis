import type { Metadata } from 'next';
import catalog from '@/public/open-data/catalog.json';
import { DetailRow, DocumentPage, SummaryGrid } from '../_components/document-page';

export const metadata: Metadata = { title: 'บัญชีชุดข้อมูล | Open Data บ่อหลวง' };

const statusLabels: Record<string, { label: string; className: string }> = {
  published_public_safe: { label: 'เผยแพร่แบบลดข้อมูลส่วนบุคคล', className: 'border-emerald-700 bg-emerald-950/60 text-emerald-200' },
  withheld_pending_official_verification: { label: 'ระงับเผยแพร่เพื่อรอตรวจรับรอง', className: 'border-rose-700 bg-rose-950/60 text-rose-200' },
  published_with_provenance_warning: { label: 'เผยแพร่พร้อมคำเตือนแหล่งที่มา', className: 'border-amber-700 bg-amber-950/60 text-amber-200' },
  published_context_only: { label: 'เผยแพร่เพื่อใช้เป็นข้อมูลบริบท', className: 'border-sky-700 bg-sky-950/60 text-sky-200' },
};

export default function CatalogPage() {
  return (
    <DocumentPage eyebrow="Metadata Catalog" title="บัญชีชุดข้อมูลสาธารณะ" description="สรุปเจ้าของข้อมูล รุ่น วันที่ปรับปรุง ความถี่ สถานะการเผยแพร่ และข้อจำกัดของแต่ละชุดข้อมูลในรูปแบบที่อ่านง่าย" rawHref="/open-data/catalog.json" rawFilename="boluang-open-data-catalog.json">
      <SummaryGrid items={[
        { label: 'รุ่นบัญชีข้อมูล', value: catalog.catalog_version },
        { label: 'วันที่เผยแพร่', value: catalog.published_at },
        { label: 'เจ้าของบัญชีข้อมูล', value: catalog.owner },
        { label: 'สัญญาอนุญาต', value: catalog.license_status },
      ]} />
      <section className="space-y-4" aria-labelledby="datasets-title">
        <h2 id="datasets-title" className="text-xl font-extrabold">ชุดข้อมูลทั้งหมด {catalog.datasets.length} รายการ</h2>
        {catalog.datasets.map(dataset => {
          const status = statusLabels[dataset.publication_status] ?? { label: dataset.publication_status, className: 'border-slate-600 bg-slate-800 text-slate-200' };
          return (
            <article key={dataset.dataset_id} className="rounded-2xl border border-slate-700 bg-slate-800/80 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-lg font-extrabold">{dataset.title}</h3><p className="mt-1 font-mono text-xs text-slate-500">{dataset.dataset_id}</p></div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
              </div>
              <dl className="mt-4">
                <DetailRow label="รุ่นข้อมูล">{dataset.version ?? 'ยังไม่มีรุ่นที่รับรอง'}</DetailRow>
                <DetailRow label="รูปแบบ">{dataset.format.length ? dataset.format.join(', ') : 'ยังไม่เปิดให้ดาวน์โหลด'}</DetailRow>
                <DetailRow label="ปรับปรุงล่าสุด">{dataset.updated_at ?? 'รอตรวจรับรอง'}</DetailRow>
                <DetailRow label="ความถี่">{dataset.frequency}</DetailRow>
                <DetailRow label="ผู้ดูแลข้อมูล">{dataset.owner}</DetailRow>
                {'privacy' in dataset ? <DetailRow label="ความเป็นส่วนตัว">{dataset.privacy}</DetailRow> : null}
                <DetailRow label="Checksum">{dataset.checksum ?? 'ยังไม่มี'}</DetailRow>
              </dl>
            </article>
          );
        })}
      </section>
    </DocumentPage>
  );
}
