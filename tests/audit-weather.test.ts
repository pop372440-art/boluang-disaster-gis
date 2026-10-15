import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHourlyForecast, settleWeatherSources, finiteNonnegative, requireMeteoPayload, requireRadarPayload } from '../lib/weather/upstream.ts';
import { sampleCoveredArea, type RadarGrid } from '../lib/weather/radar-sampling.ts';
import { evaluateWeatherFreshness } from '../lib/weather/data-quality.ts';

test('one failed upstream does not erase successful sources', async () => {
  const result = await settleWeatherSources({ weather: Promise.resolve({ current: { temperature_2m: 24 } }), air: Promise.reject(new Error('offline')), radar: Promise.resolve({ radar: {} }) });
  assert.equal(result.weather.state, 'ready');
  assert.equal(result.air.state, 'unavailable');
  assert.equal(result.radar.state, 'ready');
});
test('forecast joins shifted axes by timestamp and does not reuse old hours', () => {
  const result = buildHourlyForecast({ hourly: { time: ['2026-10-15T17:00', '2026-10-15T18:00'], precipitation_probability: [70, 90] } },
    { hourly: { time: ['2026-10-15T16:00', '2026-10-15T17:00', '2026-10-15T18:00'], precipitation_a: [100, 2, null], precipitation_b: [100, 1, 3] } }, Date.parse('2026-10-15T09:20:00Z'));
  assert.equal(result.hourly[0].hour, '17:00');
  assert.equal(result.hourly[0].rain, 2);
  assert.equal(result.hourly[0].prob, 70);
  assert.equal(result.hourly[1].rain, 3);
  assert.equal(result.hourly[2].rain, null);
  assert.equal(result.sums.s3, null);
  const old = buildHourlyForecast({}, { hourly: { time: ['2026-10-14T16:00'], precipitation_a: [50] } }, Date.parse('2026-10-15T09:20:00Z'));
  assert.ok(old.hourly.every(row => row.rain === null));
});
test('missing or invalid numeric upstream values never become zero', () => {
  for (const value of [null, undefined, '', '4', -1, NaN]) assert.equal(finiteNonnegative(value), null);
  assert.equal(finiteNonnegative(0), 0);
});
test('unloaded and out-of-bounds radar pixels are unavailable, covered dry pixels are zero', () => {
  const grid: RadarGrid = { d: new Uint8Array(25), coverage: new Uint8Array(25).fill(1), w: 5, h: 5, ox: 0, oy: 0 };
  assert.equal(sampleCoveredArea(grid, 2, 2), 0);
  grid.coverage[12] = 0;
  assert.equal(sampleCoveredArea(grid, 2, 2), null);
  grid.coverage[12] = 1;
  assert.equal(sampleCoveredArea(grid, 0, 0), null);
});
test('future observations are not fresh measurements', () => {
  const now = Date.parse('2026-10-15T09:00:00Z');
  assert.equal(evaluateWeatherFreshness('2026-10-16T09:00:00Z', 20, 40, now).status, 'unknown');
});
test('HTTP-success payloads with invalid schemas cannot be treated as ready sources', () => {
  assert.throws(() => requireMeteoPayload({}, 'weather'));
  assert.throws(() => requireMeteoPayload({ hourly: { time: [] } }, 'forecast'));
  assert.throws(() => requireRadarPayload({ radar: { past: 'invalid' } }));
  assert.throws(() => requireRadarPayload({ host: 'https://example.com', radar: { past: [] } }));
  assert.deepEqual(requireRadarPayload({ radar: { past: [] } }), { radar: { past: [] } });
});
