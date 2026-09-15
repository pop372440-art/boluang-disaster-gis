export const runtime = 'edge';

const UPSTREAM = 'https://tilecache.rainviewer.com/';

export async function GET(_req: Request, { params }: { params: { seg: string[] } }) {
  const r = await fetch(UPSTREAM + params.seg.join('/'), {
    headers: { Accept: 'image/png' },
    cache: 'force-cache',
    next: { revalidate: 600 },
  });

  if (!r.ok) {
    return new Response(null, {
      status: r.status,
      headers: { 'Cache-Control': 'public, s-maxage=30' },  // cache 429 สั้น ๆ กันยิงซ้ำ
    });
  }

  return new Response(r.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=600, s-maxage=1800, stale-while-revalidate=3600',
    },
  });
}
