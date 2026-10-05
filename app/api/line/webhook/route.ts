import { environmentAdminClient } from '@/lib/environment/server/alert-store';
import { verifyLineSignature } from '@/lib/environment/line-messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LineEvent = {
  type?: string;
  timestamp?: number;
  source?: { type?: 'user' | 'group' | 'room'; userId?: string; groupId?: string; roomId?: string };
  message?: { type?: string; text?: string };
};

function parseRegistration(text: string | undefined) {
  const match = text?.trim().match(/^ลงทะเบียนกลุ่ม\s+(เจ้าหน้าที่|สาธารณะ)\s+(.+)$/);
  if (!match) return null;
  return { audience: match[1] === 'เจ้าหน้าที่' ? 'staff' as const : 'public' as const, token: match[2].trim() };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyLineSignature(rawBody, request.headers.get('x-line-signature'), process.env.LINE_CHANNEL_SECRET)) {
    return Response.json({ ok: false, error: 'invalid signature' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const payload = JSON.parse(rawBody || '{}') as { events?: LineEvent[] };
  const registrationSecret = process.env.LINE_GROUP_REGISTRATION_TOKEN;
  if (!registrationSecret) return Response.json({ ok: true, registered: 0 }, { headers: { 'Cache-Control': 'no-store' } });

  const client = environmentAdminClient();
  let registered = 0;
  for (const event of payload.events ?? []) {
    const registration = parseRegistration(event.message?.type === 'text' ? event.message.text : undefined);
    const targetId = event.source?.groupId ?? event.source?.roomId;
    if (!registration || registration.token !== registrationSecret || !targetId) continue;
    const { error } = await client.from('line_group_destinations').upsert({
      line_target_id: targetId,
      target_type: event.source?.groupId ? 'group' : 'room',
      audience: registration.audience,
      active: true,
      last_event_at: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
    }, { onConflict: 'audience' });
    if (error) throw error;
    registered += 1;
  }
  return Response.json({ ok: true, registered }, { headers: { 'Cache-Control': 'no-store' } });
}
