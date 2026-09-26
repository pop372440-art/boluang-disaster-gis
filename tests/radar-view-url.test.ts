import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRadarViewSearch, parseRadarView } from '../lib/radar/radar-view-url.ts';

test('parses a Windy-style radar view URL within the service area', () => {
  assert.deepEqual(parseRadarView('?radar,18.147,98.349,15'), {
    latitude: 18.147,
    longitude: 98.349,
    zoom: 15,
  });
});

test('rejects malformed and out-of-area radar views', () => {
  assert.equal(parseRadarView('?radar,not-a-number,98.349,15'), null);
  assert.equal(parseRadarView('?radar,13.7563,100.5018,15'), null);
  assert.equal(parseRadarView('?wind,18.147,98.349,15'), null);
});

test('builds a stable, bounded share URL query', () => {
  assert.equal(buildRadarViewSearch({ latitude: 18.147123, longitude: 98.349456, zoom: 24 }),
    '?radar,18.14712,98.34946,20');
});
