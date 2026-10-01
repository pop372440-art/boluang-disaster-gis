import assert from 'node:assert/strict';
import test from 'node:test';
import { assessIntelligenceQuality } from '../lib/environment/intelligence-quality.ts';

test('intelligence quality is a data-readiness score, not an accuracy claim', () => {
  const result = assessIntelligenceQuality({
    weatherReady: true, airReady: true, fireReady: true, nwpUsable: true,
    villageSnapshotsAvailable: true, fetchedAt: '2026-09-29T04:00:00Z',
  }, Date.parse('2026-09-29T04:10:00Z'));
  assert.equal(result.score, 100);
  assert.equal(result.level, 'high');
  assert.equal(result.limitations.length, 0);
});

test('missing village evidence and stale data lower readiness explicitly', () => {
  const result = assessIntelligenceQuality({
    weatherReady: true, airReady: true, fireReady: false, nwpUsable: false,
    villageSnapshotsAvailable: false, fetchedAt: '2026-09-29T03:00:00Z',
  }, Date.parse('2026-09-29T04:00:00Z'));
  assert.equal(result.score, 40);
  assert.equal(result.level, 'low');
  assert.equal(result.stale, true);
  assert.match(result.limitations.join(' '), /รายหมู่บ้าน/);
});
