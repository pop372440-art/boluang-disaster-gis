import type { NextRequest } from 'next/server';
import { parseRainViewerMetadata } from '@/lib/radar/rainviewer-adapter';
import { logError, logInfo, requestLogContext } from '@/lib/observability/structured-logger';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const UPSTREAM = 'https://api.rainviewer.com/public/weather-maps.json';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const context = requestLogContext(req, '/api/radar/frames');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const upstream = await fetch(UPSTREAM, {
      headers: { 'User-Agent': 'boluang-disaster-gis/1.0' },
      signal: controller.signal,
      // edge cache 60 วิ — เฟรมใหม่มาทุก ~10 นาทีอยู่แล้ว
      next: { revalidate: 60 },
    });

    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

    const data = parseRainViewerMetadata(await upstream.json());
    logInfo('radar_frames_completed', {
      ...context,
      observedFrames: data.observedFrames.length,
      nowcastFrames: data.nowcastFrames.length,
      durationMs: Date.now() - startedAt,
    });

    // ชี้ host กลับมาที่ proxy ตัวเอง (absolute เพื่อให้ใช้ได้ทั้ง client/SSR)
    const origin = new URL(req.url).origin;
    const proxied = {
      ...data,
      host: `${origin}/api/radar`,
    };

    return new Response(JSON.stringify(proxied), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (e: unknown) {
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    logError('radar_frames_failed', e, { ...context, durationMs: Date.now() - startedAt });
    return new Response(JSON.stringify({ error: isTimeout ? 'radar index timeout' : 'radar index unavailable' }), {
      status: isTimeout ? 504 : 502,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } finally {
    clearTimeout(timeout);
  }
}
