import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateFreshness } from '../lib/radar/data-freshness.ts';
import { assessRisk, sumApi7 } from '../lib/radar/risk-engine.ts';

const now = Date.parse('2026-09-17T05:00:00.000Z');
const fresh = evaluateFreshness(now - 5 * 60_000, {
  staleAfterMinutes: 15,
  expireAfterMinutes: 30,
  now,
});

test('risk boundaries use inclusive lower bounds', () => {
  const cases = [
    { value: 9.999, level: 'normal' },
    { value: 10, level: 'watch' },
    { value: 35, level: 'warning' },
    { value: 60, level: 'danger' },
    { value: 90, level: 'critical' },
  ] as const;

  for (const item of cases) {
    const result = assessRisk({ rain3h: item.value, api7: 0, slopeDeg: 0, dataFreshness: fresh });
    assert.equal(result.riskIndex, item.value);
    assert.equal(result.level, item.level);
  }
});

test('missing, NaN and negative rain never become a normal zero-risk result', () => {
  for (const rain3h of [null, Number.NaN, -0.1]) {
    const result = assessRisk({ rain3h, api7: 0, slopeDeg: 0, dataFreshness: fresh });
    assert.equal(result.riskIndex, null);
    assert.equal(result.level, 'unknown');
    assert.equal(result.alertEligible, false);
  }
});

test('stale data cannot be used for an alert', () => {
  const stale = evaluateFreshness(now - 20 * 60_000, {
    staleAfterMinutes: 15,
    expireAfterMinutes: 30,
    now,
  });
  const result = assessRisk({ rain3h: 90, api7: 0, slopeDeg: 25, dataFreshness: stale });
  assert.equal(result.level, 'critical');
  assert.equal(result.alertEligible, false);
  assert.equal(result.confidence, 'low');
});

test('missing slope is explicit and lowers confidence', () => {
  const result = assessRisk({ rain3h: 10, api7: 0, slopeDeg: null, dataFreshness: fresh });
  assert.equal(result.terrainFactor, 1);
  assert.equal(result.confidence, 'low');
  assert.match(result.reasons.join(' '), /ไม่มีข้อมูลความลาดชัน/);
});

test('api7 is the seven-day cumulative rain and rejects incomplete data', () => {
  assert.equal(sumApi7([1, 2, 3, 4, 5, 6, 7]), 28);
  assert.equal(sumApi7([1, 2, 3]), null);
  assert.equal(sumApi7([1, 2, 3, 4, 5, 6, -1]), null);
});
