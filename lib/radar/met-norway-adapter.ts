import type { Coordinate } from './open-meteo-adapter.ts';

export const MET_NORWAY_SOURCE = 'MET Norway Locationforecast' as const;

export type MetNorwayHourlyForecast = {
  time: string;
  precipitation: number | null;
  precipitationPeriodHours: 1 | 6 | 12 | null;
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
    const period = entry.data?.next_1_hours ? { data: entry.data.next_1_hours, hours: 1 as const }
      : entry.data?.next_6_hours ? { data: entry.data.next_6_hours, hours: 6 as const }
        : entry.data?.next_12_hours ? { data: entry.data.next_12_hours, hours: 12 as const }
          : null;
    return {
      time: entry.time,
      precipitation: nullableNumber(period?.data?.details?.precipitation_amount, 0),
      precipitationPeriodHours: period?.hours ?? null,
      probability: nullableNumber(period?.data?.details?.probability_of_precipitation, 0),
      airTemperature: nullableNumber(instant.air_temperature),
      windSpeed: nullableNumber(instant.wind_speed, 0),
      symbolCode: typeof period?.data?.summary?.symbol_code === 'string' ? period.data.summary.symbol_code : null,
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
  const values = [1, 2, 3].map((offset) => {
    const entry = hourly[index + offset];
    return entry?.precipitationPeriodHours === 1 ? entry.precipitation : null;
  });
  return values.every((value) => value != null)
    ? values.reduce<number>((sum, value) => sum + (value as number), 0)
    : null;
}

const bangkokDate = (timestamp: number) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(timestamp));

export function aggregateMetNorwayDailyRain(location: MetNorwayLocationForecast | undefined) {
  const totals = new Map<string, number>();
  for (const entry of location?.hourly ?? []) {
    if (entry.precipitation == null || entry.precipitationPeriodHours == null) continue;
    const startedAt = Date.parse(entry.time);
    if (!Number.isFinite(startedAt)) continue;
    const amountPerHour = entry.precipitation / entry.precipitationPeriodHours;
    for (let hour = 0; hour < entry.precipitationPeriodHours; hour += 1) {
      const date = bangkokDate(startedAt + (hour + 0.5) * 60 * 60 * 1000);
      totals.set(date, (totals.get(date) ?? 0) + amountPerHour);
    }
  }
  return totals;
}
