import assert from 'node:assert/strict';
import test from 'node:test';
import { parseThaiWaterRainPayload } from '../supabase/functions/ingest-thaiwater-rain/parser.ts';

const realStation = {
  id: 311819718,
  rain_24h: 11,
  rain_1h: 0,
  rainfall_datetime: '2026-09-24 12:00',
  station_type: 'rainfall_24h',
  agency: {
    agency_name: { th: 'กรมทรัพยากรน้ำ' },
    agency_shortname: { th: 'ทน.' },
  },
  geocode: {
    amphoe_name: { th: 'ฮอด' },
    tumbon_name: { th: 'บ่อหลวง' },
    province_name: { th: 'เชียงใหม่' },
  },
  station: {
    id: 1254,
    tele_station_name: { th: 'บ้านนาฟ่อน' },
    tele_station_lat: 18.093847,
    tele_station_long: 98.365342,
    tele_station_oldcode: 'STN0583',
  },
};

test('ThaiWater parser accepts only the verified Bo Luang physical gauge', () => {
  const parsed = parseThaiWaterRainPayload(
    { result: 'OK', data: [realStation] },
    new Date('2026-09-24T06:00:00Z'),
  );
  assert.equal(parsed.station.code, 'STN0583');
  assert.deepEqual(parsed.observations.map((item) => [item.interval_minutes, item.rain_mm]), [
    [60, 0],
    [1440, 11],
  ]);
  assert.ok(parsed.observations.every((item) => item.source === 'thaiwater:rain_24h'));
});

test('ThaiWater parser never converts a missing measurement to zero', () => {
  const parsed = parseThaiWaterRainPayload(
    { result: 'OK', data: [{ ...realStation, rain_1h: null }] },
    new Date('2026-09-24T06:00:00Z'),
  );
  assert.deepEqual(parsed.observations.map((item) => item.interval_minutes), [1440]);
});

test('ThaiWater parser rejects a virtual or relocated station identity', () => {
  assert.throws(() => parseThaiWaterRainPayload({
    result: 'OK',
    data: [{ ...realStation, station: { ...realStation.station, tele_station_lat: 18.5 } }],
  }), /coordinates moved/);
});
