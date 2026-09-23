import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLongRangeOutlook } from '../lib/radar/long-range-outlook.ts';
import { aggregateMetNorwayDailyRain, parseMetNorwayResponse } from '../lib/radar/met-norway-adapter.ts';
import { parseOpenMeteoOutlook } from '../lib/radar/open-meteo-outlook-adapter.ts';

const config = {
  startLeadDay: 7,
  endLeadDay: 9,
  monitorRainMm: 20,
  prepareRainMm: 50,
  monitorProbabilityPct: 60,
  prepareProbabilityPct: 60,
  agreementMm: 15,
};

test('long-range outlook only returns D+7 through D+9 and never creates an alert state', () => {
  const inputs = Array.from({ length: 10 }, (_, index) => ({
    date: `2026-10-${String(index + 1).padStart(2, '0')}`,
    primaryRainMm: index === 7 ? 55 : 5,
    referenceRainMm: index === 7 ? 65 : 6,
    precipitationProbabilityPct: index === 7 ? 75 : 20,
    temperatureMinC: 18,
    temperatureMaxC: 27,
    windGustMaxKmh: 20,
  }));
  const result = buildLongRangeOutlook('2026-10-01', inputs, config);
  assert.deepEqual(result.map((day) => day.leadDay), [7, 8, 9]);
  assert.equal(result[0].signal, 'prepare');
  assert.equal(result[0].confidence, 'low');
  assert.equal('alertState' in result[0], false);
});

test('missing source and divergent models reduce long-range confidence', () => {
  const [missing] = buildLongRangeOutlook('2026-10-01', [{
    date: '2026-10-08', primaryRainMm: 30, referenceRainMm: null,
    precipitationProbabilityPct: 70, temperatureMinC: null, temperatureMaxC: null, windGustMaxKmh: null,
  }], config);
  const [divergent] = buildLongRangeOutlook('2026-10-01', [{
    date: '2026-10-08', primaryRainMm: 10, referenceRainMm: 40,
    precipitationProbabilityPct: 50, temperatureMinC: null, temperatureMaxC: null, windGustMaxKmh: null,
  }], config);
  assert.equal(missing.confidence, 'very-low');
  assert.equal(divergent.confidence, 'very-low');
  assert.equal(divergent.modelSpreadMm, 30);
});

test('MET 6-hour precipitation is allocated into Bangkok calendar days', () => {
  const parsed = parseMetNorwayResponse({
    properties: {
      meta: { updated_at: '2026-10-01T00:00:00Z' },
      timeseries: [{
        time: '2026-10-01T18:00:00Z',
        data: {
          instant: { details: { air_temperature: 20, wind_speed: 2 } },
          next_6_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 12 } },
        },
      }],
    },
  }, { latitude: 18.1633, longitude: 98.3744 });
  assert.equal(aggregateMetNorwayDailyRain(parsed).get('2026-10-02'), 12);
});

test('Open-Meteo daily outlook parser preserves missing values as null', () => {
  const [parsed] = parseOpenMeteoOutlook({ daily: {
    time: ['2026-10-08'],
    precipitation_sum: [null],
    precipitation_probability_max: [70],
    temperature_2m_min: [18],
    temperature_2m_max: [27],
    wind_gusts_10m_max: [30],
  } }, [{ latitude: 18.1633, longitude: 98.3744 }]);
  assert.equal(parsed.days[0].precipitationMm, null);
});
