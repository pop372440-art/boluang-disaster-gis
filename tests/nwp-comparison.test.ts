import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNwpComparison, type NwpModelInput } from '../lib/weather/nwp-comparison.ts';

const now = Date.parse('2026-09-29T03:20:00Z');
const times = Array.from({ length: 96 }, (_, index) => new Date(Date.parse('2026-09-28T18:00:00Z') + index * 3_600_000)
  .toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace(' ', 'T'));

function model(id: 'ecmwf' | 'gfs', precipitation: number[], runAt = '2026-09-28T18:00:00Z'): NwpModelInput {
  return { id, name: id, provider: id, resolutionKm: 25, runAt, gridLatitude: 18.2, gridLongitude: 98.3, times, precipitation };
}

test('compares only complete 72-hour outputs from the same run', () => {
  const result = buildNwpComparison([model('ecmwf', Array(96).fill(0.4)), model('gfs', Array(96).fill(0.5))], now);
  assert.equal(result.consensus.usable, true);
  assert.equal(result.runAt, '2026-09-28T18:00:00Z');
  assert.equal(result.models[0].windows[0].validHours, 24);
  assert.equal(result.consensus.officialWarningAllowed, false);
  assert.equal(result.consensus.requiresHumanApproval, true);
});

test('blocks consensus when model runs differ', () => {
  const result = buildNwpComparison([model('ecmwf', Array(96).fill(0.4)), model('gfs', Array(96).fill(0.5), '2026-09-28T12:00:00Z')], now);
  assert.equal(result.consensus.usable, false);
  assert.equal(result.consensus.agreement, 'unavailable');
});

test('does not convert missing hours to zero rainfall', () => {
  const incomplete = Array<number | null>(96).fill(0.4);
  incomplete[20] = null;
  const result = buildNwpComparison([model('ecmwf', incomplete as number[]), model('gfs', Array(96).fill(0.5))], now);
  assert.equal(result.consensus.usable, false);
  assert.equal(result.models[0].windows[0].totalMm, null);
});

test('marks a run older than 24 hours as expired and unusable', () => {
  const result = buildNwpComparison([
    model('ecmwf', Array(96).fill(0.4), '2026-09-27T00:00:00Z'),
    model('gfs', Array(96).fill(0.5), '2026-09-27T00:00:00Z'),
  ], now);
  assert.equal(result.models[0].freshness, 'expired');
  assert.equal(result.consensus.usable, false);
});

test('agreement reflects model spread rather than claiming accuracy', () => {
  const wetThenDry = [...Array(32).fill(0), ...Array(24).fill(0.5), ...Array(40).fill(0)];
  const veryWet = [...Array(32).fill(0), ...Array(24).fill(3), ...Array(40).fill(0)];
  const result = buildNwpComparison([model('ecmwf', wetThenDry), model('gfs', veryWet)], now);
  assert.equal(result.consensus.agreement, 'low');
  assert.match(result.consensus.summary, /ไม่ใช่ค่าตรวจวัดรายหมู่บ้าน/);
});
