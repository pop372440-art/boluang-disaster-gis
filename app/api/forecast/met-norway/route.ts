import { NextRequest } from 'next/server';
import {
  buildMetNorwayUrl,
  MET_NORWAY_SOURCE,
  parseMetNorwayResponse,
} from '@/lib/radar/met-norway-adapter';
import type { Coordinate } from '@/lib/radar/open-meteo-adapter';
import { fetchWithRetry } from '@/lib/radar/fetch-with-retry';
import { logError, logInfo, logWarn, requestLogContext } from '@/lib/observability/structured-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=900, stale-while-revalidate=900',
  'CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=900',
  'Vercel-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=900',
};
const USER_AGENT = process.env.MET_NORWAY_USER_AGENT ??
  'BoLuangDisasterGIS/1.0 github.com/pop372440-art/boluang-disaster-gis';

const parseCoordinateList = (value: string | null) =>
  value?.split(',').map((item) => Number(item.trim())) ?? [];
const isAllowedCoordinate = ({ latitude, longitude }: Coordinate) =>
  Number.isFinite(latitude) && Number.isFinite(longitude) &&
  latitude >= 17.5 && latitude <= 19 && longitude >= 97.5 && longitude <= 99.5;

async function mapWithConcurrency<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const context = requestLogContext(request, '/api/forecast/met-norway');
  const latitudes = parseCoordinateList(request.nextUrl.searchParams.get('latitude'));
  const longitudes = parseCoordinateList(request.nextUrl.searchParams.get('longitude'));
  if (!latitudes.length || latitudes.length !== longitudes.length || latitudes.length > 13) {
    return Response.json({ error: 'ต้องระบุ latitude/longitude จำนวนเท่ากัน ไม่เกิน 13 จุด' }, { status: 400 });
  }
  const coordinates = latitudes.map((latitude, index) => ({ latitude, longitude: longitudes[index] }));
  if (!coordinates.every(isAllowedCoordinate)) {
    return Response.json({ error: 'พิกัดอยู่นอกพื้นที่ให้บริการของระบบบ่อหลวง' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const locations = await mapWithConcurrency(coordinates, 4, async (coordinate) => {
      const upstream = await fetchWithRetry(buildMetNorwayUrl(coordinate), {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: controller.signal,
        next: { revalidate: 900 },
      }, { attempts: 2, baseDelayMs: 300 });
      if (!upstream.ok) {
        const retryAfter = upstream.headers.get('retry-after');
        const error = new Error(`MET Norway HTTP ${upstream.status}`) as Error & { status?: number; retryAfter?: string | null };
        error.status = upstream.status;
        error.retryAfter = retryAfter;
        throw error;
      }
      return parseMetNorwayResponse(await upstream.json(), coordinate);
    });
    const fetchedAt = locations.map((location) => Date.parse(location.updatedAt))
      .filter(Number.isFinite).reduce((oldest, value) => Math.min(oldest, value), Date.now());
    logInfo('met_norway_forecast_completed', {
      ...context,
      coordinateCount: coordinates.length,
      durationMs: Date.now() - startedAt,
    });
    return Response.json({
      source: MET_NORWAY_SOURCE,
      fetchedAt: new Date(fetchedAt).toISOString(),
      locations,
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const upstreamStatus = (error as Error & { status?: number }).status;
    const retryAfter = (error as Error & { retryAfter?: string | null }).retryAfter;
    logWarn('met_norway_forecast_failed', {
      ...context,
      upstreamStatus,
      durationMs: Date.now() - startedAt,
    });
    logError('met_norway_forecast_error', error, context);
    return Response.json({
      error: isTimeout ? 'MET Norway timeout' : 'MET Norway unavailable',
      upstreamStatus,
    }, {
      status: isTimeout ? 504 : upstreamStatus === 429 ? 429 : 502,
      headers: { 'Cache-Control': 'no-store', ...(retryAfter ? { 'Retry-After': retryAfter } : {}) },
    });
  } finally {
    clearTimeout(timeout);
  }
}
