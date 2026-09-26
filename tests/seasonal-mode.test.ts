import assert from 'node:assert/strict';
import test from 'node:test';
import { inferSeasonalMode } from '../lib/environment/seasonal-mode.ts';

test('selects the operational mode from the Thai seasonal calendar', () => {
  assert.equal(inferSeasonalMode(1), 'smoke');
  assert.equal(inferSeasonalMode(3), 'fire');
  assert.equal(inferSeasonalMode(4), 'heat');
  assert.equal(inferSeasonalMode(7), 'rain');
  assert.equal(inferSeasonalMode(12), 'cold');
});

