import type { NextRequest } from 'next/server';

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
  try {
    const upstream = await fetch(UPSTREAM, {
      headers: { 'User-Agent': 'boluang-disaster-gis/1.0' },
      // edge cache 60 วิ — เฟรมใหม่มาทุก ~10 นาทีอยู่แล้ว
      next: { revalidate: 60 },
    });

    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

    const data = await upstream.json();

    // ชี้ host กลับมาที่ proxy ตัวเอง (absolute เพื่อให้ใช้ได้ทั้ง client/SSR)
    const origin = new URL(req.url).origin;
    const proxied = {
      ...data,
      host: `${origin}/api/radar`,
      upstreamHost: data.host,          // เก็บไว้เผื่อ debug
      proxiedAt: Math.floor(Date.now() / 1000),
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
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'radar index unavailable', detail: `${e?.message || e}` }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
