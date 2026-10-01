import { NextResponse } from 'next/server';
import {
  OPEN_DATA_INCIDENT_VERSION,
  fetchPublicIncidents,
  openDataServerClient,
} from '@/lib/open-data/incidents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ERROR_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET() {
  const client = openDataServerClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: 'ระบบข้อมูลเปิดยังไม่พร้อมใช้งาน' }, { status: 503, headers: ERROR_HEADERS });
  }

  try {
    const { records, truncated } = await fetchPublicIncidents(client);
    return NextResponse.json({
      metadata: {
        datasetId: 'boluang-public-incidents',
        title: 'ข้อมูลสรุปการรับแจ้งเหตุสาธารณะ ตำบลบ่อหลวง',
        owner: 'เทศบาลตำบลบ่อหลวง',
        version: OPEN_DATA_INCIDENT_VERSION,
        generatedAt: new Date().toISOString(),
        frequency: 'ข้อมูล ณ เวลาที่เรียก API; CDN cache ประมาณ 60 วินาที',
        license: null,
        licenseStatus: 'รอเทศบาลอนุมัติและประกาศสัญญาอนุญาต',
        recordCount: records.length,
        truncated,
        privacy: 'ไม่รวมชื่อผู้แจ้ง รายละเอียดอิสระ รหัสติดตาม รูปภาพ หรือพิกัด',
      },
      data: records,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'X-Content-Type-Options': 'nosniff',
        'X-Dataset-Version': OPEN_DATA_INCIDENT_VERSION,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'open_data_incident_api_failed',
      at: new Date().toISOString(),
      code: typeof error === 'object' && error && 'code' in error ? error.code : 'unknown',
    }));
    return NextResponse.json({ ok: false, error: 'ไม่สามารถโหลดชุดข้อมูลได้ในขณะนี้' }, { status: 503, headers: ERROR_HEADERS });
  }
}
