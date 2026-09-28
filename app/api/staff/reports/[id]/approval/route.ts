import { authenticateStaff, staffErrorResponse } from '@/lib/staff/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'approver' });
    const payload = await request.json().catch(() => ({})) as { decision?: string; note?: string };
    const decision = payload.decision;
    const note = String(payload.note || '').trim();
    if (!['approve', 'reject'].includes(decision || '')) {
      return Response.json({ ok: false, error: 'คำสั่งอนุมัติไม่ถูกต้อง' }, { status: 400 });
    }
    if (note.length > 2000) return Response.json({ ok: false, error: 'หมายเหตุยาวเกิน 2,000 ตัวอักษร' }, { status: 400 });

    const { data: report, error: reportError } = await staff.client
      .from('boluang_disaster_reports')
      .select('id,workflow_state,action_taken')
      .eq('id', params.id)
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) return Response.json({ ok: false, error: 'ไม่พบรายการแจ้งเหตุ' }, { status: 404 });
    if (report.workflow_state !== 'pending_approval') {
      return Response.json({ ok: false, error: 'รายการนี้ไม่ได้อยู่ระหว่างรออนุมัติปิดเหตุ' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const approved = decision === 'approve';
    const next = approved ? {
      status: 'ดำเนินการเสร็จแล้ว', workflow_state: 'closed', resolved_at: now,
      resolved_by: staff.user.email || staff.user.id, approved_at: now, approved_by: staff.user.id,
      approval_note: note || 'อนุมัติปิดเหตุ',
    } : {
      status: 'กำลังดำเนินการ', workflow_state: 'in_progress', resolved_at: null,
      resolved_by: null, approved_at: null, approved_by: null,
      approval_note: note || 'ส่งกลับให้ดำเนินการเพิ่มเติม',
    };
    const { data: updatedReport, error: updateError } = await staff.client.from('boluang_disaster_reports').update({
      ...next,
      last_modified_at: now,
      last_modified_by: staff.user.id,
      last_modified_role: staff.role,
      last_ip_hash: staff.ipHash,
      last_session_hash: staff.sessionHash,
    }).eq('id', params.id).eq('workflow_state', 'pending_approval').select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updatedReport) {
      return Response.json({ ok: false, error: 'รายการนี้ถูกอนุมัติหรือส่งกลับไปแล้ว กรุณาโหลดข้อมูลใหม่' }, { status: 409 });
    }

    const { error: actionError } = await staff.client.from('staff_case_actions').insert({
      report_id: params.id,
      action_kind: approved ? 'closure_approval' : 'closure_rejection',
      details: note || (approved ? 'อนุมัติปิดเหตุ' : 'ส่งกลับให้ดำเนินการเพิ่มเติม'),
      actor_id: staff.user.id,
      actor_role: staff.role,
      ip_hash: staff.ipHash,
      session_hash: staff.sessionHash,
    });
    if (actionError) throw actionError;

    return Response.json({ ok: true, status: next.status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
