import { NextRequest } from 'next/server';
import {
  buildOpenMeteoUrl,
  parseOpenMeteoResponse,
  type Coordinate,
} from '@/lib/radar/open-meteo-adapter';
import { logError, logInfo, logWarn, requestLogContext } from '@/lib/observability/structured-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=600',
  'CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600',
  'Vercel-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600',
};

const parseCoordinateList = (value: string | null) =>
  value?.split(',').map((item) => Number(item.trim())) ?? [];

const isAllowedCoordinate = ({ latitude, longitude }: Coordinate) =>
  Number.isFinite(latitude) && Number.isFinite(longitude) &&
  latitude >= 17.5 && latitude <= 19 && longitude >= 97.5 && longitude <= 99.5;

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const context = requestLogContext(request, '/api/forecast');
  const latitudes = parseCoordinateList(request.nextUrl.searchParams.get('latitude'));
  const longitudes = parseCoordinateList(request.nextUrl.searchParams.get('longitude'));
  if (!latitudes.length || latitudes.length !== longitudes.length || latitudes.length > 25) {
    logWarn('forecast_request_rejected', { ...context, coordinateCount: latitudes.length });
    return Response.json({ error: 'ต้องระบุ latitude/longitude จำนวนเท่ากัน ไม่เกิน 25 จุด' }, { status: 400 });
  }

  const coordinates = latitudes.map((latitude, index) => ({ latitude, longitude: longitudes[index] }));
  if (!coordinates.every(isAllowedCoordinate)) {
    return Response.json({ error: 'พิกัดอยู่นอกพื้นที่ให้บริการของระบบบ่อหลวง' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch(buildOpenMeteoUrl(coordinates), {
      headers: { Accept: 'application/json', 'User-Agent': 'boluang-disaster-gis/1.0' },
      signal: controller.signal,
      next: { revalidate: 600 },
    });
    if (!upstream.ok) {
      const retryAfter = upstream.headers.get('retry-after');
      logWarn('forecast_upstream_failed', { ...context, upstreamStatus: upstream.status, durationMs: Date.now() - startedAt });
      return Response.json(
        { error: 'Open-Meteo unavailable', upstreamStatus: upstream.status },
        { status: upstream.status === 429 ? 429 : 502, headers: retryAfter ? { 'Retry-After': retryAfter } : undefined },
      );
    }

    const locations = parseOpenMeteoResponse(await upstream.json(), coordinates);
    logInfo('forecast_request_completed', { ...context, coordinateCount: coordinates.length, durationMs: Date.now() - startedAt });
    return Response.json({
      source: 'Open-Meteo',
      fetchedAt: new Date().toISOString(),
      timezone: 'Asia/Bangkok',
      locations,
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    logError('forecast_request_failed', error, { ...context, durationMs: Date.now() - startedAt });
    return Response.json(
      { error: isTimeout ? 'Open-Meteo timeout' : 'Open-Meteo response invalid' },
      { status: isTimeout ? 504 : 502, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
