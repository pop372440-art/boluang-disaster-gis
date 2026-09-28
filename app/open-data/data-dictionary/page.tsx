import type { Metadata } from 'next';
import dictionary from '@/public/open-data/data-dictionary.json';
import { DetailRow, DocumentPage, SummaryGrid } from '../_components/document-page';

export const metadata: Metadata = { title: 'พจนานุกรมข้อมูล | Open Data บ่อหลวง' };

const datasetTitles: Record<string, string> = {
  'boluang-public-incidents': 'ข้อมูลสรุปการรับแจ้งเหตุสาธารณะ',
  'boluang-boundary': 'ขอบเขตตำบลบ่อหลวง',
  'boluang-village-boundaries': 'ขอบเขต 13 หมู่บ้าน',
  'boluang-landslide-susceptibility': 'พื้นที่ความไวต่อดินถล่ม',
};

type DictionaryDataset = {
  fields?: Record<string, string>;
  excluded_fields?: string[];
  geometry?: string[];
  crs?: string;
  use_level?: string;
};

export default function DataDictionaryPage() {
  const datasets = Object.entries(dictionary.datasets) as Array<[string, DictionaryDataset]>;
  return (
    <DocumentPage eyebrow="Data Dictionary" title="พจนานุกรมข้อมูล" description="อธิบายความหมายของฟิลด์ รูปแบบข้อมูล ระดับการใช้งาน และรายการข้อมูลส่วนบุคคลที่ระบบตัดออกก่อนเผยแพร่" rawHref="/open-data/data-dictionary.json" rawFilename="boluang-data-dictionary.json">
      <SummaryGrid items={[
        { label: 'รุ่นพจนานุกรม', value: dictionary.dictionary_version },
        { label: 'จำนวนชุดข้อมูล', value: `${datasets.length} ชุด` },
        { label: 'ระบบพิกัด GIS', value: 'EPSG:4326' },
        { label: 'หลักการเผยแพร่', value: 'เปิดเผยเท่าที่จำเป็นและลดความละเอียดข้อมูล' },
      ]} />
      <section className="space-y-4" aria-labelledby="dictionary-title">
        <h2 id="dictionary-title" className="text-xl font-extrabold">รายละเอียดฟิลด์</h2>
        {datasets.map(([datasetId, dataset]) => (
          <article key={datasetId} className="rounded-2xl border border-slate-700 bg-slate-800/80 p-5 md:p-6">
            <h3 className="text-lg font-extrabold">{datasetTitles[datasetId] ?? datasetId}</h3>
            <p className="mt-1 font-mono text-xs text-slate-500">{datasetId}</p>
            {dataset.fields ? (
              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-700">
                <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
                  <thead className="bg-slate-900"><tr><th className="px-4 py-3 font-bold text-slate-300">ชื่อฟิลด์</th><th className="px-4 py-3 font-bold text-slate-300">ความหมาย</th></tr></thead>
                  <tbody className="divide-y divide-slate-700">{Object.entries(dataset.fields).map(([field, meaning]) => <tr key={field}><th scope="row" className="whitespace-nowrap px-4 py-3 font-mono text-sky-300">{field}</th><td className="px-4 py-3 leading-6 text-slate-200">{meaning}</td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
            <dl className="mt-4">
              {dataset.geometry ? <DetailRow label="Geometry">{dataset.geometry.join(', ')}</DetailRow> : null}
              {dataset.crs ? <DetailRow label="ระบบพิกัด">{dataset.crs}</DetailRow> : null}
              {dataset.use_level ? <DetailRow label="ระดับการใช้งาน">{dataset.use_level}</DetailRow> : null}
              {dataset.excluded_fields ? <DetailRow label="ข้อมูลที่ตัดออก"><ul className="list-disc space-y-1 pl-5">{dataset.excluded_fields.map(field => <li key={field}>{field}</li>)}</ul></DetailRow> : null}
            </dl>
          </article>
        ))}
      </section>
    </DocumentPage>
  );
}
