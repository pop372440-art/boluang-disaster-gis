import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGistdaHotspots } from '../lib/environment/gistda-hotspot.ts';

test('GISTDA parser rejects a successful response with an unknown schema', () => {
  assert.deepEqual(parseGistdaHotspots({ result: [] }, { latitude: 18.1633, longitude: 98.3744 }), { ok: false, reason: 'invalid-schema' });
});

test('GISTDA parser keeps only valid points within the operational radius', () => {
  const result = parseGistdaHotspots({ data: [
    { lat: 18.17, lon: 98.38, id: 'near' },
    { latitude: 19.2, longitude: 99.5, id: 'far' },
    { latitude: 'invalid', longitude: 98.4, id: 'bad' },
  ] }, { latitude: 18.1633, longitude: 98.3744 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.received, 3);
    assert.equal(result.hotspots.length, 1);
    assert.equal(result.hotspots[0].id, 'near');
  }
});

test('GISTDA parser supports satellite collections from the live hotspot endpoint', () => {
  const result = parseGistdaHotspots({
    terra: [{ date: '2026-09-26', data: [{ latitude: 18.17, longitude: 98.38 }] }],
    aqua: [{ date: '2026-09-26', data: [] }],
    'suomi-npp': [{ date: '2026-09-26', data: [] }],
  }, { latitude: 18.1633, longitude: 98.3744 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.hotspots.length, 1);
    assert.equal(result.hotspots[0].satellite, 'terra');
    assert.equal(result.hotspots[0].acquiredDate, '2026-09-26');
  }
});
