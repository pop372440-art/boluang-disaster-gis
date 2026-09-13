import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const UPSTREAM_HOSTS = [
  'https://tilecache.rainviewer.com',
  'https://tile.rainviewer.com',
];

/**
 * รูปแบบที่อนุญาตเท่านั้น (กัน SSRF / open proxy)
 *   v2/radar/1694600000/512/12/3000/1800/4/1_1.png
 *   v2/radar/nowcast_5c1a8b2f/512/12/3000/1800/4/1_1.png
 *   v2/satellite/1694600000/512/12/3000/1800/0/0_0.png
 *   v2/coverage/0/512/12/3000/1800/0/0_0.png
 */
const PATH_RE =
  /^v2\/(radar|satellite|coverage)\/[A-Za-z0-9_-]{1,40}\/(256|512)\/([0-9]|1[0-9]|20)\/\d{1,7}\/\d{1,7}\/\d{1,2}\/[01]_[01]\.png$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Range',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Timing-Allow-Origin': '*',
};

/* PNG โปร่งใส 1x1 ใช้แทนเมื่อ upstream พัง */
const TRANSPARENT_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0)
);

const blankTile = (reason: string) =>
  new Response(TRANSPARENT_PNG, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=20, s-maxage=20',
      'X-Radar-Fallback': reason,
    },
  });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> } | { params: { path: string[] } }
) {
  const params = await (ctx.params as any);
  const path = (params?.path || []).join('/');

  if (!PATH_RE.test(path)) {
    return new Response(JSON.stringify({ error: 'invalid radar path' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // ส่ง 304 กลับทันทีถ้า client มี ETag ตรง (tile เป็น immutable อยู่แล้ว)
  const inm = req.headers.get('if-none-match');

  for (let attempt = 0; attempt < UPSTREAM_HOSTS.length; attempt++) {
    const url = `${UPSTREAM_HOSTS[attempt]}/${path}`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);

      const upstream = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
          'User-Agent': 'boluang-disaster-gis/1.0 (+radar-proxy)',
          ...(inm ? { 'If-None-Match': inm } : {}),
        },
        // tile ผูกกับ timestamp → immutable → cache ยาวได้
        next: { revalidate: 86400 },
      }).finally(() => clearTimeout(timer));

      if (upstream.status === 304) {
        return new Response(null, {
          status: 304,
          headers: { ...CORS, 'Cache-Control': 'public, max-age=86400, immutable' },
        });
      }

      // 404 = ไม่มีข้อมูลตรงพิกัดนั้น (ปกติ) → ส่ง tile ใส
      if (upstream.status === 404) return blankTile('upstream-404');

      if (!upstream.ok) {
        if (attempt < UPSTREAM_HOSTS.length - 1) continue;
        return blankTile(`upstream-${upstream.status}`);
      }

      const etag = upstream.headers.get('etag') || `"${path}"`;

      return new Response(upstream.body, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': upstream.headers.get('content-type') || 'image/png',
          ETag: etag,
          // browser 1 วัน / edge 7 วัน + SWR 30 วัน (ข้อมูลไม่เปลี่ยนแล้ว)
          'Cache-Control': 'public, max-age=86400, immutable',
          'CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=2592000',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=2592000',
        },
      });
    } catch (e: any) {
      if (attempt < UPSTREAM_HOSTS.length - 1) continue;
      return blankTile(e?.name === 'AbortError' ? 'timeout' : 'fetch-error');
    }
  }

  return blankTile('exhausted');
}
