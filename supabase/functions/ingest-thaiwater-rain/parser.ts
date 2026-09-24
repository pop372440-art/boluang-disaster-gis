export const THAIWATER_RAIN_URL =
  'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h';

export const BO_LUANG_GAUGE = {
  stationId: 1254,
  stationCode: 'STN0583',
  stationName: 'บ้านนาฟ่อน',
  latitude: 18.093847,
  longitude: 98.365342,
} as const;

type UnknownRecord = Record<string, unknown>;

export type GaugeObservationInsert = {
  station_id: string;
  observed_at: string;
  rain_mm: number;
  interval_minutes: 60 | 1440;
  quality_flag: 'provisional' | 'suspect_stale';
  source: 'thaiwater:rain_24h';
  geometry: { type: 'Point'; coordinates: [number, number] };
  source_record_id: string;
  station_name: string;
  agency_code: string | null;
  agency_name: string | null;
  fetched_at: string;
  source_url: string;
  distance_km: number;
  metadata: UnknownRecord;
};

export type ParsedThaiWaterRain = {
  sourceCount: number;
  station: {
    id: number;
    code: string;
    name: string;
    latitude: number;
    longitude: number;
    observedAt: string;
  };
  observations: GaugeObservationInsert[];
};

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nestedRecord(value: unknown, key: string): UnknownRecord | null {
  return asRecord(asRecord(value)?.[key]);
}

function nestedText(value: unknown, ...path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)?.[key];
  return typeof current === 'string' && current.trim() ? current.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBangkokObservationTime(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
    throw new Error('ThaiWater observation time is missing or malformed');
  }
  const parsed = new Date(`${value.replace(' ', 'T')}:00+07:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error('ThaiWater observation time is invalid');
  return parsed;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371.0088;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parseThaiWaterRainPayload(
  payload: unknown,
  fetchedAt = new Date(),
): ParsedThaiWaterRain {
  const root = asRecord(payload);
  if (root?.result !== 'OK' || !Array.isArray(root.data)) {
    throw new Error('ThaiWater response does not contain an OK data array');
  }

  const target = root.data.find((item) => finiteNumber(nestedRecord(item, 'station')?.id) === BO_LUANG_GAUGE.stationId);
  if (!target) throw new Error(`ThaiWater station ${BO_LUANG_GAUGE.stationCode} is unavailable`);

  const station = nestedRecord(target, 'station');
  const geocode = nestedRecord(target, 'geocode');
  const latitude = finiteNumber(station?.tele_station_lat);
  const longitude = finiteNumber(station?.tele_station_long);
  const code = nestedText(station, 'tele_station_oldcode');
  const name = nestedText(station, 'tele_station_name', 'th');
  const amphoe = nestedText(geocode, 'amphoe_name', 'th');
  const tambon = nestedText(geocode, 'tumbon_name', 'th');

  if (latitude === null || longitude === null || code !== BO_LUANG_GAUGE.stationCode
      || amphoe !== 'ฮอด' || tambon !== 'บ่อหลวง') {
    throw new Error('ThaiWater station identity or administrative location changed');
  }

  const distanceKm = haversineKm(
    latitude,
    longitude,
    BO_LUANG_GAUGE.latitude,
    BO_LUANG_GAUGE.longitude,
  );
  if (distanceKm > 0.5) throw new Error('ThaiWater station coordinates moved beyond tolerance');

  const observed = parseBangkokObservationTime(asRecord(target)?.rainfall_datetime);
  const ageMinutes = (fetchedAt.getTime() - observed.getTime()) / 60_000;
  if (ageMinutes < -15) throw new Error('ThaiWater observation is unexpectedly in the future');
  const qualityFlag: GaugeObservationInsert['quality_flag'] = ageMinutes > 360
    ? 'suspect_stale'
    : 'provisional';

  const agencyCode = nestedText(target, 'agency', 'agency_shortname', 'th');
  const agencyName = nestedText(target, 'agency', 'agency_name', 'th');
  const recordId = finiteNumber(asRecord(target)?.id);
  if (recordId === null || !name) throw new Error('ThaiWater station provenance is incomplete');

  const base = {
    station_id: `thaiwater:${BO_LUANG_GAUGE.stationId}`,
    observed_at: observed.toISOString(),
    quality_flag: qualityFlag,
    source: 'thaiwater:rain_24h' as const,
    geometry: { type: 'Point' as const, coordinates: [longitude, latitude] as [number, number] },
    source_record_id: String(recordId),
    station_name: name,
    agency_code: agencyCode,
    agency_name: agencyName,
    fetched_at: fetchedAt.toISOString(),
    source_url: THAIWATER_RAIN_URL,
    distance_km: Number(distanceKm.toFixed(3)),
    metadata: {
      station_code: code,
      amphoe,
      tambon,
      province: nestedText(geocode, 'province_name', 'th'),
      source_station_type: nestedText(target, 'station_type'),
    },
  };

  const observations: GaugeObservationInsert[] = [];
  for (const [field, intervalMinutes] of [['rain_1h', 60], ['rain_24h', 1440]] as const) {
    const rainMm = finiteNumber(asRecord(target)?.[field]);
    if (rainMm === null) continue;
    if (rainMm < 0 || rainMm > 1000) throw new Error(`ThaiWater ${field} is outside physical validation bounds`);
    observations.push({ ...base, rain_mm: rainMm, interval_minutes: intervalMinutes });
  }

  if (observations.length === 0) throw new Error('ThaiWater station has no measured rainfall values');

  return {
    sourceCount: root.data.length,
    station: {
      id: BO_LUANG_GAUGE.stationId,
      code,
      name,
      latitude,
      longitude,
      observedAt: observed.toISOString(),
    },
    observations,
  };
}
