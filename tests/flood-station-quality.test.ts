import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessStationRisk,
  evaluateStationFreshness,
  finiteMeasurement,
  measurementDisplay,
  normalizeThaiWaterTimestamp,
  stationDistanceLabel,
} from '../lib/flood/station-quality.ts';

const now = Date.parse('2026-09-27T12:00:00.000Z');

test('ThaiWater timestamps without a timezone are interpreted as Thailand time', () => {
  assert.equal(normalizeThaiWaterTimestamp('2026-09-27 18:30'), '2026-09-27T11:30:00.000Z');
});

test('station freshness separates fresh, stale, expired and unknown observations', () => {
  assert.equal(evaluateStationFreshness('2026-09-27 18:30', now).status, 'fresh');
  assert.equal(evaluateStationFreshness('2026-09-27 16:30', now).status, 'stale');
  assert.equal(evaluateStationFreshness('2026-09-27 10:00', now).status, 'expired');
  assert.equal(evaluateStationFreshness('', now).status, 'unknown');
});

test('missing measurement stays missing while a reported zero stays zero', () => {
  assert.equal(finiteMeasurement(null, undefined, ''), null);
  assert.equal(finiteMeasurement(0, 4), 0);
  assert.equal(measurementDisplay(null, 'water'), 'ไม่มีข้อมูล');
  assert.match(measurementDisplay(0, 'rain'), /ค่าศูนย์ที่รายงาน/);
});

test('only fresh measurements can produce a warning state', () => {
  const fresh = evaluateStationFreshness('2026-09-27 18:30', now);
  const stale = evaluateStationFreshness('2026-09-27 16:30', now);
  assert.equal(assessStationRisk(95, 'rain', fresh).level, 'critical');
  assert.equal(assessStationRisk(95, 'rain', stale).level, 'unavailable');
  assert.equal(assessStationRisk(null, 'water', fresh).level, 'unavailable');
});

test('stations beyond the local radius are labelled as external references', () => {
  assert.equal(stationDistanceLabel(5), 'ใกล้พื้นที่ตำบล');
  assert.equal(stationDistanceLabel(25), 'สถานีอ้างอิงนอกตำบล');
});
