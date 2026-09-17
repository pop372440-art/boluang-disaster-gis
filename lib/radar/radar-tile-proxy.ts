const TILE_PATH = /^v\d+\/radar\/[A-Za-z0-9_-]+\/(256|512)\/\d{1,2}\/\d+\/\d+\/\d+\/(0_0|0_1|1_0|1_1)\.png$/;

export const RAINVIEWER_TILE_ORIGIN = 'https://tilecache.rainviewer.com';

export function validateRadarTilePath(segments: string[]): string | null {
  const path = segments.map((segment) => decodeURIComponent(segment)).join('/');
  if (!TILE_PATH.test(path)) return null;
  return path;
}

export function buildRadarTileUpstreamUrl(path: string) {
  return `${RAINVIEWER_TILE_ORIGIN}/${path}`;
}

export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 30;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), 120);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 30;
  return Math.min(Math.max(Math.ceil((timestamp - now) / 1000), 1), 120);
}

export const isTransientTileStatus = (status: number) => [429, 502, 503].includes(status);

export function tileSuccessCacheHeaders(etag: string | null): HeadersInit {
  return {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    'CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    'Vercel-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
    ...(etag ? { ETag: etag } : {}),
  };
}

export function tileNegativeCacheHeaders(retryAfterSeconds: number): HeadersInit {
  return {
    'Cache-Control': 'public, max-age=20, s-maxage=60, stale-while-revalidate=60',
    'Retry-After': `${retryAfterSeconds}`,
    'Access-Control-Allow-Origin': '*',
  };
}
