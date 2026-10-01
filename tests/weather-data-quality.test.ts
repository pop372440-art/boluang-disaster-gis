import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareRainModels,
  degreesToThaiWindDirection,
  evaluateWeatherFreshness
} from '../lib/weather/data-quality.ts';

test('wind direction maps valid degrees and never renders undefined', () => {
  assert.equal(degreesToThaiWindDirection(0), 'เหนือ');
  assert.equal(degreesToThaiWindDirection(90), 'ตะวันออก');
  assert.equal(degreesToThaiWindDirection(225), 'ตะวันตกเฉียงใต้');
  assert.equal(degreesToThaiWindDirection(undefined), null);
  assert.equal(degreesToThaiWindDirection(-1), null);
});

test('weather freshness distinguishes fresh, stale, expired and unknown data', () => {
  const now = Date.parse('2026-09-27T12:00:00.000Z');
  assert.equal(evaluateWeatherFreshness('2026-09-27T11:50:00.000Z', 20, 40, now).status, 'fresh');
  assert.equal(evaluateWeatherFreshness('2026-09-27T11:35:00.000Z', 20, 40, now).status, 'stale');
  assert.equal(evaluateWeatherFreshness('2026-09-27T11:00:00.000Z', 20, 40, now).status, 'expired');
  assert.equal(evaluateWeatherFreshness(undefined, 20, 40, now).status, 'unknown');
});

test('rain model confidence reflects three-hour model spread', () => {
  assert.deepEqual(compareRainModels([[1, 1, 1], [1.5, 1, 1]]), {
    modelCount: 2,
    minMm: 3,
    maxMm: 3.5,
    spreadMm: 0.5,
    confidence: 'high'
  });
  assert.equal(compareRainModels([[0, 0, 0], [3, 3, 3]]).confidence, 'low');
  assert.equal(compareRainModels([[1, 1, 1]]).confidence, 'low');
});
