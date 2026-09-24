import assert from 'node:assert/strict';
import test from 'node:test';
import { findForecastStartIndex, selectNextForecastHours } from '../lib/radar/forecast-window.ts';

const times = ['2026-09-24T09:00', '2026-09-24T10:00', '2026-09-24T11:00', '2026-09-24T12:00'];

test('forecast window starts at the first hour at or after now', () => {
  const now = Date.parse('2026-09-24T09:30:00+07:00');
  assert.equal(findForecastStartIndex(times, now), 1);
  const hours = selectNextForecastHours(times, [1, 2, 3, 4], [10, 20, 30, 40], now);
  assert.deepEqual(hours.map((hour) => hour.rain), [2, 3, 4]);
  assert.deepEqual(hours.map((hour) => hour.probability), [20, 30, 40]);
});

test('forecast window returns nulls rather than shifting when the horizon is incomplete', () => {
  const hours = selectNextForecastHours(times, [1, 2, 3, 4], [10, 20, 30, 40], Date.parse('2026-09-24T11:30:00+07:00'));
  assert.deepEqual(hours.map((hour) => hour.rain), [4, null, null]);
});
