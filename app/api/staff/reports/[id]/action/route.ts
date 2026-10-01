import { randomUUID } from 'node:crypto';
import { authenticateStaff, staffErrorResponse, staffServerClient } from '@/lib/staff/security';
import { safeImageExtension } from '@/lib/staff/report-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const uploadedPaths: string[] = [];
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'operator' });
    const form = await request.formData();
    const details = String(form.get('details') || '').trim();
    if (details.length < 3 || details.length > 4000) {
      return Response.json({ ok: false, error: 'รายละเอียดการดำเนินงานต้องมี 3–4,000 ตัวอักษร' }, { status: 400 });
    }

    const { data: report, error: reportError } = await staff.client
      .from('boluang_disaster_reports')
      .select('id,workflow_state,status')
      .eq('id', params.id)
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) return Response.json({ ok: false, error: 'ไม่พบรายการแจ้งเหตุ' }, { status: 404 });
    if (!['received', 'in_progress'].includes(report.workflow_state)) {
      return Response.json({ ok: false, error: 'รายการนี้ปิดเหตุแล้วหรือกำลังรออนุมัติ' }, { status: 409 });
    }

    for (const key of ['image1', 'image2']) {
      const value = form.get(key);
      if (!(value instanceof File) || value.size === 0) continue;
      const extension = safeImageExtension(value);
      if (!extension || value.size > MAX_IMAGE_BYTES) {
        return Response.json({ ok: false, error: 'รองรับเฉพาะ JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB' }, { status: 400 });
      }
      const path = `staff-results/${params.id}/${randomUUID()}.${extension}`;
      const { error: uploadError } = await staff.client.storage.from('disaster_images').upload(path, value, { contentType: value.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
    }

    const now = new Date().toISOString();
    const { data: action, error: actionError } = await staff.client.from('staff_case_actions').insert({
      report_id: params.id,
      action_kind: 'closure_request',
      details,
      image_paths: uploadedPaths,
      actor_id: staff.user.id,
      actor_role: staff.role,
      ip_hash: staff.ipHash,
      session_hash: staff.sessionHash,
    }).select('id').single();
    if (actionError) throw actionError;

    const { data: updatedReport, error: updateError } = await staff.client.from('boluang_disaster_reports').update({
      status: 'รออนุมัติปิดเหตุ',
      workflow_state: 'pending_approval',
      action_taken: details,
      resolved_image_url: uploadedPaths[0] ?? null,
      resolved_image_url_2: uploadedPaths[1] ?? null,
      closure_requested_at: now,
      closure_requested_by: staff.user.id,
      last_modified_at: now,
      last_modified_by: staff.user.id,
      last_modified_role: staff.role,
      last_ip_hash: staff.ipHash,
      last_session_hash: staff.sessionHash,
    }).eq('id', params.id).in('workflow_state', ['received', 'in_progress']).select('id').maybeSingle();
    if (updateError || !updatedReport) {
      await staff.client.from('staff_case_actions').delete().eq('id', action.id);
      if (updateError) throw updateError;
      return Response.json({ ok: false, error: 'สถานะรายการเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่' }, { status: 409 });
    }

    return Response.json({ ok: true, status: 'รออนุมัติปิดเหตุ' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (uploadedPaths.length) {
      try {
        const client = staffServerClient();
        await client.storage.from('disaster_images').remove(uploadedPaths);
      } catch { /* best-effort cleanup */ }
    }
    return staffErrorResponse(error);
  }
}
