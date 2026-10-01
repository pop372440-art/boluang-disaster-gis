import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  OPEN_DATA_INCIDENT_VERSION,
  buildIncidentCsv,
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
    return NextResponse.json({ ok: false, error: 'ระบบดาวน์โหลดข้อมูลยังไม่พร้อมใช้งาน' }, { status: 503, headers: ERROR_HEADERS });
  }

  try {
    const { records, truncated } = await fetchPublicIncidents(client);
    const body = Buffer.from(buildIncidentCsv(records), 'utf8');
    const digest = createHash('sha256').update(body).digest();
    const checksum = digest.toString('hex');

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Content-Disposition': 'attachment; filename="boluang-public-incidents.csv"',
        'Content-Type': 'text/csv; charset=utf-8',
        'Digest': `sha-256=${digest.toString('base64')}`,
        'ETag': `"${checksum}"`,
        'X-Content-Type-Options': 'nosniff',
        'X-Dataset-Version': OPEN_DATA_INCIDENT_VERSION,
        'X-Record-Count': String(records.length),
        'X-Result-Truncated': String(truncated),
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'open_data_incident_export_failed',
      at: new Date().toISOString(),
      code: typeof error === 'object' && error && 'code' in error ? error.code : 'unknown',
    }));
    return NextResponse.json({ ok: false, error: 'ไม่สามารถสร้างชุดข้อมูลได้ในขณะนี้' }, { status: 503, headers: ERROR_HEADERS });
  }
}
