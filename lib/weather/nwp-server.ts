import { buildNwpComparison, type NwpComparison, type NwpModelInput } from './nwp-comparison';

const BO_LUANG = { latitude: 18.1633, longitude: 98.3744 };
const MODELS = [
  { id: 'ecmwf' as const, apiId: 'ecmwf_ifs025', name: 'ECMWF IFS 0.25°', provider: 'ECMWF ผ่าน Open-Meteo', resolutionKm: 28 },
  { id: 'gfs' as const, apiId: 'gfs_global', name: 'NOAA GFS Global', provider: 'NOAA/NCEP ผ่าน Open-Meteo', resolutionKm: 13 },
];

function candidateRuns(now: number) {
  const safeLatest = Math.floor((now - 6 * 3_600_000) / (6 * 3_600_000)) * 6 * 3_600_000;
  return [0, 1, 2].map((offset) => new Date(safeLatest - offset * 6 * 3_600_000).toISOString().slice(0, 16));
}

async function fetchModel(model: typeof MODELS[number], run: string, signal: AbortSignal): Promise<NwpModelInput> {
  const url = new URL('https://single-runs-api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(BO_LUANG.latitude), longitude: String(BO_LUANG.longitude), hourly: 'precipitation',
    timezone: 'Asia/Bangkok', forecast_days: '5', models: model.apiId, run,
  }).toString();
  const response = await fetch(url, { signal, next: { revalidate: 3600 }, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${model.id} HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.hourly?.time) || !Array.isArray(payload?.hourly?.precipitation)) throw new Error(`${model.id} schema invalid`);
  return {
    id: model.id, name: model.name, provider: model.provider, resolutionKm: model.resolutionKm,
    runAt: new Date(`${run}:00Z`).toISOString(),
    gridLatitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
    gridLongitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
    times: payload.hourly.time,
    precipitation: payload.hourly.precipitation,
  };
}

export async function getNwpComparison(now = Date.now()): Promise<NwpComparison> {
  let lastError: unknown = null;
  for (const run of candidateRuns(now)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14_000);
    try {
      const models = await Promise.all(MODELS.map((model) => fetchModel(model, run, controller.signal)));
      return buildNwpComparison(models, now);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('NWP providers unavailable');
}
