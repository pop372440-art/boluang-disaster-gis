import { authenticateStaff, staffErrorResponse } from '@/lib/staff/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const staff = await authenticateStaff(request, { minimumRole: 'admin' });
    const { data, error } = await staff.client.from('staff_audit_log')
      .select('id,report_id,actor_id,actor_role,action,ip_hash,session_hash,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return Response.json({ ok: true, events: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

