import type { Coordinate } from './open-meteo-adapter.ts';

export const OPEN_METEO_OUTLOOK_SOURCE = 'Open-Meteo daily outlook' as const;

export type OpenMeteoDailyOutlook = Coordinate & {
  days: Array<{
    date: string;
    precipitationMm: number | null;
    precipitationProbabilityPct: number | null;
    temperatureMinC: number | null;
    temperatureMaxC: number | null;
    windGustMaxKmh: number | null;
  }>;
};

export type OpenMeteoOutlookBatch = {
  source: typeof OPEN_METEO_OUTLOOK_SOURCE;
  fetchedAt: string;
  timezone: 'Asia/Bangkok';
  locations: OpenMeteoDailyOutlook[];
};

const nullableNumberArray = (value: unknown, minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY) =>
  Array.isArray(value) ? value.map((item) => {
    if (item == null) return null;
    const number = Number(item);
    return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
  }) : [];

const stringArray = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string')
  : [];

export function buildOpenMeteoOutlookUrl(coordinates: Coordinate[]) {
  if (!coordinates.length || coordinates.length > 13) throw new Error('รองรับพิกัด outlook ครั้งละ 1–13 จุด');
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', coordinates.map((point) => point.latitude.toFixed(4)).join(','));
  url.searchParams.set('longitude', coordinates.map((point) => point.longitude.toFixed(4)).join(','));
  url.searchParams.set('daily', [
    'precipitation_sum',
    'precipitation_probability_max',
    'temperature_2m_min',
    'temperature_2m_max',
    'wind_gusts_10m_max',
  ].join(','));
  url.searchParams.set('forecast_days', '10');
  url.searchParams.set('timezone', 'Asia/Bangkok');
  return url;
}

export function parseOpenMeteoOutlook(value: unknown, coordinates: Coordinate[]): OpenMeteoDailyOutlook[] {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length !== coordinates.length) {
    throw new Error(`Open-Meteo outlook ส่งข้อมูล ${rows.length} จุด แต่ร้องขอ ${coordinates.length} จุด`);
  }
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`Open-Meteo outlook จุดที่ ${index + 1} ไม่ถูกต้อง`);
    const daily = (row as { daily?: Record<string, unknown> }).daily;
    if (!daily) throw new Error(`Open-Meteo outlook จุดที่ ${index + 1} ไม่มี daily`);
    const dates = stringArray(daily.time);
    const precipitation = nullableNumberArray(daily.precipitation_sum, 0);
    const probability = nullableNumberArray(daily.precipitation_probability_max, 0, 100);
    const temperatureMin = nullableNumberArray(daily.temperature_2m_min);
    const temperatureMax = nullableNumberArray(daily.temperature_2m_max);
    const windGust = nullableNumberArray(daily.wind_gusts_10m_max, 0);
    if (!dates.length || precipitation.length !== dates.length) {
      throw new Error(`Open-Meteo outlook จุดที่ ${index + 1} มีข้อมูลรายวันไม่ครบ`);
    }
    return {
      ...coordinates[index],
      days: dates.map((date, dayIndex) => ({
        date,
        precipitationMm: precipitation[dayIndex] ?? null,
        precipitationProbabilityPct: probability[dayIndex] ?? null,
        temperatureMinC: temperatureMin[dayIndex] ?? null,
        temperatureMaxC: temperatureMax[dayIndex] ?? null,
        windGustMaxKmh: windGust[dayIndex] ?? null,
      })),
    };
  });
}

export function parseOpenMeteoOutlookApiResponse(value: unknown): OpenMeteoOutlookBatch {
  if (!value || typeof value !== 'object') throw new Error('Outlook API response ไม่ถูกต้อง');
  const raw = value as Partial<OpenMeteoOutlookBatch>;
  if (
    raw.source !== OPEN_METEO_OUTLOOK_SOURCE || typeof raw.fetchedAt !== 'string' ||
    raw.timezone !== 'Asia/Bangkok' || !Array.isArray(raw.locations)
  ) throw new Error('Outlook API response ขาด source, timestamp, timezone หรือ locations');
  return raw as OpenMeteoOutlookBatch;
}
