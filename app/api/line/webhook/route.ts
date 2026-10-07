import { environmentAdminClient } from '@/lib/environment/server/alert-store';
import { verifyLineSignature } from '@/lib/environment/line-messaging';
import { parseLineGroupRegistration, registrationSuccessText } from '@/lib/environment/line-registration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LineEvent = {
  type?: string;
  replyToken?: string;
  timestamp?: number;
  source?: { type?: 'user' | 'group' | 'room'; userId?: string; groupId?: string; roomId?: string };
  message?: { type?: string; text?: string };
};

async function replyRegistration(replyToken: string | undefined, text: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!replyToken || !accessToken) return false;
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  return response.ok;
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
    const registration = parseLineGroupRegistration(event.message?.type === 'text' ? event.message.text : undefined);
    const targetId = event.source?.groupId ?? event.source?.roomId;
    if (!registration || registration.token !== registrationSecret || !targetId) continue;
    const { error } = await client.from('line_group_destinations').upsert({
      line_target_id: targetId,
      target_type: event.source?.groupId ? 'group' : 'room',
      audience: registration.audience,
      routing_scope: registration.routingScope,
      active: true,
      last_event_at: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
    }, { onConflict: 'line_target_id' });
    if (error) throw error;
    registered += 1;
    const replied = await replyRegistration(event.replyToken, registrationSuccessText(registration.audience, registration.routingScope));
    if (!replied) console.error(JSON.stringify({ event: 'line_group_registered_without_reply', audience: registration.audience, at: new Date().toISOString() }));
  }
  return Response.json({ ok: true, registered }, { headers: { 'Cache-Control': 'no-store' } });
}
