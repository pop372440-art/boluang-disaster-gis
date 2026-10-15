import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeRain, formatRainTime, type RainHour } from '../lib/weather/rain-summary.ts';

const hours = (): RainHour[] => Array.from({ length: 24 }, (_, index) => ({
  time: new Date(Date.parse('2026-10-14T15:00:00Z') + index * 3_600_000).toISOString(), rain: 0, prob: 0,
}));

test('peak window crosses midnight in Bangkok and preserves separate probability', () => {
  const rows = hours();
  rows[1].rain = 2; rows[2].rain = 4; rows[3].rain = 3;
  rows[1].prob = 70; rows[2].prob = 80; rows[3].prob = 60;
  const summary = summarizeRain(rows)!;
  assert.equal(summary.totalMm, 9);
  assert.equal(summary.peakMm, 9);
  assert.equal(summary.start, '2026-10-14T16:00:00.000Z');
  assert.equal(summary.end, '2026-10-14T19:00:00.000Z');
  assert.equal(summary.maxProbability, 80);
  assert.match(formatRainTime(summary.end), /15/);
});

test('missing rain is unavailable while genuine zero remains zero', () => {
  assert.equal(summarizeRain(hours())?.totalMm, 0);
  const rows = hours(); rows[10].rain = null;
  assert.equal(summarizeRain(rows), null);
  rows[10].rain = NaN;
  assert.equal(summarizeRain(rows), null);
  rows[10].rain = -1;
  assert.equal(summarizeRain(rows), null);
});

test('partial or discontinuous hours cannot produce a 24-hour summary', () => {
  assert.equal(summarizeRain(hours().slice(0, 23)), null);
  const rows = hours(); rows[10].time = rows[9].time;
  assert.equal(summarizeRain(rows), null);
  rows[10].time = 'invalid';
  assert.equal(summarizeRain(rows), null);
});

test('missing probability does not become zero or block valid rainfall', () => {
  const rows = hours(); rows[0].rain = 3; rows[0].prob = null;
  assert.equal(summarizeRain(rows)?.peakMm, 3);
  assert.equal(summarizeRain(rows)?.maxProbability, null);
});
