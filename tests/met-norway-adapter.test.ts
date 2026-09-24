import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMetNorwayResponse,
  sumMetNorwayRain3h,
} from '../lib/radar/met-norway-adapter.ts';
import { compareFreshRainForecasts, compareRainForecasts } from '../lib/radar/forecast-model-comparison.ts';

const coordinate = { latitude: 18.1633, longitude: 98.3744 };

test('MET Norway adapter validates metadata and sums T+1 through T+3', () => {
  const timeseries = Array.from({ length: 5 }, (_, index) => ({
    time: `2026-09-23T0${index}:00:00Z`,
    data: {
      instant: { details: { air_temperature: 20 + index, wind_speed: 2 } },
      next_1_hours: {
        summary: { symbol_code: 'rain' },
        details: { precipitation_amount: index, probability_of_precipitation: 60 },
      },
    },
  }));
  const parsed = parseMetNorwayResponse({
    properties: { meta: { updated_at: '2026-09-23T00:00:00Z' }, timeseries },
  }, coordinate);
  assert.equal(sumMetNorwayRain3h(parsed, Date.parse('2026-09-23T00:00:00Z')), 6);
  assert.equal(parsed.hourly[0].airTemperature, 20);
});

test('MET Norway adapter rejects incomplete upstream data', () => {
  assert.throws(() => parseMetNorwayResponse({ properties: {} }, coordinate));
});

test('model agreement thresholds are explicit and missing data is unavailable', () => {
  const config = { highDifferenceMm: 2, mediumDifferenceMm: 5 };
  assert.equal(compareRainForecasts(10, 12, config).agreement, 'high');
  assert.equal(compareRainForecasts(10, 15, config).agreement, 'medium');
  assert.equal(compareRainForecasts(10, 15.1, config).agreement, 'low');
  assert.equal(compareRainForecasts(null, 2, config).agreement, 'unavailable');
});

test('model agreement considers relative as well as absolute spread', () => {
  const config = {
    highDifferenceMm: 2,
    mediumDifferenceMm: 5,
    highRelativeDifference: 0.35,
    mediumRelativeDifference: 0.6,
  };
  assert.equal(compareRainForecasts(0.5, 1.2, config).agreement, 'medium');
  assert.equal(compareRainForecasts(10, 12, config).agreement, 'high');
  assert.equal(compareRainForecasts(2, 6, config).agreement, 'low');
});

test('stale or expired model runs cannot produce an agreement label', () => {
  const config = { highDifferenceMm: 2, mediumDifferenceMm: 5 };
  assert.equal(compareFreshRainForecasts(10, 11, true, true, config).agreement, 'high');
  for (const [primaryFresh, referenceFresh] of [[false, true], [true, false], [false, false]]) {
    const result = compareFreshRainForecasts(10, 11, primaryFresh, referenceFresh, config);
    assert.equal(result.agreement, 'unavailable');
    assert.equal(result.differenceMm, null);
  }
});
