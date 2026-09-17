import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOpenMeteoResponse } from '../lib/radar/open-meteo-adapter.ts';
import { parseRainViewerMetadata } from '../lib/radar/rainviewer-adapter.ts';

test('empty RainViewer nowcast never labels observed frames as nowcast', () => {
  const result = parseRainViewerMetadata({
    generated: 1_789_621_221,
    radar: {
      past: [{ time: 1_789_621_200, path: '/v2/radar/abcdef123456' }],
      nowcast: [],
    },
  });
  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].kind, 'observed');
  assert.equal(result.nowcastFrames.length, 0);
});

test('Open-Meteo adapter preserves missing and invalid rain as null', () => {
  const result = parseOpenMeteoResponse({
    hourly: {
      time: ['2026-09-17T12:00', '2026-09-17T13:00'],
      precipitation: [null, -1],
      precipitation_probability: [40, null],
    },
    daily: { time: [], precipitation_sum: [] },
  }, [{ latitude: 18.16, longitude: 98.37 }]);
  assert.deepEqual(result[0].hourly.precipitation, [null, null]);
  assert.deepEqual(result[0].hourly.precipitationProbability, [40, null]);
});
