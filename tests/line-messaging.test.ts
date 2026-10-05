import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { buildEnvironmentFlex, verifyLineSignature } from '../lib/environment/line-messaging.ts';

test('LINE webhook signature uses the unmodified raw body', () => {
  const body = '{"events":[]}';
  const secret = 'test-secret';
  const signature = createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(verifyLineSignature(body, signature, secret), true);
  assert.equal(verifyLineSignature(`${body}\n`, signature, secret), false);
});

test('public Flex message is explicitly approved language', () => {
  const message = buildEnvironmentFlex({
    id: 'candidate', source_kind: 'satellite', level: 'warning', reason: 'พบ Hotspot 3 จุด', evidence: {},
    village_name: 'บ้านบ่อหลวง', risk_type: 'ไฟป่า', occurred_at: '2026-10-04T12:00:00Z',
  }, 'public');
  assert.equal(message.type, 'flex');
  assert.match(message.altText, /เจ้าหน้าที่อนุมัติ/);
});
