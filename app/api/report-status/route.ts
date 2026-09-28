import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  REPORT_STATUS_SELECT,
  isLegacyTrackingCode,
  isOpaqueTrackingToken,
  normalizeTrackingToken,
  storageObjectPath,
  toPublicReportStatus,
  type ReportStatusRow,
} from '@/lib/report-status/security';
import { takeRateLimit } from '@/lib/report-status/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } });
}

function requestAddress(request: NextRequest) {
  return request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

function fingerprint(value: string) {
  const pepper = process.env.REPORT_STATUS_AUDIT_PEPPER
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || 'report-status';
  return createHash('sha256').update(`${pepper}:${value}`).digest('hex').slice(0, 16);
}

function audit(event: Record<string, unknown>) {
  console.info(JSON.stringify({ event: 'public_report_status_lookup', at: new Date().toISOString(), ...event }));
}

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

async function signedImageUrl(client: any, value: string | null) {
  const path = storageObjectPath(value);
  if (!path) return null;
  const { data, error } = await client.storage.from('disaster_images').createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const ipHash = fingerprint(requestAddress(request));
  const ipLimit = takeRateLimit(`ip:${ipHash}`, 10, 10 * 60 * 1000);
  if (!ipLimit.allowed) {
    audit({ requestId, ipHash, result: 'rate_limited', scope: 'ip' });
    return json(
      { ok: false, error: 'ลองค้นหาหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      429,
      { 'Retry-After': String(ipLimit.retryAfterSeconds) },
    );
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 2048) return json({ ok: false, error: 'คำขอไม่ถูกต้อง' }, 413);

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'คำขอไม่ถูกต้อง' }, 400);
  }

  const token = normalizeTrackingToken(body.token);
  const tokenHash = fingerprint(token);
  const allowLegacy = process.env.REPORT_STATUS_ALLOW_LEGACY_CODES === 'true';
  if (!isOpaqueTrackingToken(token) && !(allowLegacy && isLegacyTrackingCode(token))) {
    audit({ requestId, ipHash, tokenHash, result: 'invalid_token' });
    return json({ ok: false, error: 'ไม่พบคำร้อง หรือโทเคนติดตามไม่ถูกต้อง' }, 404);
  }

  const tokenLimit = takeRateLimit(`token:${ipHash}:${tokenHash}`, 4, 2 * 60 * 1000);
  if (!tokenLimit.allowed) {
    audit({ requestId, ipHash, tokenHash, result: 'rate_limited', scope: 'token' });
    return json(
      { ok: false, error: 'ลองค้นหาโทเคนนี้หลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      429,
      { 'Retry-After': String(tokenLimit.retryAfterSeconds) },
    );
  }

  const client = serverClient();
  if (!client) {
    audit({ requestId, ipHash, tokenHash, result: 'configuration_error' });
    return json({ ok: false, error: 'ระบบติดตามยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง' }, 503);
  }

  const { data, error } = await client
    .from('boluang_disaster_reports')
    .select(REPORT_STATUS_SELECT)
    .eq('tracking_code', token)
    .maybeSingle();

  if (error) {
    audit({ requestId, ipHash, tokenHash, result: 'database_error', code: error.code });
    return json({ ok: false, error: 'ระบบติดตามขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง' }, 503);
  }
  if (!data) {
    audit({ requestId, ipHash, tokenHash, result: 'not_found' });
    return json({ ok: false, error: 'ไม่พบคำร้อง หรือโทเคนติดตามไม่ถูกต้อง' }, 404);
  }

  const [before, after] = await Promise.all([
    signedImageUrl(client, data.image_url),
    signedImageUrl(client, data.resolved_image_url),
  ]);
  const hasSignedImage = Boolean(before || after);
  const report = toPublicReportStatus(data as ReportStatusRow, {
    before,
    after,
    expiresAt: hasSignedImage ? new Date(Date.now() + 300_000).toISOString() : null,
  });

  audit({ requestId, ipHash, tokenHash, result: 'found' });
  return json({ ok: true, report }, 200);
}
