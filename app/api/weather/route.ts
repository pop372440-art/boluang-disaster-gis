// app/api/weather/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PNG } from 'pngjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ═══════════ ค่าคงที่ ═══════════ */
const BO_LUANG = { lat: 18.1633, lng: 98.3744 };
const T = {
  YELLOW: { peakHourly: 4, sum3h: 12 },
  ORANGE: { peakHourly: 8, sum3h: 25, sum6h: 25 },
  RED: { sum6h: 45, sum12h: 50, consecMm: 12, consecCount: 2 },
};
const OBS = { yellow: 2, orange: 10, red: 25 };

const RADAR_Z = 7;
const RADAR_BLOCK = 3;
const RADAR_SCHEME = 0;
const CORRIDOR_KM = [10, 20, 30, 45, 60, 80, 100, 120];

/* ═══════════ ฟังก์ชันคำนวณเรดาร์ ═══════════ */
const PX_TO_DBZ = (v: number) => (v <= 4 ? -Infinity : (v / 255) * 87 - 20);
const DBZ_TO_MMH = (d: number) => !isFinite(d) || d < 5 ? 0 : Math.pow(Math.pow(10, d / 10) / 200, 1 / 1.6);
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

async function fetchTile(url: string) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return await new Promise<any>((res) => new PNG().parse(buf, (e, p) => res(e ? null : p)));
  } catch { return null; }
}

async function buildGrid(host: string, path: string, lat: number, lng: number) {
  const n = 256 * Math.pow(2, RADAR_Z), x = ((lng + 180) / 360) * n, y = (0.5 - Math.log((1 + Math.sin(toRad(lat))) / (1 - Math.sin(toRad(lat)))) / (4 * Math.PI)) * n;
  const tx0 = Math.floor(x / 256) - Math.floor(RADAR_BLOCK / 2), ty0 = Math.floor(y / 256) - Math.floor(RADAR_BLOCK / 2);
  const W = RADAR_BLOCK * 256, grid = { d: new Uint8Array(W * W), w: W, h: W, ox: tx0 * 256, oy: ty0 * 256 };
  await Promise.all(Array.from({ length: RADAR_BLOCK * RADAR_BLOCK }).map((_, i) => {
    const xi = i % RADAR_BLOCK, yi = Math.floor(i / RADAR_BLOCK);
    return fetchTile(`${host}${path}/256/${RADAR_Z}/${tx0 + xi}/${ty0 + yi}/${RADAR_SCHEME}/1_0.png`).then(png => {
      if (png) for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) { const k = (py * 256 + px) << 2; grid.d[(yi * 256 + py) * W + (xi * 256 + px)] = png.data[k + 3] < 20 ? 0 : png.data[k]; }
    });
  }));
  return grid;
}

const sample = (g: any, px: number, py: number) => { const x = Math.round(px - g.ox), y = Math.round(py - g.oy); return (x < 0 || y < 0 || x >= g.w || y >= g.h) ? 0 : g.d[y * g.w + x]; };
function sampleArea(g: any, px: number, py: number, r = 2) { let s = 0, n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { s += sample(g, px + dx, py + dy); n++; } return s / n; }

/* ═══════════ HANDLER ═══════════ */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams, lat = parseFloat(sp.get('lat') ?? '') || BO_LUANG.lat, lng = parseFloat(sp.get('lng') ?? '') || BO_LUANG.lng;
  try {
    const [main, multi, aqi, rvMeta] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=precipitation_probability,temperature_2m,weather_code,cape&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max&timezone=Asia%2FBangkok&forecast_days=7`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&models=ecmwf_ifs025,gfs_seamless,icon_seamless,jma_seamless&timezone=Asia%2FBangkok&forecast_days=3`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5&timezone=Asia%2FBangkok`, { cache: 'no-store' }).then(r => r.json()),
      fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' }).then(r => r.json()),
    ]);

    const cur = main.current, times = main.hourly?.time ?? [];
    const startIdx = Math.max(0, times.findIndex((t: string) => t >= cur.time));

    const next24 = Array.from({ length: 24 }).map((_, i) => {
      let mx = 0;
      Object.keys(multi.hourly).filter(k => k.startsWith('precipitation')).forEach(k => {
        const v = Number(multi.hourly[k][startIdx + i] ?? 0);
        if (isFinite(v) && v > mx) mx = v;
      });
      return mx;
    });

    const host = rvMeta?.host ?? 'https://tilecache.rainviewer.com', past = rvMeta?.radar?.past ?? [];
    let obsMmh = 0, corridor: any[] = [], radarOk = false;

    if (past.length >= 3) {
      const gB = await buildGrid(host, past[past.length - 1].path, lat, lng);
      if (gB) {
        radarOk = true;
        const c = lonLatToPx(lat, lng, RADAR_Z);
        obsMmh = DBZ_TO_MMH(PX_TO_DBZ(sampleArea(gB, c.x, c.y, 2)));
        corridor = CORRIDOR_KM.map(km => ({ distanceKm: km, mmh: +DBZ_TO_MMH(PX_TO_DBZ(sampleArea(gB, c.x, c.y, 2))).toFixed(1), wet: true }));
      }
    }

    const payload = {
      ok: true, updatedAt: new Date().toISOString(),
      current: { ...cur, rain_now: cur.precipitation, rain_today: main.daily?.precipitation_sum?.[0] },
      alert: { level: obsMmh >= 25 ? 'RED' : obsMmh >= 10 ? 'ORANGE' : obsMmh >= 2 ? 'YELLOW' : 'GREEN', title: 'สถานะล่าสุดจากเรดาร์', message: `ตรวจพบฝน ${obsMmh.toFixed(1)} มม./ชม.` },
      nowcast: { status: obsMmh >= 0.5 ? 'RAINING_NOW' : 'CLEAR', headline: obsMmh >= 0.5 ? `พบฝน ${obsMmh.toFixed(1)} มม./ชม.` : 'สภาพอากาศปกติ' },
      hourly: times.slice(startIdx, startIdx + 24).map((t: string, i: number) => ({ hour: t.slice(11, 16), rain: next24[i] })),
      forecast: main.daily?.time?.map((d: string, i: number) => ({ day: new Date(d).toLocaleDateString('th-TH', { weekday: 'short' }), rain: main.daily.precipitation_sum[i] })),
      radar: { host, frames: [...past, ...rvMeta?.radar?.nowcast].map((f: any) => ({ time: f.time, path: f.path, url: `${host}${f.path}/256/{z}/{x}/{y}/4/1_1.png` })) }
    };
    return NextResponse.json(payload);
  } catch { return NextResponse.json({ ok: false }, { status: 502 }); }
}
