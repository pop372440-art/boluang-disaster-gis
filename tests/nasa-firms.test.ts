import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNasaFirmsCsv } from '../lib/environment/nasa-firms.ts';

test('NASA FIRMS parser validates schema and keeps nearby VIIRS points', () => {
  const csv = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence\n18.1700,98.3800,330,0.4,0.4,2026-10-14,0345,N20,VIIRS,n\n19.5000,100.0000,330,0.4,0.4,2026-10-14,0345,N21,VIIRS,h`;
  const result = parseNasaFirmsCsv(csv, { latitude: 18.1633, longitude: 98.3744 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.received, 2);
    assert.equal(result.hotspots.length, 1);
    assert.equal(result.hotspots[0].satellite, 'N20');
    assert.equal(result.hotspots[0].acquiredAt, '2026-10-14T03:45:00.000Z');
  }
});

test('NASA FIRMS parser accepts a valid empty result without inventing a hotspot', () => {
  const result = parseNasaFirmsCsv('latitude,longitude,acq_date,acq_time,satellite,instrument', { latitude: 18.1633, longitude: 98.3744 });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.hotspots.length, 0);
});

test('NASA FIRMS parser rejects an API error body', () => {
  assert.deepEqual(parseNasaFirmsCsv('Invalid MAP_KEY', { latitude: 18.1633, longitude: 98.3744 }), { ok: false, reason: 'invalid-schema' });
});
