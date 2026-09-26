import { NextRequest } from 'next/server';
import { fetchWithRetry } from '@/lib/radar/fetch-with-retry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BO_LUANG = { latitude: 18.1633, longitude: 98.3744 };
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=600',
  'Vercel-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600',
};

const allowed = (latitude: number, longitude: number) => Number.isFinite(latitude) && Number.isFinite(longitude) &&
  latitude >= 17.5 && latitude <= 19 && longitude >= 97.5 && longitude <= 99.5;

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get('latitude') ?? BO_LUANG.latitude);
  const longitude = Number(request.nextUrl.searchParams.get('longitude') ?? BO_LUANG.longitude);
  if (!allowed(latitude, longitude)) return Response.json({ error: 'พิกัดอยู่นอกพื้นที่บริการบ่อหลวง' }, { status: 400 });

  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.search = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude), timezone: 'Asia/Bangkok', forecast_days: '3',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,visibility,wind_speed_10m,wind_gusts_10m,uv_index',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max',
  }).toString();
  const airUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  airUrl.search = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude), timezone: 'Asia/Bangkok', forecast_days: '3',
    current: 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,aerosol_optical_depth,dust,european_aqi,us_aqi',
    hourly: 'pm10,pm2_5,dust,european_aqi,us_aqi',
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const [weatherResult, airResult] = await Promise.allSettled([
      fetchWithRetry(weatherUrl, { signal: controller.signal, next: { revalidate: 600 } }, { attempts: 2, baseDelayMs: 300 }),
      fetchWithRetry(airUrl, { signal: controller.signal, next: { revalidate: 900 } }, { attempts: 2, baseDelayMs: 300 }),
    ]);
    const weatherResponse = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
    const airResponse = airResult.status === 'fulfilled' ? airResult.value : null;
    const weather = weatherResponse?.ok ? await weatherResponse.json() : null;
    const airQuality = airResponse?.ok ? await airResponse.json() : null;
    const fetchedAt = new Date().toISOString();
    return Response.json({
      location: { name: 'ตำบลบ่อหลวง', latitude, longitude }, fetchedAt,
      weather,
      airQuality,
      fire: {
        state: process.env.GISTDA_API_KEY ? 'configured' : 'unconfigured',
        source: 'GISTDA / NASA FIRMS',
        message: process.env.GISTDA_API_KEY ? 'พร้อมเรียกข้อมูลจุดความร้อนในแผนที่' : 'ยังไม่ได้ตั้งค่า GISTDA_API_KEY',
      },
      sources: {
        weather: { state: weather ? 'ready' : 'degraded', source: 'Open-Meteo', fetchedAt },
        airQuality: { state: airQuality ? 'ready' : 'degraded', source: 'Open-Meteo CAMS', fetchedAt },
        fire: { state: process.env.GISTDA_API_KEY ? 'ready' : 'unconfigured', source: 'GISTDA / NASA FIRMS', fetchedAt: null },
      },
    }, { status: weather ? 200 : 207, headers: CACHE_HEADERS });
  } finally {
    clearTimeout(timeout);
  }
}

