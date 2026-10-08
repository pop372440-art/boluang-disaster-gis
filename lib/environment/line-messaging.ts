import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LineRoutingScope } from './line-registration';

type CandidateRow = {
  id: string;
  source_kind: string;
  level: string;
  reason: string;
  evidence: Record<string, unknown> | null;
  report_id: string | null;
  village_name: string | null;
  risk_type: string | null;
  occurred_at: string;
};

type NotificationKind = 'preliminary' | 'official_confirmed' | 'official_rejected';
type FlexContext = { notificationKind: NotificationKind; imageUrl?: string | null; mapUrl?: string | null };

export function publicIncidentDescription(value: unknown) {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[ปกปิดอีเมล]')
    .replace(/(?:\+66|0)[\d\s-]{8,14}/g, '[ปกปิดเบอร์โทร]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > 300 ? `${cleaned.slice(0, 297)}...` : cleaned;
}

export function resolveLineTargets(
  configured: Array<{ line_target_id: string; routing_scope: LineRoutingScope }> | null | undefined,
  fallback: string | undefined,
  routingScope: LineRoutingScope,
) {
  const targets = (configured ?? [])
    .filter(destination => destination.routing_scope === 'all' || destination.routing_scope === routingScope)
    .map(destination => destination.line_target_id)
    .filter((target): target is string => Boolean(target));
  if (fallback) targets.push(fallback);
  return [...new Set(targets)];
}

export function publicRoutingScopeForCandidate(candidate: Pick<CandidateRow, 'source_kind' | 'risk_type' | 'reason'>): 'wildfire' | 'general' {
  const text = `${candidate.risk_type ?? ''} ${candidate.reason}`.toLocaleLowerCase('th-TH');
  const wildfireCitizenReport = candidate.source_kind === 'citizen_report'
    && /ไฟป่า|ไฟไหม้ป่า|จุดความร้อน|hotspot/.test(text);
  const satelliteHotspot = candidate.source_kind === 'satellite';
  return wildfireCitizenReport || satelliteHotspot ? 'wildfire' : 'general';
}

export function getLinePublicImageUrl(client: SupabaseClient, imagePath: string | null) {
  if (!imagePath || !/\.(?:jpe?g|png)$/i.test(imagePath)) return null;
  const publicUrl = client.storage.from('disaster_images').getPublicUrl(imagePath).data.publicUrl;
  try {
    const url = new URL(publicUrl);
    return url.protocol === 'https:' && publicUrl.length <= 2_000 ? publicUrl : null;
  } catch {
    return null;
  }
}

export function verifyLineSignature(rawBody: string, signature: string | null, secret: string | undefined) {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

const levelLabel: Record<string, string> = { watch: 'เฝ้าระวัง', warning: 'ควรตรวจสอบเร่งด่วน', critical: 'วิกฤต—รอการยืนยัน' };

export function buildEnvironmentFlex(candidate: CandidateRow, audience: 'staff' | 'public', context: FlexContext = { notificationKind: 'preliminary' }) {
  const isPublic = audience === 'public';
  const incidentDescription = publicIncidentDescription(candidate.evidence?.incidentDescription);
  const title = context.notificationKind === 'official_confirmed'
    ? 'ยืนยันเหตุโดยเจ้าหน้าที่แล้ว'
    : context.notificationKind === 'official_rejected'
      ? 'แจ้งแก้ไข—ไม่ยืนยันเหตุ'
      : isPublic ? 'แจ้งเหตุเบื้องต้น—อยู่ระหว่างตรวจสอบ' : 'เหตุใหม่—ต้องตรวจสอบทันที';
  const footer = context.notificationKind === 'preliminary'
    ? isPublic
      ? 'ข้อมูลอัตโนมัติเพื่อการเฝ้าระวัง ยังไม่ใช่ประกาศหรือคำสั่งจากเทศบาล'
      : 'โปรดตรวจข้อมูลต้นทางและเข้าตรวจสอบภาคสนามโดยเร็ว'
    : context.notificationKind === 'official_confirmed'
      ? 'ผลตรวจสอบจากเจ้าหน้าที่เทศบาลตำบลบ่อหลวง'
      : 'รายการเดิมถูกยกเลิกหรือยังไม่มีหลักฐานยืนยัน โปรดติดตามข้อมูลล่าสุด';
  const headerColor = context.notificationKind === 'official_confirmed'
    ? '#047857'
    : context.notificationKind === 'official_rejected' ? '#475569' : isPublic ? '#B45309' : '#B91C1C';
  const actions = context.mapUrl ? [{
    type: 'button', style: 'primary', color: '#0369A1',
    action: { type: 'uri', label: 'เปิดพิกัดนำทาง', uri: context.mapUrl },
  }] : [];
  return {
    type: 'flex',
    altText: `${title}: ${candidate.reason}`.slice(0, 400),
    contents: {
      type: 'bubble',
      ...(context.imageUrl ? { hero: { type: 'image', url: context.imageUrl, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' } } : {}),
      header: { type: 'box', layout: 'vertical', backgroundColor: headerColor, contents: [
        { type: 'text', text: title, color: '#FFFFFF', weight: 'bold', wrap: true },
      ] },
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
        { type: 'text', text: levelLabel[candidate.level] ?? candidate.level, weight: 'bold', size: 'xl', wrap: true },
        { type: 'text', text: candidate.reason, wrap: true, color: '#334155' },
        ...(incidentDescription ? [
          { type: 'text', text: 'รายละเอียดเหตุการณ์', weight: 'bold', size: 'sm', color: '#0F172A', margin: 'md' },
          { type: 'text', text: incidentDescription, wrap: true, size: 'sm', color: '#334155' },
        ] : []),
        { type: 'text', text: `พื้นที่: ${candidate.village_name || 'ตำบลบ่อหลวง'}`, size: 'sm', color: '#64748B', wrap: true },
        { type: 'text', text: `แหล่ง: ${candidate.source_kind} · เวลา ${new Date(candidate.occurred_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`, size: 'xs', color: '#64748B', wrap: true },
      ] },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        ...actions,
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
    .select('id,candidate_id,audience,notification_kind,retry_key,attempt_count,environment_alert_candidates(id,source_kind,level,reason,evidence,report_id,village_name,risk_type,occurred_at)')
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
      .select('line_target_id,routing_scope').eq('audience', audience).eq('active', true);
    const routingScope = audience === 'staff' ? 'all' : publicRoutingScopeForCandidate(candidate);
    // The legacy public fallback is treated as the wildfire group. General
    // public alerts require an explicitly registered warning-network group so
    // they can never leak into the operational wildfire chat.
    const fallback = audience === 'staff'
      ? process.env.LINE_ALERT_STAFF_GROUP_ID
      : routingScope === 'wildfire' ? process.env.LINE_ALERT_PUBLIC_GROUP_ID : undefined;
    const targets = resolveLineTargets(configured, fallback, routingScope);
    if (!targets.length) {
      await client.from('environment_notification_outbox').update({ status: 'dead', last_error: `no ${audience} destination`, attempt_count: row.attempt_count + 1 }).eq('id', row.id);
      failed += 1;
      continue;
    }

    const evidence = candidate.evidence ?? {};
    const firstHotspot = Array.isArray(evidence.hotspots) && evidence.hotspots[0] && typeof evidence.hotspots[0] === 'object'
      ? evidence.hotspots[0] as Record<string, unknown> : null;
    const latitude = Number(evidence.latitude ?? firstHotspot?.latitude);
    const longitude = Number(evidence.longitude ?? firstHotspot?.longitude);
    const mapUrl = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` : null;
    const imagePath = typeof evidence.imagePath === 'string' ? evidence.imagePath : null;
    // LINE may fetch a Flex hero again when a user opens an older message. A
    // short-lived signed URL therefore leaves a permanent blank hero after it
    // expires. Report object names are unguessable UUIDs and this bucket is
    // intentionally public for public-alert media, so use its stable URL.
    const lineImageUrl = getLinePublicImageUrl(client, imagePath);
    const notificationKind = (['preliminary', 'official_confirmed', 'official_rejected'].includes(row.notification_kind)
      ? row.notification_kind : 'preliminary') as NotificationKind;
    const message = buildEnvironmentFlex(candidate, audience, {
      notificationKind,
      imageUrl: lineImageUrl,
      mapUrl,
    });
    const results = await Promise.all(targets.map(async (target) => {
      const result = await pushLine(target, message, row.retry_key);
      await client.from('environment_notification_deliveries').insert({
        outbox_id: row.id, line_target_id: target, status: result.ok ? 'sent' : 'failed',
        provider_status: result.status, provider_response: result.body,
      });
      return result;
    }));
    const allSent = results.every(result => result.ok);
    const quotaExceeded = results.some(result => result.status === 429);
    await client.from('environment_notification_outbox').update(allSent ? {
      status: 'sent', sent_at: new Date().toISOString(), last_error: null, attempt_count: row.attempt_count + 1,
    } : {
      status: quotaExceeded || row.attempt_count >= 4 ? 'dead' : 'failed',
      last_error: results.filter(result => !result.ok).map(result => `${result.status}:${result.body}`).join(' | ').slice(0, 2_000),
      attempt_count: row.attempt_count + 1,
      next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** (row.attempt_count + 1)) * 60_000).toISOString(),
    }).eq('id', row.id);
    if (allSent) sent += 1; else failed += 1;
  }
  return { processed: (rows ?? []).length, sent, failed };
}
