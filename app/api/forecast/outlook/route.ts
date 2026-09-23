import { NextRequest } from 'next/server';
import type { Coordinate } from '@/lib/radar/open-meteo-adapter';
import {
  buildOpenMeteoOutlookUrl,
  OPEN_METEO_OUTLOOK_SOURCE,
  parseOpenMeteoOutlook,
} from '@/lib/radar/open-meteo-outlook-adapter';
import { logError, logInfo, logWarn, requestLogContext } from '@/lib/observability/structured-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=1800, stale-while-revalidate=1800',
  'CDN-Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=1800',
  'Vercel-CDN-Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=1800',
};
const parseCoordinateList = (value: string | null) =>
  value?.split(',').map((item) => Number(item.trim())) ?? [];
const isAllowedCoordinate = ({ latitude, longitude }: Coordinate) =>
  Number.isFinite(latitude) && Number.isFinite(longitude) &&
  latitude >= 17.5 && latitude <= 19 && longitude >= 97.5 && longitude <= 99.5;

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const context = requestLogContext(request, '/api/forecast/outlook');
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
    const upstream = await fetch(buildOpenMeteoOutlookUrl(coordinates), {
      headers: { Accept: 'application/json', 'User-Agent': 'boluang-disaster-gis/1.0' },
      signal: controller.signal,
      next: { revalidate: 1800 },
    });
    if (!upstream.ok) {
      const retryAfter = upstream.headers.get('retry-after');
      logWarn('outlook_upstream_failed', { ...context, upstreamStatus: upstream.status });
      return Response.json(
        { error: 'Open-Meteo outlook unavailable', upstreamStatus: upstream.status },
        {
          status: upstream.status === 429 ? 429 : 502,
          headers: { 'Cache-Control': 'no-store', ...(retryAfter ? { 'Retry-After': retryAfter } : {}) },
        },
      );
    }
    const locations = parseOpenMeteoOutlook(await upstream.json(), coordinates);
    logInfo('outlook_request_completed', {
      ...context,
      coordinateCount: coordinates.length,
      durationMs: Date.now() - startedAt,
    });
    return Response.json({
      source: OPEN_METEO_OUTLOOK_SOURCE,
      fetchedAt: new Date().toISOString(),
      timezone: 'Asia/Bangkok',
      locations,
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    logError('outlook_request_failed', error, { ...context, durationMs: Date.now() - startedAt });
    return Response.json(
      { error: isTimeout ? 'Open-Meteo outlook timeout' : 'Open-Meteo outlook response invalid' },
      { status: isTimeout ? 504 : 502, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
