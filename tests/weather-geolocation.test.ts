import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_LOCATION_ZOOM,
  geolocationFailureCopy,
  shouldRetryGeolocation,
} from '../lib/weather/geolocation.ts';

test('current location zoom is detailed enough for the selected point', () => {
  assert.equal(CURRENT_LOCATION_ZOOM, 16);
});

test('location lookup retries only transient device errors', () => {
  assert.equal(shouldRetryGeolocation({ code: 1 }), false);
  assert.equal(shouldRetryGeolocation({ code: 2 }), true);
  assert.equal(shouldRetryGeolocation({ code: 3 }), true);
});

test('location errors give an actionable Thai explanation', () => {
  assert.match(geolocationFailureCopy({ code: 1 }).title, /สิทธิ์ตำแหน่ง/);
  assert.match(geolocationFailureCopy({ code: 2 }).text, /Location/);
  assert.match(geolocationFailureCopy({ code: 3 }).text, /ลองใหม่/);
  assert.match(geolocationFailureCopy({}, false).text, /HTTPS/);
});
