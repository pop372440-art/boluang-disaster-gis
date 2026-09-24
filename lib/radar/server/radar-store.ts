import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { AlertState, OperationalAlertLevel } from '../alert-state-machine';

const adminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

export async function readPersistedAlertStates() {
  const client = adminClient();
  if (!client) return new Map<string, AlertState>();
  const { data, error } = await client.from('radar_alert_states').select('*');
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.village_id, {
    current: row.current_level as OperationalAlertLevel,
    startedAt: row.started_at,
    changedAt: row.changed_at,
    pendingTarget: row.pending_target as OperationalAlertLevel | null,
    pendingCycles: row.pending_cycles,
    notificationStatus: row.notification_status,
    suppressionReason: row.suppression_reason,
  } as AlertState]));
}

export async function readLatestVillageSnapshots() {
  const client = adminClient();
  if (!client) return null;
  const { data, error } = await client
    .from('radar_village_snapshots')
    .select('*, radar_forecast_runs(source, model, model_run_at, fetched_at, freshness)')
    .order('observed_at', { ascending: false })
    .limit(13);
  if (error) throw error;
  return data;
}
