import {
  buildRadarTileUpstreamUrl,
  isTransientTileStatus,
  parseRetryAfter,
  tileNegativeCacheHeaders,
  tileSuccessCacheHeaders,
  validateRadarTilePath,
} from '@/lib/radar/radar-tile-proxy';
import { logError, logWarn, requestLogContext } from '@/lib/observability/structured-logger';

export const runtime = 'edge';

export async function GET(req: Request, ctx: any) {
  const startedAt = Date.now();
  const context = requestLogContext(req, '/api/radar/[...path]');
  const p = await ctx.params;
  const seg: string[] = Array.isArray(p?.path) ? p.path : [];
  const tilePath = validateRadarTilePath(seg);
  if (!tilePath) return new Response('bad path', { status: 400, headers: { 'Cache-Control': 'no-store' } });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const ifNoneMatch = req.headers.get('if-none-match');
    const r = await fetch(buildRadarTileUpstreamUrl(tilePath), {
      headers: {
        Accept: 'image/png,*/*',
        'User-Agent': 'boluang-disaster-gis/1.0',
        ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
      },
      signal: controller.signal,
      cache: 'force-cache',
      next: { revalidate: 3_600 },
    });

    if (r.status === 304) return new Response(null, { status: 304, headers: tileSuccessCacheHeaders(r.headers.get('etag')) });
    if (!r.ok) {
      const retryAfter = parseRetryAfter(r.headers.get('retry-after'));
      logWarn('radar_tile_upstream_failed', { ...context, upstreamStatus: r.status, durationMs: Date.now() - startedAt });
      return new Response(null, {
        status: isTransientTileStatus(r.status) ? r.status : 502,
        headers: tileNegativeCacheHeaders(retryAfter),
      });
    }

    return new Response(r.body, {
      headers: tileSuccessCacheHeaders(r.headers.get('etag')),
    });
  } catch (error) {
    const timeoutError = error instanceof Error && error.name === 'AbortError';
    logError('radar_tile_failed', error, { ...context, durationMs: Date.now() - startedAt });
    return new Response(null, {
      status: timeoutError ? 504 : 502,
      headers: tileNegativeCacheHeaders(30),
    });
  } finally {
    clearTimeout(timeout);
  }
}
