import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type CandidateRow = {
  id: string;
  source_kind: string;
  level: string;
  reason: string;
  evidence: Record<string, unknown> | null;
  village_name: string | null;
  risk_type: string | null;
  occurred_at: string;
};

export function verifyLineSignature(rawBody: string, signature: string | null, secret: string | undefined) {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

const levelLabel: Record<string, string> = { watch: 'เฝ้าระวัง', warning: 'ควรตรวจสอบเร่งด่วน', critical: 'วิกฤต—รอการยืนยัน' };

export function buildEnvironmentFlex(candidate: CandidateRow, audience: 'staff' | 'public') {
  const isPublic = audience === 'public';
  const title = isPublic ? 'ประกาศสถานการณ์ที่เจ้าหน้าที่อนุมัติ' : 'หลักฐานใหม่—ยังไม่ใช่ประกาศเตือน';
  const footer = isPublic
    ? 'ติดตามประกาศและคำแนะนำจากเทศบาลตำบลบ่อหลวง'
    : 'โปรดตรวจข้อมูลต้นทาง/ภาคสนามใน Staff Portal ก่อนอนุมัติ';
  return {
    type: 'flex',
    altText: `${title}: ${candidate.reason}`.slice(0, 400),
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: isPublic ? '#B91C1C' : '#92400E', contents: [
        { type: 'text', text: title, color: '#FFFFFF', weight: 'bold', wrap: true },
      ] },
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
        { type: 'text', text: levelLabel[candidate.level] ?? candidate.level, weight: 'bold', size: 'xl', wrap: true },
        { type: 'text', text: candidate.reason, wrap: true, color: '#334155' },
        { type: 'text', text: `พื้นที่: ${candidate.village_name || 'ตำบลบ่อหลวง'}`, size: 'sm', color: '#64748B', wrap: true },
        { type: 'text', text: `แหล่ง: ${candidate.source_kind} · เวลา ${new Date(candidate.occurred_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`, size: 'xs', color: '#64748B', wrap: true },
      ] },
      footer: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: footer, size: 'xs', color: '#64748B', wrap: true },
      ] },
    },
  };
}

async function pushLine(target: string, message: ReturnType<typeof buildEnvironmentFlex>, retryKey: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return { ok: false, status: 0, body: 'LINE_CHANNEL_ACCESS_TOKEN not configured' };
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Line-Retry-Key': retryKey,
    },
    body: JSON.stringify({ to: target, messages: [message] }),
  });
  return { ok: response.ok, status: response.status, body: (await response.text()).slice(0, 1_000) };
}

export async function dispatchEnvironmentOutbox(client: SupabaseClient, limit = 20) {
  const { data: rows, error } = await client.from('environment_notification_outbox')
    .select('id,candidate_id,audience,retry_key,attempt_count,environment_alert_candidates(id,source_kind,level,reason,evidence,village_name,risk_type,occurred_at)')
    .in('status', ['pending', 'failed']).lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true }).limit(limit);
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const candidateValue = row.environment_alert_candidates as unknown as CandidateRow | CandidateRow[] | null;
    const candidate = Array.isArray(candidateValue) ? candidateValue[0] : candidateValue;
    if (!candidate) continue;
    const audience = row.audience as 'staff' | 'public';
    const { data: configured } = await client.from('line_group_destinations')
      .select('line_target_id').eq('audience', audience).eq('active', true);
    const fallback = audience === 'staff' ? process.env.LINE_ALERT_STAFF_GROUP_ID : process.env.LINE_ALERT_PUBLIC_GROUP_ID;
    const targets = configured?.[0]?.line_target_id ? [configured[0].line_target_id] : fallback ? [fallback] : [];
    if (!targets.length) {
      await client.from('environment_notification_outbox').update({ status: 'failed', last_error: `no ${audience} destination`, attempt_count: row.attempt_count + 1, next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString() }).eq('id', row.id);
      failed += 1;
      continue;
    }

    const message = buildEnvironmentFlex(candidate, audience);
    const results = await Promise.all(targets.map(async (target) => {
      const result = await pushLine(target, message, row.retry_key);
      await client.from('environment_notification_deliveries').insert({
        outbox_id: row.id, line_target_id: target, status: result.ok ? 'sent' : 'failed',
        provider_status: result.status, provider_response: result.body,
      });
      return result;
    }));
    const allSent = results.every(result => result.ok);
    await client.from('environment_notification_outbox').update(allSent ? {
      status: 'sent', sent_at: new Date().toISOString(), last_error: null, attempt_count: row.attempt_count + 1,
    } : {
      status: row.attempt_count >= 4 ? 'dead' : 'failed',
      last_error: results.filter(result => !result.ok).map(result => `${result.status}:${result.body}`).join(' | ').slice(0, 2_000),
      attempt_count: row.attempt_count + 1,
      next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** (row.attempt_count + 1)) * 60_000).toISOString(),
    }).eq('id', row.id);
    if (allSent) sent += 1; else failed += 1;
  }
  return { processed: (rows ?? []).length, sent, failed };
}
