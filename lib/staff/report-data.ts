import type { SupabaseClient } from '@supabase/supabase-js';
import { storageObjectPath } from '@/lib/report-status/security';

export const STAFF_REPORT_SELECT = [
  'id', 'created_at', 'reporter_name', 'reporter_role', 'risk_type', 'severity_level',
  'description', 'latitude', 'longitude', 'village_name', 'status', 'workflow_state',
  'resolved_at', 'action_taken', 'resolved_by', 'image_url',
  'resolved_image_url', 'resolved_image_url_2', 'closure_requested_at', 'approved_at',
  'approval_note',
].join(',');

export const STAFF_ACTION_SELECT = 'id,report_id,action_kind,details,image_paths,actor_id,actor_role,created_at' as const;

type ReportRow = Record<string, unknown> & {
  id: string;
  image_url?: string | null;
  resolved_image_url?: string | null;
  resolved_image_url_2?: string | null;
};

type ActionRow = Record<string, unknown> & { report_id: string; image_paths?: string[] | null };

async function signedUrl(client: SupabaseClient, value: unknown) {
  const path = storageObjectPath(typeof value === 'string' ? value : null);
  if (!path) return null;
  const { data, error } = await client.storage.from('disaster_images').createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}

export async function decorateStaffReports(client: SupabaseClient, reports: ReportRow[], actions: ActionRow[]) {
  const actionsByReport = new Map<string, ActionRow[]>();
  for (const action of actions) {
    const list = actionsByReport.get(action.report_id) || [];
    list.push(action);
    actionsByReport.set(action.report_id, list);
  }

  return Promise.all(reports.map(async report => {
    const reportActions = actionsByReport.get(report.id) || [];
    const [beforeImageUrl, resultImageUrl, resultImageUrl2, decoratedActions] = await Promise.all([
      signedUrl(client, report.image_url),
      signedUrl(client, report.resolved_image_url),
      signedUrl(client, report.resolved_image_url_2),
      Promise.all(reportActions.map(async action => ({
        ...action,
        imageUrls: await Promise.all((action.image_paths || []).map(path => signedUrl(client, path))),
        image_paths: undefined,
      }))),
    ]);
    return {
      ...report,
      image_url: undefined,
      resolved_image_url: undefined,
      resolved_image_url_2: undefined,
      beforeImageUrl,
      resultImageUrl,
      resultImageUrl2,
      actions: decoratedActions,
      imageExpiresInSeconds: 300,
    };
  }));
}

export function safeImageExtension(file: File) {
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  return extensions[file.type] || null;
}
