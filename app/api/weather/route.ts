import { NextRequest, NextResponse } from 'next/server';
import { PNG } from 'pngjs';
import {
  compareRainModels,
  degreesToThaiWindDirection,
  evaluateWeatherFreshness
} from '@/lib/weather/data-quality';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BO_LUANG = { lat: 18.1633, lng: 98.3744 };
const RADAR_Z = 7;
const RADAR_BLOCK = 3;
const RADAR_SCHEME = 0;

const PX_TO_DBZ = (value: number) => (value <= 4 ? -Infinity : (value / 255) * 87 - 20);
const DBZ_TO_MMH = (dbz: number) => !Number.isFinite(dbz) || dbz < 5 ? 0 : Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6);
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

function bangkokLocalToIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const withZone = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+07:00`;
  const timestamp = Date.parse(withZone);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function lonLatToPx(lat: number, lng: number, zoom: number) {
  const size = 256 * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * size;
  const sin = Math.sin(toRad(lat));
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  return { x, y };
}

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`weather upstream returned ${response.status}`);
  return response.json();
}

async function fetchTile(url: string) {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return await new Promise<any>((resolve) => new PNG().parse(buffer, (error, png) => resolve(error ? null : png)));
  } catch {
    return null;
  }
}

async function buildGrid(host: string, path: string, lat: number, lng: number) {
  const center = lonLatToPx(lat, lng, RADAR_Z);
  const tileX = Math.floor(center.x / 256) - Math.floor(RADAR_BLOCK / 2);
  const tileY = Math.floor(center.y / 256) - Math.floor(RADAR_BLOCK / 2);
  const width = RADAR_BLOCK * 256;
  const grid = { d: new Uint8Array(width * width), w: width, h: width, ox: tileX * 256, oy: tileY * 256 };
  let loadedTiles = 0;

  await Promise.all(Array.from({ length: RADAR_BLOCK * RADAR_BLOCK }).map(async (_, index) => {
    const xIndex = index % RADAR_BLOCK;
    const yIndex = Math.floor(index / RADAR_BLOCK);
    const png = await fetchTile(`${host}${path}/256/${RADAR_Z}/${tileX + xIndex}/${tileY + yIndex}/${RADAR_SCHEME}/1_0.png`);
    if (!png) return;
    loadedTiles += 1;
    for (let pixelY = 0; pixelY < 256; pixelY++) {
      for (let pixelX = 0; pixelX < 256; pixelX++) {
        const sourceIndex = (pixelY * 256 + pixelX) << 2;
        grid.d[(yIndex * 256 + pixelY) * width + (xIndex * 256 + pixelX)] = png.data[sourceIndex + 3] < 20 ? 0 : png.data[sourceIndex];
      }
    }
  }));

  return loadedTiles > 0 ? grid : null;
}

const sample = (grid: any, px: number, py: number) => {
  const x = Math.round(px - grid.ox);
  const y = Math.round(py - grid.oy);
  return x < 0 || y < 0 || x >= grid.w || y >= grid.h ? 0 : grid.d[y * grid.w + x];
};

function sampleArea(grid: any, px: number, py: number, radius = 2) {
  let sum = 0;
  let count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      sum += sample(grid, px + dx, py + dy);
      count += 1;
    }
  }
  return sum / count;
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const requestedLat = Number(searchParams.get('lat'));
  const requestedLng = Number(searchParams.get('lng'));
  const lat = Number.isFinite(requestedLat) && requestedLat >= -90 && requestedLat <= 90 ? requestedLat : BO_LUANG.lat;
  const lng = Number.isFinite(requestedLng) && requestedLng >= -180 && requestedLng <= 180 ? requestedLng : BO_LUANG.lng;

  try {
    const [main, multi, airQuality, rainViewer] = await Promise.all([
      fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure&hourly=precipitation_probability,temperature_2m,weather_code,cape&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max&timezone=Asia%2FBangkok&forecast_days=7`),
      fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&models=ecmwf_ifs025,gfs_seamless,icon_seamless,jma_seamless&timezone=Asia%2FBangkok&forecast_days=3`),
      fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5&timezone=Asia%2FBangkok`),
      fetchJson('https://api.rainviewer.com/public/weather-maps.json')
    ]);

    const current = main?.current ?? {};
    const times: string[] = main?.hourly?.time ?? [];
    const currentTime = typeof current.time === 'string' ? current.time : '';
    const startIndex = Math.max(0, times.findIndex(time => time >= currentTime));
    const multiTimes: string[] = multi?.hourly?.time ?? [];
    const multiStartIndex = Math.max(0, multiTimes.findIndex(time => time >= currentTime));
    const modelKeys = Object.keys(multi?.hourly ?? {}).filter(key => key.startsWith('precipitation_'));
    const modelSeries = modelKeys.map(key => Array.from({ length: 24 }, (_, index) => {
      const value = Number(multi.hourly[key]?.[multiStartIndex + index]);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    }));
    const next24 = Array.from({ length: 24 }, (_, index) => Math.max(0, ...modelSeries.map(series => series[index] ?? 0)));
    const getSum = (hours: number) => next24.slice(0, hours).reduce((sum, value) => sum + value, 0);
    const sums = { s3: getSum(3), s6: getSum(6), s12: getSum(12), s24: getSum(24) };
    const modelComparison = compareRainModels(modelSeries);

    const host = rainViewer?.host ?? 'https://tilecache.rainviewer.com';
    const observedFrames = Array.isArray(rainViewer?.radar?.past) ? rainViewer.radar.past : [];
    const forecastFrames = Array.isArray(rainViewer?.radar?.nowcast) ? rainViewer.radar.nowcast : [];
    const latestObservedFrame = observedFrames.at(-1);
    const radarObservedAt = Number.isFinite(latestObservedFrame?.time)
      ? new Date(latestObservedFrame.time * 1000).toISOString()
      : null;
    const radarFreshness = evaluateWeatherFreshness(radarObservedAt, 20, 40);

    let observedRainRate: number | null = null;
    if (latestObservedFrame?.path && radarFreshness.status !== 'expired') {
      const grid = await buildGrid(host, latestObservedFrame.path, lat, lng);
      if (grid) {
        const center = lonLatToPx(lat, lng, RADAR_Z);
        observedRainRate = DBZ_TO_MMH(PX_TO_DBZ(sampleArea(grid, center.x, center.y, 2)));
      }
    }

    const alertLevel = observedRainRate !== null
      ? observedRainRate >= 25 ? 'RED' : observedRainRate >= 10 ? 'ORANGE' : observedRainRate >= 2 ? 'YELLOW' : 'GREEN'
      : null;
    const levelColors = { GREEN: '#10b981', YELLOW: '#facc15', ORANGE: '#f97316', RED: '#ef4444' } as const;
    const weatherObservedAt = bangkokLocalToIso(current.time);
    const airObservedAt = bangkokLocalToIso(airQuality?.current?.time);
    const weatherFreshness = evaluateWeatherFreshness(weatherObservedAt, 90, 180);
    const airFreshness = evaluateWeatherFreshness(airObservedAt, 90, 180);

    const sourceTimes = [weatherObservedAt, airObservedAt, radarObservedAt]
      .map(value => value ? Date.parse(value) : NaN)
      .filter(Number.isFinite);
    const latestSourceTime = sourceTimes.length ? new Date(Math.max(...sourceTimes)).toISOString() : null;
    const screeningAlert = radarFreshness.status === 'fresh' && observedRainRate !== null && alertLevel ? {
      level: alertLevel,
      title: 'สถานะคัดกรองล่าสุดจากเรดาร์',
      message: `ตรวจพบฝน ${observedRainRate.toFixed(1)} มม./ชม.`,
      color: levelColors[alertLevel],
      sums
    } : null;
    const nowcast = radarFreshness.status === 'fresh' && observedRainRate !== null ? {
      status: observedRainRate >= 0.5 ? 'RAINING_NOW' : 'CLEAR',
      headline: observedRainRate >= 0.5 ? `พบฝน ${observedRainRate.toFixed(1)} มม./ชม.` : 'ไม่พบฝนที่พิกัดจากเฟรมล่าสุด',
      etaMinutes: 0
    } : {
      status: 'UNAVAILABLE',
      headline: radarFreshness.status === 'stale' ? 'ข้อมูลเรดาร์เก่าเกินเกณฑ์ จึงระงับการประเมิน' : 'ข้อมูลเรดาร์ไม่พร้อมสำหรับการประเมิน',
      etaMinutes: null
    };

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      updatedAt: latestSourceTime,
      current: {
        ...current,
        wind_direction_text: degreesToThaiWindDirection(current.wind_direction_10m),
        rain_now: current.precipitation,
        rain_today: main?.daily?.precipitation_sum?.[0] ?? null,
        uv_max: main?.daily?.uv_index_max?.[0] ?? null
      },
      alert: screeningAlert,
      nowcast,
      corridor: [],
      radarOk: observedRainRate !== null,
      aqi: {
        us_aqi: Number.isFinite(Number(airQuality?.current?.us_aqi)) ? Math.round(Number(airQuality.current.us_aqi)) : null,
        pm2_5: Number.isFinite(Number(airQuality?.current?.pm2_5)) ? +Number(airQuality.current.pm2_5).toFixed(1) : null
      },
      hourly: times.slice(startIndex, startIndex + 24).map((time, index) => ({
        hour: time.slice(11, 16),
        rain: next24[index] ?? null,
        prob: main?.hourly?.precipitation_probability?.[startIndex + index] ?? null
      })),
      forecast: main?.daily?.time?.map((day: string, index: number) => ({
        day: index === 0 ? 'วันนี้' : new Date(`${day}T00:00:00+07:00`).toLocaleDateString('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' }),
        rain: main.daily.precipitation_sum[index],
        maxTemp: main.daily.temperature_2m_max[index],
        minTemp: main.daily.temperature_2m_min[index]
      })) ?? [],
      modelComparison,
      sources: {
        weather: { provider: 'Open-Meteo', dataType: 'แบบจำลองพยากรณ์', freshness: weatherFreshness },
        air: { provider: 'CAMS ผ่าน Open-Meteo', dataType: 'แบบจำลองคุณภาพอากาศ', freshness: airFreshness },
        radar: { provider: 'RainViewer', dataType: 'ภาพเรดาร์ตรวจอากาศ', freshness: radarFreshness },
        station: { provider: null, dataType: 'สถานีตรวจวัดจริง', status: 'ไม่มีสถานีในพื้นที่ที่เชื่อมต่อและยืนยันแล้ว' }
      },
      radar: {
        host,
        freshness: radarFreshness,
        observedAt: radarObservedAt,
        frames: [
          ...observedFrames.map((frame: any) => ({ ...frame, kind: 'observed', isForecast: false })),
          ...forecastFrames.map((frame: any) => ({ ...frame, kind: 'nowcast', isForecast: true }))
        ].map((frame: any) => ({
          time: frame.time,
          path: frame.path,
          kind: frame.kind,
          isForecast: frame.isForecast,
          url: `${host}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`
        }))
      }
    });
  } catch (error: unknown) {
    console.error('[weather] upstream request failed', {
      code: 'WEATHER_UPSTREAM_FAILED',
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ ok: false, error: 'แหล่งข้อมูลสภาพอากาศขัดข้องชั่วคราว' }, { status: 502 });
  }
}
