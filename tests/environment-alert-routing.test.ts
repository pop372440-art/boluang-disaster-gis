import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationAudiencesForCandidate } from '../lib/environment/notification-policy.ts';

test('routine citizen and satellite evidence routes only to its public destination', () => {
  assert.deepEqual(notificationAudiencesForCandidate('citizen_report', 'watch'), ['public']);
  assert.deepEqual(notificationAudiencesForCandidate('citizen_report', 'warning'), ['public']);
  assert.deepEqual(notificationAudiencesForCandidate('satellite', 'warning'), ['public']);
});

test('staff LINE is reserved for critical escalation', () => {
  assert.deepEqual(notificationAudiencesForCandidate('citizen_report', 'critical'), ['public', 'staff']);
  assert.deepEqual(notificationAudiencesForCandidate('satellite', 'critical'), ['public', 'staff']);
  assert.deepEqual(notificationAudiencesForCandidate('model', 'critical'), ['staff']);
  assert.deepEqual(notificationAudiencesForCandidate('model', 'watch'), []);
  assert.deepEqual(notificationAudiencesForCandidate('model', 'warning'), []);
});
