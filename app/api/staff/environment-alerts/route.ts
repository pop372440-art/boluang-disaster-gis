import { authenticateStaff, staffErrorResponse } from '@/lib/staff/security';
import { dispatchEnvironmentOutbox } from '@/lib/environment/line-messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'viewer' });
    const { data, error } = await staff.client.from('environment_alert_candidates')
      .select('id,source_kind,level,status,reason,evidence,village_name,risk_type,report_id,observation_id,occurred_at,reviewed_at,reviewed_by,review_note,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return Response.json({ ok: true, candidates: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'approver' });
    const payload = await request.json().catch(() => ({})) as { candidateId?: string; eventId?: string; decision?: string; note?: string };
    const candidateId = String(payload.candidateId || payload.eventId || '').trim();
    const decision = payload.decision;
    const note = String(payload.note || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId) || !['approve', 'reject'].includes(decision || '')) {
      return Response.json({ ok: false, error: 'คำสั่งอนุมัติไม่ถูกต้อง' }, { status: 400 });
    }
    if (note.length < 3) return Response.json({ ok: false, error: 'กรุณาระบุเหตุผลหรือหลักฐานอย่างน้อย 3 ตัวอักษร' }, { status: 400 });
    if (note.length > 2000) return Response.json({ ok: false, error: 'หมายเหตุยาวเกิน 2,000 ตัวอักษร' }, { status: 400 });

    const { data, error } = await staff.client.rpc('review_environment_alert_candidate_v2', {
      p_candidate_id: candidateId,
      p_decision: decision,
      p_note: note,
      p_actor_id: staff.user.id,
      p_actor_role: staff.role,
      p_ip_hash: staff.ipHash,
      p_session_hash: staff.sessionHash,
    });
    if (error) {
      if (/already reviewed/i.test(error.message)) return Response.json({ ok: false, error: 'รายการนี้ได้รับการพิจารณาแล้ว' }, { status: 409 });
      if (/not found/i.test(error.message)) return Response.json({ ok: false, error: 'ไม่พบรายการเสนอเตือน' }, { status: 404 });
      throw error;
    }

    const delivery = await dispatchEnvironmentOutbox(staff.client);
    return Response.json({ ok: true, review: data, delivery }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
