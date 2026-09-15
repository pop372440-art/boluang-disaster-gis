export const runtime = 'edge';

const UPSTREAM = 'https://tilecache.rainviewer.com';

export async function GET(_req: Request, ctx: any) {
  const p = await ctx.params;
  const seg: string[] = Array.isArray(p?.path) ? p.path : [];
  if (!seg.length) return new Response('bad path', { status: 400 });

  try {
    const r = await fetch(`${UPSTREAM}/${seg.join('/')}`, {
      headers: { Accept: 'image/png,*/*', 'User-Agent': 'boluang-disaster-gis/1.0' },
      cache: 'force-cache',
      next: { revalidate: 900 },
    });

    if (!r.ok) {
      return new Response(null, {
        status: r.status,
        headers: {
          'Cache-Control': 'public, max-age=20, s-maxage=20',
          'Retry-After': r.headers.get('retry-after') ?? '30',
        },
      });
    }

    return new Response(r.body, {
      headers: {
        'Content-Type': r.headers.get('content-type') ?? 'image/png',
        'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'public, max-age=10' } });
  }
}
