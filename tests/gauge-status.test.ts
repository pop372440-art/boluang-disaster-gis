import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicGaugeStatus } from '../lib/radar/gauge-status.ts';

const payload = {
  status: 'ok',
  validation: {
    stage: 'collecting_real_observations',
    validated: false,
    observationCount: 2,
    coverageStartedAt: '2026-09-24T05:00:00.000Z',
    fieldEventCount: 0,
  },
  station: {
    id: 'thaiwater:1254',
    code: 'STN0583',
    name: 'บ้านนาฟ่อน',
    agencyName: 'กรมทรัพยากรน้ำ',
    latitude: 18.093847,
    longitude: 98.365342,
    observedAt: '2026-09-24T05:00:00.000Z',
    fetchedAt: '2026-09-24T06:00:00.000Z',
    qualityFlag: 'provisional',
    source: 'thaiwater:rain_24h',
    sourceUrl: 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h',
  },
  measurements: { rain1hMm: 0, rain24hMm: 11 },
  ingestion: { status: 'succeeded', completedAt: '2026-09-24T06:00:01.000Z' },
};

test('public gauge status preserves a real zero measurement', () => {
  const parsed = parsePublicGaugeStatus(payload);
  assert.equal(parsed.measurements.rain1hMm, 0);
  assert.equal(parsed.measurements.rain24hMm, 11);
  assert.equal(parsed.validation.validated, false);
});

test('public gauge status rejects unverified station identity', () => {
  assert.throws(
    () => parsePublicGaugeStatus({ ...payload, station: { ...payload.station, code: 'VIRTUAL-001' } }),
    /ไม่ผ่านการตรวจสอบ/,
  );
});

test('public gauge status keeps missing observations missing', () => {
  const parsed = parsePublicGaugeStatus({
    ...payload,
    measurements: { rain1hMm: null, rain24hMm: 11 },
  });
  assert.equal(parsed.measurements.rain1hMm, null);
});
