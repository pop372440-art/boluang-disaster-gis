export interface MeteoPayload {
  current?: Record<string, number | string | null>;
  hourly?: { time?: string[]; [key: string]: (number | null)[] | string[] | undefined };
  daily?: { time?: string[]; [key: string]: (number | null)[] | string[] | undefined };
}
export interface RadarFrame { time: number; path: string }
export interface RadarPayload { host?: string; radar?: { past?: RadarFrame[]; nowcast?: RadarFrame[] } }

export function requireMeteoPayload(value: unknown, kind: 'weather' | 'forecast' | 'air'): MeteoPayload {
  if (!value || typeof value !== 'object') throw new Error('invalid upstream schema');
  const payload = value as MeteoPayload;
  const valid = kind === 'forecast' ? Array.isArray(payload.hourly?.time) && Object.keys(payload.hourly ?? {}).some(key => key.startsWith('precipitation_'))
    : typeof payload.current?.time === 'string';
  if (!valid) throw new Error('invalid upstream schema');
  return payload;
}
export function requireRadarPayload(value: unknown): RadarPayload {
  if (!value || typeof value !== 'object') throw new Error('invalid radar schema');
  const payload = value as RadarPayload;
  if (!Array.isArray(payload.radar?.past) || !payload.radar.past.every(frame => frame && typeof frame.path === 'string' && Number.isFinite(frame.time))) throw new Error('invalid radar frames');
  if (payload.radar.nowcast && (!Array.isArray(payload.radar.nowcast) || !payload.radar.nowcast.every(frame => frame && typeof frame.path === 'string' && Number.isFinite(frame.time)))) throw new Error('invalid radar frames');
  const host = new URL(payload.host ?? 'https://tilecache.rainviewer.com');
  if (host.protocol !== 'https:' || !/(^|\.)rainviewer\.com$/.test(host.hostname)) throw new Error('invalid radar host');
  return payload;
}

export function finiteNonnegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function bangkokLocalToIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const timestamp = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+07:00`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

// Time axes must be joined by timestamp, never by coincident array index.
export function buildHourlyForecast(main: MeteoPayload, multi: MeteoPayload, now: number) {
  const mainIndex = new Map((main.hourly?.time ?? []).map((time, index) => [bangkokLocalToIso(time), index]));
  const multiIndex = new Map((multi.hourly?.time ?? []).map((time, index) => [bangkokLocalToIso(time), index]));
  const modelKeys = Object.keys(multi.hourly ?? {}).filter(key => key.startsWith('precipitation_'));
  const start = Math.ceil(now / 3_600_000) * 3_600_000;
  const times = Array.from({ length: 24 }, (_, index) => new Date(start + index * 3_600_000).toISOString());
  const modelSeries = modelKeys.map(key => times.map(time => {
    const index = multiIndex.get(time);
    return index === undefined ? null : finiteNonnegative(multi.hourly?.[key]?.[index]);
  }));
  const hourly = times.map((time, offset) => {
    const values = modelSeries.map(series => series[offset]).filter((value): value is number => value !== null);
    const index = mainIndex.get(time);
    const probability = index === undefined ? null : finiteNonnegative(main.hourly?.precipitation_probability?.[index]);
    return { time, hour: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(time)),
      rain: values.length ? Math.max(...values) : null, prob: probability !== null && probability <= 100 ? probability : null };
  });
  const sum = (count: number) => {
    const rows = hourly.slice(0, count);
    return rows.some(row => row.rain === null) ? null : rows.reduce((total, row) => total + row.rain!, 0);
  };
  return { hourly, modelSeries, sums: { s3: sum(3), s6: sum(6), s12: sum(12), s24: sum(24) } };
}

export async function settleWeatherSources<T extends Record<string, Promise<unknown>>>(requests: T) {
  const entries = Object.entries(requests);
  const results = await Promise.allSettled(entries.map(([, request]) => request));
  return Object.fromEntries(entries.map(([key], index) => {
    const result = results[index];
    return [key, result.status === 'fulfilled' ? { state: 'ready' as const, value: result.value } : { state: 'unavailable' as const, value: null }];
  }));
}
