import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationAudiencesForSource } from '../lib/environment/notification-policy.ts';

test('citizen and satellite evidence alert both groups immediately', () => {
  assert.deepEqual(notificationAudiencesForSource('citizen_report'), ['staff', 'public']);
  assert.deepEqual(notificationAudiencesForSource('satellite'), ['staff', 'public']);
});

test('model-only evidence remains staff-only until verified', () => {
  assert.deepEqual(notificationAudiencesForSource('model'), ['staff']);
});
