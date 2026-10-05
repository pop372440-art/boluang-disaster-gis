import assert from 'node:assert/strict';
import test from 'node:test';
import { backtestEnvironmentalRows } from '../lib/environment/backtest.ts';

test('backtest only scores rows inside January through May 2026', () => {
  const result = backtestEnvironmentalRows([
    { observedAt: '2026-01-10T00:00:00Z', actualEvent: true, pm25: 50, pm25Quality: 'fresh', hotspotCount: 0, hotspotQuality: 'fresh' },
    { observedAt: '2026-06-10T00:00:00Z', actualEvent: true, pm25: 50, pm25Quality: 'fresh', hotspotCount: 0, hotspotQuality: 'fresh' },
  ], '2026-01-01T00:00:00+07:00', '2026-05-31T23:59:59+07:00');
  assert.equal(result.count, 1);
  assert.equal(result.truePositive, 1);
});
