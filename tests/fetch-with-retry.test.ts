import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWithRetry } from '../lib/radar/fetch-with-retry.ts';

test('retries transient upstream responses', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response(null, { status: calls === 1 ? 502 : 200 });
  });

  const response = await fetchWithRetry('https://example.com', undefined, {
    attempts: 2,
    baseDelayMs: 0,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('does not retry permanent client errors', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response(null, { status: 400 });
  });

  const response = await fetchWithRetry('https://example.com', undefined, {
    attempts: 2,
    baseDelayMs: 0,
  });

  assert.equal(response.status, 400);
  assert.equal(calls, 1);
});

test('retries a network failure once', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('network failure');
    return new Response(null, { status: 200 });
  });

  const response = await fetchWithRetry('https://example.com', undefined, {
    attempts: 2,
    baseDelayMs: 0,
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});
