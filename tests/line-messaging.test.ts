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

const candidate = {
    id: 'candidate', source_kind: 'satellite', level: 'warning', reason: 'พบ Hotspot 3 จุด', evidence: {},
    report_id: null, village_name: 'บ้านบ่อหลวง', risk_type: 'ไฟป่า', occurred_at: '2026-10-04T12:00:00Z',
};

test('public preliminary Flex is immediate but explicitly unverified', () => {
  const message = buildEnvironmentFlex(candidate, 'public', { notificationKind: 'preliminary', mapUrl: 'https://maps.example/point' });
  assert.equal(message.type, 'flex');
  assert.match(message.altText, /อยู่ระหว่างตรวจสอบ/);
  assert.match(JSON.stringify(message), /ยังไม่ใช่ประกาศหรือคำสั่ง/);
  assert.match(JSON.stringify(message), /เปิดพิกัดนำทาง/);
});

test('public confirmation and rejection use distinct official follow-ups', () => {
  const confirmed = buildEnvironmentFlex(candidate, 'public', { notificationKind: 'official_confirmed' });
  const rejected = buildEnvironmentFlex(candidate, 'public', { notificationKind: 'official_rejected' });
  assert.match(confirmed.altText, /ยืนยันเหตุโดยเจ้าหน้าที่แล้ว/);
  assert.match(rejected.altText, /ไม่ยืนยันเหตุ/);
});
