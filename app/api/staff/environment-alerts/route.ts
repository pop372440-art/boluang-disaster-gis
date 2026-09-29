import { authenticateStaff, staffErrorResponse } from '@/lib/staff/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'viewer' });
    const [eventsResult, statesResult] = await Promise.all([
      staff.client.from('radar_alert_events')
        .select('id,village_id,from_level,to_level,decision,reason,actor_id,snapshot_id,created_at')
        .order('created_at', { ascending: false }).limit(100),
      staff.client.from('radar_alert_states')
        .select('village_id,current_level,changed_at,notification_status,suppression_reason,updated_at')
        .order('updated_at', { ascending: false }).limit(13),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (statesResult.error) throw statesResult.error;
    return Response.json({ ok: true, events: eventsResult.data ?? [], states: statesResult.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'approver' });
    const payload = await request.json().catch(() => ({})) as { eventId?: string; decision?: string; note?: string };
    const eventId = String(payload.eventId || '').trim();
    const decision = payload.decision;
    const note = String(payload.note || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId) || !['approve', 'reject'].includes(decision || '')) return Response.json({ ok: false, error: 'คำสั่งอนุมัติไม่ถูกต้อง' }, { status: 400 });
    if (note.length < 3) return Response.json({ ok: false, error: 'กรุณาระบุเหตุผลหรือหลักฐานอย่างน้อย 3 ตัวอักษร' }, { status: 400 });
    if (note.length > 2000) return Response.json({ ok: false, error: 'หมายเหตุยาวเกิน 2,000 ตัวอักษร' }, { status: 400 });

    const { data: event, error: eventError } = await staff.client.from('radar_alert_events')
      .select('id,village_id,from_level,to_level,decision,reason,snapshot_id,created_at')
      .eq('id', eventId).maybeSingle();
    if (eventError) throw eventError;
    if (!event) return Response.json({ ok: false, error: 'ไม่พบรายการเสนอเตือน' }, { status: 404 });
    if (event.decision !== 'proposed') return Response.json({ ok: false, error: 'รายการนี้ได้รับการพิจารณาแล้ว' }, { status: 409 });

    const nextDecision = decision === 'approve' ? 'approved' : 'rejected';
    const reason = note;
    const { data: updated, error: updateError } = await staff.client.from('radar_alert_events').update({
      decision: nextDecision, reason, actor_id: staff.user.id,
    }).eq('id', eventId).eq('decision', 'proposed').select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return Response.json({ ok: false, error: 'รายการนี้ถูกพิจารณาไปแล้ว กรุณาโหลดข้อมูลใหม่' }, { status: 409 });

    const { error: stateError } = await staff.client.from('radar_alert_states').update({
      notification_status: nextDecision,
      suppression_reason: decision === 'reject' ? reason : null,
      updated_at: new Date().toISOString(),
    }).eq('village_id', event.village_id);
    if (stateError) throw stateError;

    const { error: auditError } = await staff.client.from('staff_audit_log').insert({
      actor_id: staff.user.id, actor_role: staff.role,
      action: decision === 'approve' ? 'environment_alert_approved' : 'environment_alert_rejected',
      old_data: event,
      new_data: { ...event, decision: nextDecision, reason },
      ip_hash: staff.ipHash, session_hash: staff.sessionHash,
    });
    if (auditError) throw auditError;

    return Response.json({ ok: true, decision: nextDecision }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
