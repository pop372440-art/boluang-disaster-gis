import { randomBytes, randomUUID } from 'node:crypto';
import { INCIDENT_RISK_TYPES } from '@/lib/incident-ai';
import { takeRateLimit } from '@/lib/report-status/rate-limit';
import { safeImageExtension } from '@/lib/staff/report-data';
import { staffServerClient } from '@/lib/staff/security';
import { createEnvironmentalCandidate, reportAlertLevel } from '@/lib/environment/server/alert-store';
import { dispatchEnvironmentOutbox, publicIncidentDescription } from '@/lib/environment/line-messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const REPORTER_ROLES = new Set(['ประชาชนทั่วไป', 'ผู้นำชุมชน/กำนัน/ผู้ใหญ่บ้าน', 'เจ้าหน้าที่รัฐ/อปท.']);
const VILLAGES = new Set([
  'บ้านบ่อหลวง', 'บ้านวังกอง', 'บ้านขุน', 'บ้านนาฟ่อน', 'บ้านแม่ลายเหนือ', 'บ้านแม่ลายใต้',
  'บ้านพุย', 'บ้านกิ่วลม', 'บ้านแม่สะนาม', 'บ้านเตียนอาง', 'บ้านบ่อสะแง๋', 'บ้านบ่อพะแวน', 'บ้านแม่หืด',
]);

function noStore(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders } });
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;
  try {
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const limit = takeRateLimit(`incident-submit:${ip}`, 5, 10 * 60 * 1000);
    if (!limit.allowed) return noStore({ ok: false, error: 'ส่งข้อมูลถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' }, 429, { 'Retry-After': String(limit.retryAfterSeconds) });

    const form = await request.formData();
    const villageName = String(form.get('village_name') || '').trim();
    const riskType = String(form.get('risk_type') || '').trim();
    const severityLevel = Number(form.get('severity_level'));
    const description = String(form.get('description') || '').trim();
    const reporterName = String(form.get('reporter_name') || '').trim() || 'ไม่ระบุชื่อ';
    const reporterRole = String(form.get('reporter_role') || '').trim();
    const latitude = Number(form.get('latitude'));
    const longitude = Number(form.get('longitude'));
    const image = form.get('image');

    if (!VILLAGES.has(villageName) || !INCIDENT_RISK_TYPES.includes(riskType as (typeof INCIDENT_RISK_TYPES)[number])) {
      return noStore({ ok: false, error: 'หมู่บ้านหรือประเภทเหตุไม่ถูกต้อง' }, 400);
    }
    if (!Number.isInteger(severityLevel) || severityLevel < 1 || severityLevel > 5) return noStore({ ok: false, error: 'ระดับความรุนแรงไม่ถูกต้อง' }, 400);
    if (description.length < 5 || description.length > 2000 || reporterName.length > 120 || !REPORTER_ROLES.has(reporterRole)) {
      return noStore({ ok: false, error: 'รายละเอียดหรือข้อมูลผู้แจ้งไม่ถูกต้อง' }, 400);
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 17.9 || latitude > 18.4 || longitude < 98.1 || longitude > 98.6) {
      return noStore({ ok: false, error: 'พิกัดอยู่นอกพื้นที่ให้บริการตำบลบ่อหลวง' }, 400);
    }
    if (!(image instanceof File) || image.size === 0) return noStore({ ok: false, error: 'กรุณาแนบภาพเหตุการณ์' }, 400);
    const extension = safeImageExtension(image);
    if (!extension || image.size > MAX_IMAGE_BYTES) return noStore({ ok: false, error: 'รองรับเฉพาะ JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB' }, 400);

    const client = staffServerClient();
    uploadedPath = `reports/${randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from('disaster_images').upload(uploadedPath, image, {
      contentType: image.type,
      cacheControl: '31536000',
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const trackingToken = `BL_${randomBytes(24).toString('base64url')}`;
    const { data: report, error: insertError } = await client.from('boluang_disaster_reports').insert({
      village_name: villageName,
      risk_type: riskType,
      severity_level: severityLevel,
      description,
      reporter_name: reporterName,
      reporter_role: reporterRole,
      latitude,
      longitude,
      image_url: uploadedPath,
      tracking_code: trackingToken,
      status: 'รับเรื่องแล้ว',
      workflow_state: 'received',
    }).select('id,created_at').single();
    if (insertError) throw insertError;

    try {
      await createEnvironmentalCandidate({
        sourceKind: 'citizen_report',
        level: reportAlertLevel(severityLevel),
        reason: `รับแจ้งเหตุ ${riskType} ระดับ ${severityLevel} จาก ${villageName} — รอเจ้าหน้าที่ตรวจสอบ`,
        evidence: {
          reportId: report.id,
          severityLevel,
          latitude,
          longitude,
          imagePath: uploadedPath,
          imageAttached: true,
          incidentDescription: publicIncidentDescription(description),
        },
        villageName,
        riskType,
        reportId: report.id,
        occurredAt: report.created_at,
      }, client);
      await dispatchEnvironmentOutbox(client);
    } catch {
      console.error(JSON.stringify({ event: 'alert_candidate_from_report_failed', reportId: report.id, at: new Date().toISOString() }));
    }

    return noStore({ ok: true, trackingToken }, 201);
  } catch (error) {
    if (uploadedPath) {
      try { await staffServerClient().storage.from('disaster_images').remove([uploadedPath]); } catch { /* best-effort cleanup */ }
    }
    console.error(JSON.stringify({ event: 'public_incident_submission_failed', at: new Date().toISOString() }));
    return noStore({ ok: false, error: 'ไม่สามารถส่งข้อมูลได้ในขณะนี้ กรุณาลองใหม่ภายหลัง' }, 503);
  }
}
