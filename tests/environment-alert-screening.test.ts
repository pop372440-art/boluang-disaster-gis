import assert from 'node:assert/strict';
import test from 'node:test';
import { screenEnvironmentalEvidence } from '../lib/environment/alert-screening.ts';

test('screening does not alert from stale or missing values', () => {
  const result = screenEnvironmentalEvidence({ pm25: 120, pm25Quality: 'stale', hotspotCount: 10, hotspotQuality: 'expired' });
  assert.equal(result.eligible, false);
  assert.equal(result.level, null);
});

test('screening promotes fresh hotspot and CAMS evidence deterministically', () => {
  const result = screenEnvironmentalEvidence({ pm25: 42, pm25Quality: 'fresh', hotspotCount: 4, hotspotQuality: 'fresh' });
  assert.equal(result.level, 'warning');
  assert.equal(result.reasons.length, 2);
});
