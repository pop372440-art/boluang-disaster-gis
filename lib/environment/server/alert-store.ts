import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { staffServerClient } from '@/lib/staff/security';
import { notificationAudiencesForSource } from '@/lib/environment/notification-policy';

export type EnvironmentalAlertLevel = 'watch' | 'warning' | 'critical';
export type EnvironmentalCandidateInput = {
  sourceKind: 'satellite' | 'model' | 'citizen_report';
  level: EnvironmentalAlertLevel;
  reason: string;
  evidence: Record<string, unknown>;
  villageName?: string | null;
  riskType?: string | null;
  reportId?: string | null;
  observationId?: string | null;
  occurredAt: string;
};

const evidenceHash = (input: EnvironmentalCandidateInput) => createHash('sha256').update(JSON.stringify({
  sourceKind: input.sourceKind,
  level: input.level,
  reportId: input.reportId,
  villageName: input.villageName,
  occurredHour: input.occurredAt.slice(0, 13),
  evidence: input.evidence,
})).digest('hex');

export function environmentAdminClient() {
  return staffServerClient();
}

export async function createEnvironmentalCandidate(
  input: EnvironmentalCandidateInput,
  client: SupabaseClient = environmentAdminClient(),
) {
  const dedupeKey = evidenceHash(input);
  const { data: existing, error: existingError } = await client.from('environment_alert_candidates')
    .select('id,status').eq('dedupe_key', dedupeKey).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { candidate: existing, created: false };

  const { data: candidate, error } = await client.from('environment_alert_candidates').insert({
    source_kind: input.sourceKind,
    level: input.level,
    reason: input.reason,
    evidence: input.evidence,
    village_name: input.villageName ?? null,
    risk_type: input.riskType ?? null,
    report_id: input.reportId ?? null,
    observation_id: input.observationId ?? null,
    occurred_at: input.occurredAt,
    dedupe_key: dedupeKey,
    status: 'proposed',
  }).select('id,status,source_kind,level,reason,evidence,village_name,risk_type,occurred_at,created_at').single();
  if (error) throw error;

  const audiences = notificationAudiencesForSource(input.sourceKind);
  const { error: outboxError } = await client.from('environment_notification_outbox').insert(audiences.map(audience => ({
    candidate_id: candidate.id,
    audience,
    notification_kind: 'preliminary',
    status: 'pending',
    retry_key: randomUUID(),
    payload: { candidateId: candidate.id, notificationKind: 'preliminary' },
  })));
  if (outboxError) throw outboxError;
  return { candidate, created: true };
}

export function reportAlertLevel(severity: number): EnvironmentalAlertLevel {
  return severity >= 5 ? 'critical' : severity >= 3 ? 'warning' : 'watch';
}
