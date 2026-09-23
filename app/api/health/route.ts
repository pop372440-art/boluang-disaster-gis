import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateAndNormalizeVillageGeoJson } from '@/lib/radar/geojson-validation';
import { parseRainViewerMetadata } from '@/lib/radar/rainviewer-adapter';
import { buildMetNorwayUrl, parseMetNorwayResponse } from '@/lib/radar/met-norway-adapter';
import { logInfo, requestLogContext } from '@/lib/observability/structured-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckStatus = 'ok' | 'degraded' | 'unconfigured';
type HealthCheck = { status: CheckStatus; latencyMs: number; checkedAt: string };

async function timedCheck(run: (signal: AbortSignal) => Promise<void>): Promise<HealthCheck> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    await run(controller.signal);
    return { status: 'ok', latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
  } catch {
    return { status: 'degraded', latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const context = requestLogContext(request, '/api/health');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [rainViewer, openMeteo, metNorway, geoJson, supabase] = await Promise.all([
    timedCheck(async (signal) => {
      const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal, cache: 'no-store' });
      if (!response.ok) throw new Error('rainviewer unavailable');
      parseRainViewerMetadata(await response.json());
    }),
    timedCheck(async (signal) => {
      const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=18.1633&longitude=98.3744&hourly=precipitation&forecast_days=1&timezone=Asia%2FBangkok', { signal, cache: 'no-store' });
      if (!response.ok) throw new Error('open-meteo unavailable');
      const payload = await response.json();
      if (!Array.isArray(payload?.hourly?.time)) throw new Error('open-meteo invalid');
    }),
    timedCheck(async (signal) => {
      const coordinate = { latitude: 18.1633, longitude: 98.3744 };
      const response = await fetch(buildMetNorwayUrl(coordinate), {
        headers: {
          Accept: 'application/json',
          'User-Agent': process.env.MET_NORWAY_USER_AGENT ??
            'BoLuangDisasterGIS/1.0 github.com/pop372440-art/boluang-disaster-gis',
        },
        signal,
        next: { revalidate: 600 },
      });
      if (!response.ok) throw new Error('met-norway unavailable');
      parseMetNorwayResponse(await response.json(), coordinate);
    }),
    timedCheck(async () => {
      const file = await readFile(path.join(process.cwd(), 'public/geojson/block.json'), 'utf8');
      validateAndNormalizeVillageGeoJson(JSON.parse(file));
    }),
    supabaseUrl && supabaseAnonKey
      ? timedCheck(async (signal) => {
          const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
            headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
            signal,
            cache: 'no-store',
          });
          if (!response.ok) throw new Error('supabase unavailable');
        })
      : Promise.resolve<HealthCheck>({ status: 'unconfigured', latencyMs: 0, checkedAt: new Date().toISOString() }),
  ]);

  const checks = { rainViewer, openMeteo, metNorway, geoJson, supabase };
  const degraded = Object.values(checks).some((check) => check.status !== 'ok');
  logInfo('health_check_completed', {
    ...context,
    status: degraded ? 'degraded' : 'ok',
    durationMs: Date.now() - startedAt,
  });
  return Response.json({
    status: degraded ? 'degraded' : 'ok',
    service: 'Bo Luang Disaster GIS API',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  }, {
    status: degraded ? 207 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
