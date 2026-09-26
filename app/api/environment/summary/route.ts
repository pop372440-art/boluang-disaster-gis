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

type HotspotRecord = Record<string, unknown>;

const coordinatesOf = (item: HotspotRecord) => {
  const latitude = Number(item.latitude ?? item.lat);
  const longitude = Number(item.longitude ?? item.lon ?? item.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

const distanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

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
  const gistdaKey = process.env.GISTDA_API_KEY;
  const fireUrl = gistdaKey ? new URL('https://api.sphere.gistda.or.th/services/info/disaster-recurring') : null;
  if (fireUrl) fireUrl.search = new URLSearchParams({
    lon: String(longitude), lat: String(latitude),
    disaster_type: 'hotspot', key: gistdaKey ?? '',
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const [weatherResult, airResult, fireResult] = await Promise.allSettled([
      fetchWithRetry(weatherUrl, { signal: controller.signal, next: { revalidate: 600 } }, { attempts: 2, baseDelayMs: 300 }),
      fetchWithRetry(airUrl, { signal: controller.signal, next: { revalidate: 900 } }, { attempts: 2, baseDelayMs: 300 }),
      fireUrl ? fetchWithRetry(fireUrl, { signal: controller.signal, next: { revalidate: 600 } }, { attempts: 2, baseDelayMs: 300 }) : Promise.resolve(null),
    ]);
    const weatherResponse = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
    const airResponse = airResult.status === 'fulfilled' ? airResult.value : null;
    const fireResponse = fireResult.status === 'fulfilled' ? fireResult.value : null;
    const weather = weatherResponse?.ok ? await weatherResponse.json() : null;
    const airQuality = airResponse?.ok ? await airResponse.json() : null;
    const firePayload = fireResponse?.ok ? await fireResponse.json() : null;
    const records: HotspotRecord[] = Array.isArray(firePayload?.data) ? firePayload.data : [];
    const nearbyHotspots = records.flatMap((item) => {
      const point = coordinatesOf(item);
      if (!point) return [];
      const distance = distanceKm({ latitude, longitude }, point);
      return distance <= 50 ? [{ ...item, latitude: point.latitude, longitude: point.longitude, distanceKm: Number(distance.toFixed(1)) }] : [];
    }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 200);
    const fetchedAt = new Date().toISOString();
    const fireState = !gistdaKey ? 'unconfigured' : fireResponse?.ok ? 'ready' : 'degraded';
    return Response.json({
      location: { name: 'ตำบลบ่อหลวง', latitude, longitude }, fetchedAt,
      weather,
      airQuality,
      fire: {
        state: fireState,
        source: 'GISTDA Sphere',
        radiusKm: 50,
        count: nearbyHotspots.length,
        hotspots: nearbyHotspots,
        message: fireState === 'ready' ? `พบ ${nearbyHotspots.length} จุดในรัศมี 50 กม.` : fireState === 'unconfigured' ? 'ยังไม่ได้ตั้งค่า GISTDA_API_KEY' : `GISTDA ตอบกลับ HTTP ${fireResponse?.status ?? 'ไม่ทราบสถานะ'}`,
      },
      sources: {
        weather: { state: weather ? 'ready' : 'degraded', source: 'Open-Meteo', fetchedAt },
        airQuality: { state: airQuality ? 'ready' : 'degraded', source: 'Open-Meteo CAMS', fetchedAt },
        fire: { state: fireState, source: 'GISTDA Hotspot', fetchedAt: fireResponse?.ok ? fetchedAt : null, count: nearbyHotspots.length },
      },
    }, { status: weather ? 200 : 207, headers: CACHE_HEADERS });
  } finally {
    clearTimeout(timeout);
  }
}
