import assert from 'node:assert/strict';
import test from 'node:test';
import { polygonAreaKm2, summarizeTambonRisk } from '../lib/radar/spatial-summary.ts';
import type { GeoJsonFeature } from '../lib/radar/geojson-validation.ts';

const square = (size: number): GeoJsonFeature => ({
  type: 'Feature', properties: {},
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [size, 0], [size, size], [0, size], [0, 0]]] },
});

test('tambon summary weights rain and rainy coverage by polygon area', () => {
  const features = [square(1), square(2)];
  const rows = [
    { featureIndex: 0, rain3h: 10, riskIndex: 10, level: { color: 'green', name: 'watch', act: 'check' }, name: 'small' },
    { featureIndex: 1, rain3h: 0, riskIndex: 0, level: { color: 'blue', name: 'normal', act: 'monitor' }, name: 'large' },
  ];
  const summary = summarizeTambonRisk(rows, features);
  assert.ok(summary);
  assert.ok(polygonAreaKm2(features[1]) > polygonAreaKm2(features[0]) * 3.9);
  assert.ok(summary.areaWeightedRainMm > 1.9 && summary.areaWeightedRainMm < 2.1);
  assert.equal(summary.rainyAreaPct, 20);
});
