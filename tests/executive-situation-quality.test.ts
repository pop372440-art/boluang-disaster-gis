import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessExecutiveSituation,
  bangkokLocalToIso,
  median,
} from '../lib/executive/situation-quality.ts';
import { aggregateWeatherNext3Daily } from '../lib/weather/weathernext3.ts';

const now = Date.parse('2026-09-29T02:00:00.000Z');

test('Bangkok model reference time is normalized without pretending it is UTC', () => {
  assert.equal(bangkokLocalToIso('2026-09-29T09:00'), '2026-09-29T02:00:00.000Z');
  assert.equal(bangkokLocalToIso('invalid'), null);
});

test('0.1 mm model precipitation never creates a warning or operational order', () => {
  const result = assessExecutiveSituation({
    modelPrecipitationMm: 0.1,
    modelReferenceAt: '2026-09-29T01:50:00.000Z',
    stationRain24hMm: null,
    stationObservedAt: null,
    stationDistanceKm: null,
    now,
  });
  assert.equal(result.level, 'limited');
  assert.equal(result.officialWarningAllowed, false);
  assert.equal(result.requiresHumanApproval, true);
  assert.doesNotMatch(result.reviewItems.join(' '), /อพยพ|เบิกงบ|ประกาศเสียงตามสาย/);
});

test('expired model data suppresses the situation assessment', () => {
  const result = assessExecutiveSituation({
    modelPrecipitationMm: 20,
    modelReferenceAt: '2026-09-28T20:00:00.000Z',
    stationRain24hMm: 90,
    stationObservedAt: '2026-09-29T01:30:00.000Z',
    stationDistanceKm: 2,
    now,
  });
  assert.equal(result.level, 'unavailable');
  assert.equal(result.dataQuality, 'unavailable');
});

test('a distant gauge cannot be used as local ground truth or soil saturation', () => {
  const result = assessExecutiveSituation({
    modelPrecipitationMm: 0,
    modelReferenceAt: '2026-09-29T01:50:00.000Z',
    stationRain24hMm: 100,
    stationObservedAt: '2026-09-29T01:30:00.000Z',
    stationDistanceKm: 25,
    now,
  });
  assert.equal(result.stationUsable, false);
  assert.equal(result.antecedentRainProxy, null);
  assert.equal(result.level, 'limited');
});

test('ensemble summaries use the median instead of a worst-member maximum', () => {
  assert.equal(median([2, 3, 80, 4, 3]), 3);
  assert.equal(median([]), null);
});

test('WeatherNext 3 hourly p50 precipitation is aggregated by Bangkok calendar day', () => {
  const result = aggregateWeatherNext3Daily([
    { forecastTime: '2026-09-29T16:00:00Z', precipitationMm: 1.2 },
    { forecastTime: '2026-09-29T17:00:00Z', precipitationMm: 2.3 },
    { forecastTime: '2026-09-30T16:00:00Z', precipitationMm: 0.5 },
    { forecastTime: 'invalid', precipitationMm: 99 },
    { forecastTime: '2026-09-30T17:00:00Z', precipitationMm: -1 },
  ]);
  assert.deepEqual(result, [
    { date: '2026-09-29', precipitationMm: 1.2 },
    { date: '2026-09-30', precipitationMm: 2.8 },
  ]);
});
