import { authenticateStaff, staffErrorResponse } from '@/lib/staff/security';
import { dispatchEnvironmentOutbox } from '@/lib/environment/line-messaging';
import { publicRoutingScopeForCandidate } from '@/lib/environment/line-messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'viewer' });
    const { data, error } = await staff.client.from('environment_alert_candidates')
      .select('id,source_kind,level,status,reason,evidence,village_name,risk_type,report_id,observation_id,occurred_at,reviewed_at,reviewed_by,review_note,created_at,environment_notification_outbox(audience,notification_kind,status,attempt_count,last_error,sent_at,environment_notification_deliveries(line_target_id,status,provider_status,created_at))')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    const { data: destinations, error: destinationError } = await staff.client.from('line_group_destinations')
      .select('line_target_id,routing_scope').eq('active', true);
    if (destinationError) throw destinationError;
    const scopeByTarget = new Map((destinations ?? []).map(destination => [destination.line_target_id, destination.routing_scope]));
    const candidates = (data ?? []).map(candidate => ({
      ...candidate,
      public_routing_scope: publicRoutingScopeForCandidate(candidate),
      environment_notification_outbox: (candidate.environment_notification_outbox ?? []).map(outbox => ({
        audience: outbox.audience,
        notification_kind: outbox.notification_kind,
        status: outbox.status,
        attempt_count: outbox.attempt_count,
        last_error: outbox.last_error,
        sent_at: outbox.sent_at,
        destination_deliveries: (outbox.environment_notification_deliveries ?? []).map(delivery => ({
          routing_scope: scopeByTarget.get(delivery.line_target_id) ?? null,
          status: delivery.status,
          provider_status: delivery.provider_status,
          created_at: delivery.created_at,
        })),
      })),
    }));
    return Response.json({
      ok: true,
      candidates,
      deliveryConfiguration: { lineChannelAccessToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN) },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'approver' });
    const payload = await request.json().catch(() => ({})) as { action?: string; candidateId?: string; eventId?: string; decision?: string; note?: string };
    const candidateId = String(payload.candidateId || payload.eventId || '').trim();
    const validCandidateId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId);

    if (payload.action === 'retry_delivery') {
      if (!validCandidateId) return Response.json({ ok: false, error: 'รหัสรายการแจ้งเตือนไม่ถูกต้อง' }, { status: 400 });
      const { data: resetRows, error: resetError } = await staff.client.from('environment_notification_outbox')
        .update({ status: 'pending', next_attempt_at: new Date().toISOString(), last_error: null })
        .eq('candidate_id', candidateId)
        .eq('notification_kind', 'preliminary')
        .in('status', ['failed', 'dead'])
        .select('id');
      if (resetError) throw resetError;
      if (!resetRows?.length) return Response.json({ ok: false, error: 'ไม่พบคิว LINE ที่ส่งไม่สำเร็จสำหรับรายการนี้' }, { status: 409 });

      const delivery = await dispatchEnvironmentOutbox(staff.client);
      await staff.client.from('staff_audit_log').insert({
        alert_candidate_id: candidateId,
        actor_id: staff.user.id,
        actor_role: staff.role,
        action: 'environment_alert_delivery_retry',
        old_data: { failedRows: resetRows.length },
        new_data: delivery,
        ip_hash: staff.ipHash,
        session_hash: staff.sessionHash,
      });
      return Response.json({ ok: true, delivery }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const decision = payload.decision;
    const note = String(payload.note || '').trim();
    if (!validCandidateId || !['approve', 'reject'].includes(decision || '')) {
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
