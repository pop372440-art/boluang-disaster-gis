import type { Metadata } from 'next';
import gisMetadata from '@/public/geojson/metadata.json';
import { DetailRow, DocumentPage, SummaryGrid } from '../_components/document-page';

export const metadata: Metadata = { title: 'GIS Metadata | Open Data บ่อหลวง' };

type GisDataset = {
  dataset_id: string;
  title: string;
  version: string;
  release_date: string;
  source_updated_at: string | null;
  update_frequency: string;
  geometry: string[];
  stable_id?: string;
  classification?: Record<string, string>;
  status: string;
  source_agency: string | null;
  source_note: string;
  sha256: string;
  limitations: string;
};

export default function GisMetadataPage() {
  const datasets = Object.entries(gisMetadata.datasets) as Array<[string, GisDataset]>;
  return (
    <DocumentPage eyebrow="GIS Metadata" title="ข้อมูลกำกับชุดข้อมูลภูมิสารสนเทศ" description="รายละเอียดระบบพิกัด รูปทรงเรขาคณิต แหล่งที่มา รุ่น checksum และข้อจำกัดของไฟล์ GeoJSON ที่เผยแพร่" rawHref="/geojson/metadata.json" rawFilename="boluang-gis-metadata.json">
      <SummaryGrid items={[
        { label: 'รุ่นบัญชี GIS', value: gisMetadata.catalog_version },
        { label: 'วันที่เผยแพร่', value: gisMetadata.published_at },
        { label: 'ระบบพิกัด', value: gisMetadata.crs },
        { label: 'สัญญาอนุญาต', value: gisMetadata.license_status },
      ]} />
      <section className="space-y-4" aria-labelledby="gis-datasets-title">
        <h2 id="gis-datasets-title" className="text-xl font-extrabold">ไฟล์ GIS {datasets.length} รายการ</h2>
        {datasets.map(([filename, dataset]) => (
          <article key={filename} className="rounded-2xl border border-slate-700 bg-slate-800/80 p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-lg font-extrabold">{dataset.title}</h3><p className="mt-1 font-mono text-xs text-slate-500">{filename} · {dataset.dataset_id}</p></div>
              <span className="rounded-full border border-sky-700 bg-sky-950/60 px-3 py-1 text-xs font-bold text-sky-200">{dataset.status}</span>
            </div>
            <dl className="mt-4">
              <DetailRow label="รุ่น / วันออกรุ่น">{dataset.version} · {dataset.release_date}</DetailRow>
              <DetailRow label="ข้อมูลต้นทางล่าสุด">{dataset.source_updated_at ?? 'ไฟล์ต้นทางไม่ได้ระบุ'}</DetailRow>
              <DetailRow label="ความถี่การปรับปรุง">{dataset.update_frequency}</DetailRow>
              <DetailRow label="Geometry">{dataset.geometry.join(', ')}</DetailRow>
              {dataset.stable_id ? <DetailRow label="รหัสอ้างอิงคงที่">{dataset.stable_id}</DetailRow> : null}
              {dataset.classification ? <DetailRow label="การจำแนกชั้น">{Object.entries(dataset.classification).map(([code, label]) => `${code} = ${label}`).join(', ')}</DetailRow> : null}
              <DetailRow label="หน่วยงานต้นทาง">{dataset.source_agency ?? 'รอยืนยัน'}</DetailRow>
              <DetailRow label="หมายเหตุแหล่งที่มา">{dataset.source_note}</DetailRow>
              <DetailRow label="SHA-256"><code className="break-all text-xs text-emerald-300">{dataset.sha256}</code></DetailRow>
              <DetailRow label="ข้อจำกัดสำคัญ"><strong className="text-amber-200">{dataset.limitations}</strong></DetailRow>
            </dl>
          </article>
        ))}
      </section>
    </DocumentPage>
  );
}
