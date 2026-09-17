import assert from 'node:assert/strict';
import test from 'node:test';
import { RadarFrameCache } from '../lib/radar/radar-frame-cache.ts';
import {
  parseRetryAfter,
  validateRadarTilePath,
} from '../lib/radar/radar-tile-proxy.ts';

test('tile proxy rejects traversal and accepts the RainViewer tile shape', () => {
  assert.equal(validateRadarTilePath(['..', 'secret']), null);
  assert.equal(validateRadarTilePath(['v2', 'radar', 'abc_123', '512', '12', '1', '2', '4', '1_1.png']),
    'v2/radar/abc_123/512/12/1/2/4/1_1.png');
});

test('Retry-After supports seconds and HTTP dates with a safe upper bound', () => {
  const now = Date.parse('2026-09-17T00:00:00Z');
  assert.equal(parseRetryAfter('15', now), 15);
  assert.equal(parseRetryAfter(new Date(now + 45_000).toUTCString(), now), 45);
  assert.equal(parseRetryAfter('999', now), 120);
});

test('frame cache limits concurrency and negative-caches failures', async () => {
  let active = 0;
  let maximum = 0;
  let calls = 0;
  const releases: Array<() => void> = [];
  const cache = new RadarFrameCache<string>(
    { maxEntries: 4, maxConcurrent: 2, negativeTtlMs: 60_000 },
    async (url) => {
      calls += 1;
      if (url === 'bad') throw new Error('broken');
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return url;
    },
  );
  const controller = new AbortController();
  const pending = ['a', 'b', 'c'].map((url) => cache.load(url, controller.signal));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(maximum, 2);
  releases.splice(0).forEach((release) => release());
  await new Promise((resolve) => setImmediate(resolve));
  releases.splice(0).forEach((release) => release());
  assert.deepEqual(await Promise.all(pending), ['a', 'b', 'c']);

  assert.equal(await cache.load('bad', controller.signal), null);
  assert.equal(await cache.load('bad', controller.signal), null);
  assert.equal(calls, 4);
});
