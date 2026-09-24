import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transitionAlertState } from '../lib/radar/alert-state-machine.ts';
import { validateAndNormalizeVillageGeoJson } from '../lib/radar/geojson-validation.ts';
import { aggregatePolygonValues } from '../lib/radar/polygon-aggregation.ts';
import { pointInPolygon } from '../lib/radar/village-sampling.ts';
import { createVillageSamplePlans } from '../lib/radar/village-forecast.ts';

test('all 13 actual village polygons yield 5–12 area-adaptive internal sample points', async () => {
  const raw = JSON.parse(await readFile(new URL('../public/geojson/block.json', import.meta.url), 'utf8'));
  const collection = validateAndNormalizeVillageGeoJson(raw);
  const plans = createVillageSamplePlans(collection.features);
  for (const plan of plans) {
    assert.ok(plan.points.length >= 5 && plan.points.length <= 12);
    assert.ok(plan.points.every((point) => pointInPolygon(point, collection.features[plan.featureIndex].geometry)));
  }
});

test('polygon aggregation returns mean, max and nearest-rank p90 and enforces coverage', () => {
  const result = aggregatePolygonValues([1, 2, 3, 4, 20], 'p90');
  assert.equal(result.mean, 6);
  assert.equal(result.max, 20);
  assert.equal(result.p90, 20);
  assert.equal(result.selected, 20);
  assert.equal(aggregatePolygonValues([10, null, null, null, null], 'p90', 0.6).selected, null);
});

test('alert promotion requires two cycles and notification waits for human approval', () => {
  const first = transitionAlertState(null, { riskIndex: 60, alertEligible: true, now: '2026-09-17T00:00:00Z' });
  assert.equal(first.current, 'normal');
  assert.equal(first.pendingCycles, 1);
  const second = transitionAlertState(first, { riskIndex: 60, alertEligible: true, now: '2026-09-17T00:10:00Z' });
  assert.equal(second.current, 'danger');
  assert.equal(second.notificationStatus, 'awaiting_human_approval');
});

test('alert demotion uses hysteresis and stale data suppresses notification', () => {
  const first = transitionAlertState(null, { riskIndex: 60, alertEligible: true, now: '2026-09-17T00:00:00Z' });
  const danger = transitionAlertState(first, { riskIndex: 60, alertEligible: true, now: '2026-09-17T00:10:00Z' });
  const held = transitionAlertState(danger, { riskIndex: 56, alertEligible: true, now: '2026-09-17T00:20:00Z' });
  assert.equal(held.current, 'danger');
  const suppressed = transitionAlertState(held, { riskIndex: 90, alertEligible: false, now: '2026-09-17T00:30:00Z' });
  assert.equal(suppressed.current, 'danger');
  assert.equal(suppressed.notificationStatus, 'suppressed');
});
