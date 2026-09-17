import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateFreshness } from '../lib/radar/data-freshness.ts';
import { validateAndNormalizeVillageGeoJson } from '../lib/radar/geojson-validation.ts';
import { parseOpenMeteoResponse } from '../lib/radar/open-meteo-adapter.ts';
import { assessRisk, sumApi7 } from '../lib/radar/risk-engine.ts';

test('actual village GeoJSON maps polygons to stable official village numbers', () => {
  const raw = JSON.parse(readFileSync('public/geojson/block.json', 'utf8'));
  const collection = validateAndNormalizeVillageGeoJson(raw);
  assert.equal(collection.features.length, 13);
  assert.equal(collection.features[0].properties.name_th, 'บ้านแม่หืด');
  assert.equal(collection.features[0].properties.moo, 13);
  assert.equal(collection.features[7].properties.name_th, 'บ้านบ่อหลวง');
  assert.equal(collection.features[7].properties.moo, 1);
});

test('validated forecast data flows into a risk assessment without silent defaults', () => {
  const coordinates = [{ latitude: 18.1633, longitude: 98.3744 }];
  const times = Array.from({ length: 30 }, (_, index) => `2026-09-${String(16 + Math.floor(index / 24)).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:00`);
  const forecast = parseOpenMeteoResponse({
    hourly: {
      time: times,
      precipitation: Array.from({ length: 30 }, () => 2),
      precipitation_probability: Array.from({ length: 30 }, () => 80),
    },
    daily: {
      time: Array.from({ length: 9 }, (_, index) => `2026-09-${String(10 + index).padStart(2, '0')}`),
      precipitation_sum: [1, 2, 3, 4, 5, 6, 7, 0, 0],
    },
  }, coordinates)[0];

  const api7 = sumApi7(forecast.daily.precipitationSum);
  const freshness = evaluateFreshness('2026-09-17T05:00:00.000Z', {
    staleAfterMinutes: 15,
    expireAfterMinutes: 30,
    now: Date.parse('2026-09-17T05:05:00.000Z'),
  });
  const result = assessRisk({ rain3h: 6, api7, slopeDeg: null, dataFreshness: freshness });
  assert.equal(api7, 28);
  assert.ok(result.riskIndex != null && result.riskIndex > 6);
  assert.equal(result.confidence, 'low');
  assert.equal(result.alertEligible, true);
});
