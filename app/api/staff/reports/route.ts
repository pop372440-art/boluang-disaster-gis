import { authenticateStaff, staffErrorResponse } from '@/lib/staff/security';
import { decorateStaffReports, STAFF_ACTION_SELECT, STAFF_REPORT_SELECT } from '@/lib/staff/report-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const staff = await authenticateStaff(request);
    const scope = new URL(request.url).searchParams.get('scope') || 'active';
    let query = staff.client.from('boluang_disaster_reports').select(STAFF_REPORT_SELECT).order('created_at', { ascending: false }).limit(500);
    if (scope === 'closed') query = query.eq('workflow_state', 'closed');
    else if (scope === 'pending_approval') query = query.eq('workflow_state', 'pending_approval');
    else query = query.in('workflow_state', ['received', 'in_progress']);

    const { data, error } = await query;
    if (error) throw error;
    const reports = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string }>;
    const ids = reports.map(report => report.id);
    const actionsResult = ids.length
      ? await staff.client.from('staff_case_actions').select(STAFF_ACTION_SELECT).in('report_id', ids).order('created_at', { ascending: false })
      : { data: [], error: null };
    if (actionsResult.error) throw actionsResult.error;

    return Response.json({
      ok: true,
      scope,
      role: staff.role,
      reports: await decorateStaffReports(staff.client, reports, (actionsResult.data ?? []) as unknown as Array<Record<string, unknown> & { report_id: string }>),
    }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
