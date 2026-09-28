import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPORT_STATUS_SELECT,
  generateTrackingToken,
  isOpaqueTrackingToken,
  maskTrackingToken,
  storageObjectPath,
  toPublicReportStatus,
} from '../lib/report-status/security.ts';
import { resetRateLimitsForTests, takeRateLimit } from '../lib/report-status/rate-limit.ts';

test('tracking token contains at least 128 bits and is URL safe', () => {
  const token = generateTrackingToken(new Uint8Array(24).fill(7));
  assert.equal(isOpaqueTrackingToken(token), true);
  assert.match(token, /^BL_[A-Za-z0-9_-]+$/);
  assert.ok(token.length >= 25);
});

test('public projection cannot select precise location or reporter fields', () => {
  assert.doesNotMatch(REPORT_STATUS_SELECT, /latitude|longitude|reporter|description|action_taken/);
  const report = toPublicReportStatus({
    tracking_code: 'BL_abcdefghijklmnopqrstuvwxyz123456',
    risk_type: 'อุทกภัย',
    severity_level: 3,
    village_name: 'บ้านบ่อหลวง',
    status: 'กำลังดำเนินการ',
    created_at: '2026-09-28T00:00:00.000Z',
    image_url: 'private/path.jpg',
    resolved_image_url: null,
    resolved_at: null,
  }, { before: 'https://signed.example/before', after: null, expiresAt: '2026-09-28T00:05:00.000Z' });
  assert.equal(report.reference, maskTrackingToken('BL_abcdefghijklmnopqrstuvwxyz123456'));
  assert.equal(report.villageName, 'บ้านบ่อหลวง');
  assert.equal('latitude' in report, false);
  assert.equal('reporter_name' in report, false);
});

test('storage URL is reduced to an object path before signing', () => {
  assert.equal(
    storageObjectPath('https://project.supabase.co/storage/v1/object/public/disaster_images/reports/a%20b.jpg'),
    'reports/a b.jpg',
  );
  assert.equal(storageObjectPath('https://example.com/not-storage/a.jpg'), null);
});

test('rate limiter blocks requests after the configured allowance', () => {
  resetRateLimitsForTests();
  assert.equal(takeRateLimit('ip:test', 2, 60_000, 1).allowed, true);
  assert.equal(takeRateLimit('ip:test', 2, 60_000, 2).allowed, true);
  assert.equal(takeRateLimit('ip:test', 2, 60_000, 3).allowed, false);
  assert.equal(takeRateLimit('ip:test', 2, 60_000, 60_002).allowed, true);
});

