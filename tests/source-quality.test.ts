import assert from 'node:assert/strict';
import test from 'node:test';
import { assessSourceQuality, latestObservedAt, parseSourceTimestamp } from '../lib/environment/source-quality.ts';

const now = Date.parse('2026-10-04T12:00:00Z');

test('source quality separates fresh, stale, expired and invalid schema', () => {
  assert.equal(assessSourceQuality('2026-10-04T11:00:00Z', { staleAfterMinutes: 180, expireAfterMinutes: 720, now }).state, 'fresh');
  assert.equal(assessSourceQuality('2026-10-04T06:00:00Z', { staleAfterMinutes: 180, expireAfterMinutes: 720, now }).state, 'stale');
  assert.equal(assessSourceQuality('2026-10-03T12:00:00Z', { staleAfterMinutes: 180, expireAfterMinutes: 720, now }).state, 'expired');
  assert.equal(assessSourceQuality(null, { staleAfterMinutes: 180, expireAfterMinutes: 720, now, invalidSchema: true }).state, 'invalid_schema');
});

test('latestObservedAt ignores missing and invalid timestamps', () => {
  assert.equal(latestObservedAt([null, 'bad', '2026-10-04T10:00:00Z', '2026-10-04T11:00:00Z']), '2026-10-04T11:00:00.000Z');
});

test('timezone-less provider timestamps are interpreted as Bangkok time', () => {
  assert.equal(new Date(parseSourceTimestamp('2026-10-04T19:00')!).toISOString(), '2026-10-04T12:00:00.000Z');
  assert.equal(new Date(parseSourceTimestamp('2026-10-04')!).toISOString(), '2026-10-03T17:00:00.000Z');
});
