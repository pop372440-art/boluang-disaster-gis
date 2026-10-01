import { authenticateStaff, isStaffRole, staffErrorResponse } from '@/lib/staff/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'admin' });
    const [{ data: profiles, error: profileError }, usersResult] = await Promise.all([
      staff.client.from('staff_profiles').select('user_id,role,active,display_name,created_at,updated_at').order('created_at'),
      staff.client.auth.admin.listUsers({ page: 1, perPage: 100 }),
    ]);
    if (profileError) throw profileError;
    if (usersResult.error) throw usersResult.error;
    const emailById = new Map(usersResult.data.users.map(user => [user.id, user.email ?? null]));
    return Response.json({
      ok: true,
      users: (profiles ?? []).map(profile => ({ ...profile, email: emailById.get(profile.user_id) ?? null })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'admin' });
    const payload = await request.json().catch(() => ({})) as { userId?: string; role?: unknown; active?: unknown };
    if (!payload.userId || !isStaffRole(payload.role) || typeof payload.active !== 'boolean') {
      return Response.json({ ok: false, error: 'ข้อมูลสิทธิ์ไม่ถูกต้อง' }, { status: 400 });
    }
    if (payload.userId === staff.user.id) {
      return Response.json({ ok: false, error: 'ผู้ดูแลระบบไม่สามารถลดสิทธิ์หรือระงับบัญชีของตนเอง' }, { status: 409 });
    }
    const { data: previous, error: previousError } = await staff.client
      .from('staff_profiles')
      .select('user_id,role,active,display_name')
      .eq('user_id', payload.userId)
      .maybeSingle();
    if (previousError) throw previousError;
    if (!previous) return Response.json({ ok: false, error: 'ไม่พบบัญชีเจ้าหน้าที่' }, { status: 404 });

    const changedAt = new Date().toISOString();
    const { data: updated, error } = await staff.client.from('staff_profiles').update({
      role: payload.role,
      active: payload.active,
      updated_at: changedAt,
    }).eq('user_id', payload.userId).select('user_id,role,active,display_name').maybeSingle();
    if (error) throw error;
    if (!updated) return Response.json({ ok: false, error: 'บัญชีถูกแก้ไขไปแล้ว กรุณาโหลดข้อมูลใหม่' }, { status: 409 });

    const { error: auditError } = await staff.client.from('staff_audit_log').insert({
      actor_id: staff.user.id,
      actor_role: staff.role,
      action: 'staff_role_changed',
      old_data: previous,
      new_data: updated,
      ip_hash: staff.ipHash,
      session_hash: staff.sessionHash,
      created_at: changedAt,
    });
    if (auditError) throw auditError;
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
