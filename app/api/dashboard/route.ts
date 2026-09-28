import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  PUBLIC_DASHBOARD_SELECT,
  toPublicIncident,
  type DashboardRow,
} from '@/lib/dashboard/public-dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
  'X-Content-Type-Options': 'nosniff',
};

const ERROR_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function GET() {
  const client = serverClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: 'ระบบสรุปข้อมูลยังไม่พร้อมใช้งาน' },
      { status: 503, headers: ERROR_HEADERS },
    );
  }

  const { data, error } = await client
    .from('boluang_disaster_reports')
    .select(PUBLIC_DASHBOARD_SELECT)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error(JSON.stringify({
      event: 'public_dashboard_fetch_failed',
      at: new Date().toISOString(),
      code: error.code,
    }));
    return NextResponse.json(
      { ok: false, error: 'ไม่สามารถโหลดข้อมูลสรุปได้ในขณะนี้' },
      { status: 503, headers: ERROR_HEADERS },
    );
  }

  const incidents = ((data ?? []) as unknown as DashboardRow[])
    .map(toPublicIncident)
    .filter((incident): incident is NonNullable<typeof incident> => incident !== null);
  const generatedAt = new Date().toISOString();

  return NextResponse.json({
    ok: true,
    metadata: {
      generatedAt,
      newestIncidentAt: incidents[0]?.createdAt ?? null,
      source: 'ระบบรับแจ้งเหตุเทศบาลตำบลบ่อหลวง',
      dataType: 'ข้อมูลที่ประชาชนส่งและเจ้าหน้าที่ปรับสถานะ',
      refreshSeconds: 60,
      rowLimit: 1000,
      truncated: incidents.length === 1000,
    },
    incidents,
  }, { headers: HEADERS });
}
