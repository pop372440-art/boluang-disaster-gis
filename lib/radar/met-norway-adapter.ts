import type { Coordinate } from './open-meteo-adapter.ts';

export const MET_NORWAY_SOURCE = 'MET Norway Locationforecast' as const;

export type MetNorwayHourlyForecast = {
  time: string;
  precipitation: number | null;
  probability: number | null;
  airTemperature: number | null;
  windSpeed: number | null;
  symbolCode: string | null;
};

export type MetNorwayLocationForecast = Coordinate & {
  updatedAt: string;
  hourly: MetNorwayHourlyForecast[];
};

export type MetNorwayForecastBatch = {
  source: typeof MET_NORWAY_SOURCE;
  fetchedAt: string;
  locations: MetNorwayLocationForecast[];
};

const nullableNumber = (value: unknown, minimum = Number.NEGATIVE_INFINITY) => {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum ? number : null;
};

export function buildMetNorwayUrl(coordinate: Coordinate) {
  const url = new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact');
  url.searchParams.set('lat', coordinate.latitude.toFixed(5));
  url.searchParams.set('lon', coordinate.longitude.toFixed(5));
  return url;
}

export function parseMetNorwayResponse(value: unknown, coordinate: Coordinate): MetNorwayLocationForecast {
  if (!value || typeof value !== 'object') throw new Error('MET Norway response ไม่ถูกต้อง');
  const raw = value as Record<string, any>;
  const updatedAt = raw.properties?.meta?.updated_at;
  const timeseries = raw.properties?.timeseries;
  if (typeof updatedAt !== 'string' || !Array.isArray(timeseries) || !timeseries.length) {
    throw new Error('MET Norway response ขาดเวลาอัปเดตหรือข้อมูลรายชั่วโมง');
  }

  const hourly = timeseries.map((entry: any): MetNorwayHourlyForecast | null => {
    if (!entry || typeof entry.time !== 'string') return null;
    const instant = entry.data?.instant?.details ?? {};
    const nextHour = entry.data?.next_1_hours ?? {};
    return {
      time: entry.time,
      precipitation: nullableNumber(nextHour.details?.precipitation_amount, 0),
      probability: nullableNumber(nextHour.details?.probability_of_precipitation, 0),
      airTemperature: nullableNumber(instant.air_temperature),
      windSpeed: nullableNumber(instant.wind_speed, 0),
      symbolCode: typeof nextHour.summary?.symbol_code === 'string' ? nextHour.summary.symbol_code : null,
    };
  }).filter((entry: MetNorwayHourlyForecast | null): entry is MetNorwayHourlyForecast => entry != null);

  if (!hourly.length) throw new Error('MET Norway ไม่มีข้อมูลรายชั่วโมงที่ใช้งานได้');
  return { ...coordinate, updatedAt, hourly };
}

export function parseMetNorwayApiResponse(value: unknown): MetNorwayForecastBatch {
  if (!value || typeof value !== 'object') throw new Error('MET Norway API response ไม่ถูกต้อง');
  const raw = value as Partial<MetNorwayForecastBatch>;
  if (raw.source !== MET_NORWAY_SOURCE || typeof raw.fetchedAt !== 'string' || !Array.isArray(raw.locations)) {
    throw new Error('MET Norway API response ขาด source, timestamp หรือ locations');
  }
  return raw as MetNorwayForecastBatch;
}

export function sumMetNorwayRain3h(location: MetNorwayLocationForecast | undefined, now = Date.now()) {
  const hourly = location?.hourly ?? [];
  let index = hourly.findIndex((entry) => new Date(entry.time).getTime() >= now);
  if (index < 0) index = 0;
  const values = [1, 2, 3].map((offset) => hourly[index + offset]?.precipitation ?? null);
  return values.every((value) => value != null)
    ? values.reduce<number>((sum, value) => sum + (value as number), 0)
    : null;
}
