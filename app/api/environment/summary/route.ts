import { NextRequest } from 'next/server';
import { fetchWithRetry } from '@/lib/radar/fetch-with-retry';
import { parseGistdaHotspots } from '@/lib/environment/gistda-hotspot';
import { parseNasaFirmsCsv } from '@/lib/environment/nasa-firms';
import { assessSourceQuality } from '@/lib/environment/source-quality';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BO_LUANG = { latitude: 18.1633, longitude: 98.3744 };
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=600',
  'Vercel-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600',
};

const allowed = (latitude: number, longitude: number) => Number.isFinite(latitude) && Number.isFinite(longitude) &&
  latitude >= 17.5 && latitude <= 19 && longitude >= 97.5 && longitude <= 99.5;

const fetchSource = async (url: URL, revalidate: number, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchWithRetry(url, { signal: controller.signal, next: { revalidate } }, { attempts: 2, baseDelayMs: 300 });
  } finally {
    clearTimeout(timeout);
  }
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
  const nasaFirmsKey = process.env.NASA_FIRMS_MAP_KEY;
  const fireUrl = gistdaKey ? new URL('https://api.sphere.gistda.or.th/services/info/disaster-hotspot') : null;
  if (fireUrl) fireUrl.search = new URLSearchParams({
    lon: String(longitude), lat: String(latitude),
    disaster_type: 'hotspot', key: gistdaKey ?? '',
  }).toString();

  const firmsSources = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];
  const firmsBounds = `${longitude - 0.55},${latitude - 0.46},${longitude + 0.55},${latitude + 0.46}`;
  const firmsUrls = nasaFirmsKey ? firmsSources.map((source) => new URL(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(nasaFirmsKey)}/${source}/${firmsBounds}/1`)) : [];
  const [weatherResult, airResult, fireResult, firmsResult] = await Promise.allSettled([
    fetchSource(weatherUrl, 600, 8_000),
    fetchSource(airUrl, 900, 8_000),
    fireUrl ? fetchSource(fireUrl, 600, 5_000) : Promise.resolve(null),
    Promise.all(firmsUrls.map((url) => fetchSource(url, 600, 8_000))),
  ]);
    const weatherResponse = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
    const airResponse = airResult.status === 'fulfilled' ? airResult.value : null;
    const fireResponse = fireResult.status === 'fulfilled' ? fireResult.value : null;
    const weather = weatherResponse?.ok ? await weatherResponse.json() : null;
    const airQuality = airResponse?.ok ? await airResponse.json() : null;
    const firePayload = fireResponse?.ok ? await fireResponse.json() : null;
    const parsedFire = fireResponse?.ok ? parseGistdaHotspots(firePayload, { latitude, longitude }) : null;
    const fetchedAt = new Date().toISOString();
    const firmsResponses = firmsResult.status === 'fulfilled' ? firmsResult.value : [];
    const firmsParsed = nasaFirmsKey && firmsResponses.length === firmsSources.length && firmsResponses.every((response) => response.ok)
      ? await Promise.all(firmsResponses.map(async (response) => parseNasaFirmsCsv(await response.text(), { latitude, longitude })))
      : [];
    const firmsReady = firmsParsed.length === firmsSources.length && firmsParsed.every((result) => result.ok);
    const firmsHotspots = firmsReady ? firmsParsed.flatMap((result) => result.ok ? result.hotspots : []) : [];
    const dedupedFirms = [...new Map(firmsHotspots.map((point) => [point.dedupeKey, point])).values()].slice(0, 200);
    const useFirms = firmsReady;
    const nearbyHotspots = useFirms ? dedupedFirms : parsedFire?.ok ? parsedFire.hotspots : [];
    const observedAt = useFirms
      ? firmsParsed.flatMap((result) => result.ok && result.observedAt ? [result.observedAt] : []).sort().at(-1) ?? null
      : parsedFire?.ok ? parsedFire.observedAt : null;
    const satelliteTypes = useFirms
      ? [...new Set(firmsParsed.flatMap((result) => result.ok ? result.satelliteTypes : []))]
      : parsedFire?.ok ? parsedFire.satelliteTypes : [];
    const fireState = useFirms || (fireResponse?.ok && parsedFire?.ok) ? 'ready' : !gistdaKey && !nasaFirmsKey ? 'unconfigured' : 'degraded';
    const coverageCheckedAt = useFirms ? fetchedAt : observedAt;
    const fireQuality = assessSourceQuality(coverageCheckedAt, {
      staleAfterMinutes: 360,
      expireAfterMinutes: 1_440,
      invalidSchema: Boolean(fireResponse?.ok && parsedFire && !parsedFire.ok),
    });
    const airObservedAt = typeof airQuality?.current?.time === 'string' ? airQuality.current.time : null;
    const airQualityState = assessSourceQuality(airObservedAt, { staleAfterMinutes: 180, expireAfterMinutes: 720 });
  return Response.json({
      location: { name: 'ตำบลบ่อหลวง', latitude, longitude }, fetchedAt,
      weather,
      airQuality,
      fire: {
        state: fireState,
        source: useFirms ? 'NASA FIRMS VIIRS' : 'GISTDA Sphere',
        radiusKm: 50,
        count: nearbyHotspots.length,
        hotspots: nearbyHotspots,
        acquisitionTime: observedAt,
        coverageCheckedAt,
        satelliteTypes,
        quality: fireQuality,
        diagnostic: fireState === 'degraded' && firePayload && typeof firePayload === 'object'
          ? { collections: Object.entries(firePayload).slice(0, 10).map(([key, value]) => ({
            key,
            type: Array.isArray(value) ? 'array' : typeof value,
            length: Array.isArray(value) ? value.length : undefined,
            sampleKeys: Array.isArray(value) && value[0] && typeof value[0] === 'object' ? Object.keys(value[0]).slice(0, 12) : undefined,
          })) }
          : undefined,
        message: fireState === 'ready'
          ? `พบ ${nearbyHotspots.length} จุดในรัศมี 50 กม.`
          : fireState === 'unconfigured'
            ? 'ยังไม่ได้ตั้งค่า GISTDA_API_KEY'
            : fireResponse?.ok
              ? 'GISTDA ส่งข้อมูลรูปแบบที่ระบบไม่รองรับ'
              : `GISTDA ตอบกลับ HTTP ${fireResponse?.status ?? 'ไม่ทราบสถานะ'}`,
      },
      sources: {
        weather: { state: weather ? 'ready' : 'degraded', source: 'Open-Meteo', fetchedAt },
        airQuality: {
          state: airQuality ? 'ready' : 'degraded', source: 'Open-Meteo CAMS (แบบจำลอง ไม่ใช่สถานีตรวจวัด)',
          fetchedAt, observedAt: airQualityState.observedAt, quality: airQualityState,
        },
        fire: {
          state: fireState, source: `${useFirms ? 'NASA FIRMS VIIRS NRT' : 'GISTDA Hotspot'} (ดาวเทียม) · รัศมี 50 กม.`,
          fetchedAt: fireState === 'ready' ? fetchedAt : null, observedAt: fireQuality.observedAt,
          quality: fireQuality, satelliteTypes, count: nearbyHotspots.length,
        },
      },
  }, { status: weather ? 200 : 207, headers: CACHE_HEADERS });
}
