import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { areaHref, parseAreaSearch, resolveAreaContext, BO_LUANG_CONTEXT, villageContexts, containsPoint } from '../lib/gis/area-context.ts';
import { localStationEvidence } from '../lib/gis/evidence.ts';

test('all actual village contexts have stable ids and representative points inside their polygon', () => {
  const villages = villageContexts(JSON.parse(fs.readFileSync(new URL('../public/geojson/block.json', import.meta.url), 'utf8')));
  assert.equal(villages.length, 13);
  assert.equal(new Set(villages.map(v => v.id)).size, 13);
  for (const village of villages) {
    assert.ok(containsPoint([village.lng, village.lat], village.feature.geometry));
    assert.deepEqual(parseAreaSearch(areaHref('/center/weather', village).split('?')[1]), { id: village.id, name: village.name, lat: village.lat, lng: village.lng });
  }
});
test('holes and disjoint multipolygons are respected', () => {
  const geometry = { type: 'MultiPolygon' as const, coordinates: [
    [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]],
    [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]],
  ] };
  assert.equal(containsPoint([2, 2], geometry), false);
  assert.equal(containsPoint([0.5, 0.5], geometry), true);
  assert.equal(containsPoint([11, 11], geometry), true);
  assert.equal(containsPoint([8, 8], geometry), false);
});
test('invalid shared coordinates are rejected rather than treated as zero', () => {
  for (const query of ['', '?lat=&lng=', '?lat=100&lng=98', '?lat=abc&lng=98']) assert.equal(parseAreaSearch(query), null);
});
test('returning a custom point from weather to GIS preserves its location', () => {
  const point = { id: 'point', name: 'พิกัดที่เลือก', lat: 18.2, lng: 98.4 };
  const requested = parseAreaSearch(areaHref('/', point).split('?')[1])!;
  assert.deepEqual(resolveAreaContext(requested, []), point);
  assert.deepEqual(resolveAreaContext({ ...point, id: 'moo-99' }, []), BO_LUANG_CONTEXT);
});
test('nearby gauges preserve missing measurements and separate village membership', () => {
  const village = villageContexts(JSON.parse(fs.readFileSync(new URL('../public/geojson/block.json', import.meta.url), 'utf8')))[0];
  const now = Date.parse('2026-10-15T10:00:00Z');
  const rows = localStationEvidence([{ station: { tele_station_lat: village.lat, tele_station_long: village.lng, tele_station_name: { th: 'สถานีทดสอบ' } }, rain_24h: null, rainfall_datetime: '2026-10-15 16:50:00' }], 'rain', village, now, village.feature.geometry);
  assert.equal(rows[0].withinVillage, true);
  assert.equal(rows[0].value, null);
  assert.equal(rows[0].freshness.status, 'fresh');
});
