import assert from 'node:assert/strict';
import test from 'node:test';
import { getScreeningStatus } from '../lib/environment/screening-status.ts';

test('screening status remains normal when inputs are below provisional thresholds', () => {
  assert.equal(getScreeningStatus({ precipitationMm: 1, windGustKmh: 20, pm25: 10, hotspotCount: 0 }).level, 'normal');
});

test('a nearby hotspot promotes the screening status to watch', () => {
  const status = getScreeningStatus({ hotspotCount: 1 });
  assert.equal(status.level, 'watch');
  assert.match(status.reasons[0], /Hotspot/);
});

test('higher severity inputs win over watch-level inputs', () => {
  assert.equal(getScreeningStatus({ hotspotCount: 1, windGustKmh: 65 }).level, 'warning');
});
