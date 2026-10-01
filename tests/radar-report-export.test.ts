import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRadarSituationReport, RADAR_REPORT_SCHEMA_VERSION } from '../lib/radar/report-export.ts';

const status = (source: string, timestamp: string) => ({
  state: 'fresh' as const,
  source,
  timestamp,
  freshness: {
    status: 'fresh' as const,
    observedAt: timestamp,
    checkedAt: '2026-10-01T04:05:00.000Z',
    ageMinutes: 5,
    staleAfterMinutes: 20,
    expireAfterMinutes: 40,
  },
  error: null,
});

test('exported Radar report records schema, source versions and reference timestamps', () => {
  const report = buildRadarSituationReport({
    generatedAt: '2026-10-01T04:06:00.000Z',
    radarData: null,
    radarStatus: status('RainViewer', '2026-10-01T04:00:00.000Z'),
    forecastStatus: status('Open-Meteo', '2026-10-01T04:00:00.000Z'),
    metNorwayStatus: status('MET Norway', '2026-10-01T03:00:00.000Z'),
    gaugeSourceStatus: status('สถานีจริง STN0583', '2026-10-01T02:00:00.000Z'),
    gaugeStatus: null,
    villages: [{
      id: '1', moo: '1', name: 'บ้านตัวอย่าง', rain3h: 2.5, riskIndex: 3,
      level: { key: 'normal', name: 'ปกติ' }, confidence: 'medium',
      forecastComparison: { agreement: 'unavailable' },
    }],
  });

  assert.equal(report.schemaVersion, RADAR_REPORT_SCHEMA_VERSION);
  assert.equal(report.generatedAt, '2026-10-01T04:06:00.000Z');
  assert.equal(report.validation.status, 'public_beta_unvalidated');
  assert.equal(report.sources[0].sourceVersion, 'RainViewer weather-maps.json');
  assert.equal(report.sources[2].observedAt, '2026-10-01T03:00:00.000Z');
  assert.equal(report.villages[0].modelAgreement, 'unavailable');
});
