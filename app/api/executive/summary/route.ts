import {
  assessExecutiveSituation,
  bangkokLocalToIso,
  finiteNonNegative,
  median,
} from '@/lib/executive/situation-quality';
import { getNwpComparison } from '@/lib/weather/nwp-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BO_LUANG = { latitude: 18.1633, longitude: 98.3744 };
const OPEN_METEO_URL = `https://api.open-meteo.com/v1/forecast?latitude=${BO_LUANG.latitude}&longitude=${BO_LUANG.longitude}&current=temperature_2m,wind_speed_10m,precipitation&daily=precipitation_sum,wind_speed_10m_max&timezone=Asia%2FBangkok&forecast_days=7`;
const ENSEMBLE_URL = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${BO_LUANG.latitude}&longitude=${BO_LUANG.longitude}&daily=precipitation_sum&timezone=Asia%2FBangkok&forecast_days=15&models=google_weathernext2_ensemble`;
const THAIWATER_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h';

type JsonRecord = Record<string, unknown>;

async function fetchJson(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'boluang-disaster-gis/1.0' },
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as JsonRecord;
  } finally {
    clearTimeout(timeout);
  }
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const child of Object.values(value)) {
    const found = findArray(child);
    if (found.length) return found;
  }
  return [];
}

function stationTimestamp(station: JsonRecord) {
  const value = station.rainfall_datetime ?? station.rain_datetime ?? station.datetime;
  return bangkokLocalToIso(value);
}

function nearestRainStation(payload: JsonRecord | null) {
  if (!payload) return null;
  let nearest: { name: string; rain24hMm: number | null; observedAt: string | null; distanceKm: number } | null = null;
  for (const raw of findArray(payload)) {
    if (!raw || typeof raw !== 'object') continue;
    const station = raw as JsonRecord;
    const metadata = station.station && typeof station.station === 'object' ? station.station as JsonRecord : {};
    const lat = finiteNonNegative(metadata.tele_station_lat ?? station.tele_station_lat ?? station.lat ?? station.latitude);
    const lng = finiteNonNegative(metadata.tele_station_long ?? station.tele_station_long ?? station.lng ?? station.longitude);
    if (lat === null || lng === null || lat === 0 || lng === 0) continue;
    const distance = distanceKm(BO_LUANG.latitude, BO_LUANG.longitude, lat, lng);
    if (nearest && distance >= nearest.distanceKm) continue;
    const names = metadata.tele_station_name && typeof metadata.tele_station_name === 'object'
      ? metadata.tele_station_name as JsonRecord
      : {};
    nearest = {
      name: String(names.th ?? metadata.tele_station_name ?? station.tele_station_name ?? 'ไม่ระบุชื่อสถานี'),
      rain24hMm: finiteNonNegative(station.rain_24h ?? station.rain24h ?? station.rain),
      observedAt: stationTimestamp(station),
      distanceKm: Math.round(distance * 10) / 10,
    };
  }
  return nearest;
}

function ensembleSummary(payload: JsonRecord | null) {
  const daily = payload?.daily && typeof payload.daily === 'object' ? payload.daily as JsonRecord : null;
  if (!daily || !Array.isArray(daily.time)) return { memberCount: 0, peakMedianMm: null, peakDate: null };
  const members = Object.entries(daily)
    .filter(([key, value]) => key.startsWith('precipitation_sum') && Array.isArray(value))
    .map(([, value]) => (value as unknown[]).map(finiteNonNegative));
  if (!members.length) return { memberCount: 0, peakMedianMm: null, peakDate: null };
  const medians = daily.time.map((_, dayIndex) => median(
    members.map(member => member[dayIndex]).filter((value): value is number => value !== null),
  ));
  let peakMedianMm: number | null = null;
  let peakDate: string | null = null;
  medians.forEach((value, index) => {
    if (value !== null && (peakMedianMm === null || value > peakMedianMm)) {
      peakMedianMm = value;
      peakDate = String((daily.time as unknown[])[index]);
    }
  });
  return { memberCount: members.length, peakMedianMm, peakDate };
}

export async function GET() {
  const fetchedAt = new Date().toISOString();
  const [modelResult, stationResult, ensembleResult, nwpResult] = await Promise.allSettled([
    fetchJson(OPEN_METEO_URL, 10_000),
    fetchJson(THAIWATER_URL, 10_000),
    fetchJson(ENSEMBLE_URL, 12_000),
    getNwpComparison(),
  ]);

  const modelPayload = modelResult.status === 'fulfilled' ? modelResult.value : null;
  const stationPayload = stationResult.status === 'fulfilled' ? stationResult.value : null;
  const ensemblePayload = ensembleResult.status === 'fulfilled' ? ensembleResult.value : null;
  const current = modelPayload?.current && typeof modelPayload.current === 'object' ? modelPayload.current as JsonRecord : null;
  const currentUnits = modelPayload?.current_units && typeof modelPayload.current_units === 'object' ? modelPayload.current_units as JsonRecord : {};
  const daily = modelPayload?.daily && typeof modelPayload.daily === 'object' ? modelPayload.daily as JsonRecord : null;
  const station = nearestRainStation(stationPayload);
  const modelPrecipitationMm = finiteNonNegative(current?.precipitation);
  const modelReferenceAt = bangkokLocalToIso(current?.time);
  const assessment = assessExecutiveSituation({
    modelPrecipitationMm,
    modelReferenceAt,
    stationRain24hMm: station?.rain24hMm ?? null,
    stationObservedAt: station?.observedAt ?? null,
    stationDistanceKm: station?.distanceKm ?? null,
  });
  const outlook = ensembleSummary(ensemblePayload);

  return Response.json({
    generatedAt: fetchedAt,
    experimental: true,
    location: { name: 'ตำบลบ่อหลวง', ...BO_LUANG },
    currentModel: {
      source: 'Open-Meteo forecast model',
      providerStatus: modelResult.status === 'fulfilled' ? 'available' : 'unavailable',
      referenceAt: modelReferenceAt,
      retrievedAt: fetchedAt,
      intervalMinutes: finiteNonNegative(current?.interval) !== null ? Number(current?.interval) / 60 : null,
      precipitationMm: modelPrecipitationMm,
      precipitationUnit: String(currentUnits.precipitation ?? 'mm'),
      temperatureC: finiteNonNegative(current?.temperature_2m),
      windKph: finiteNonNegative(current?.wind_speed_10m),
    },
    groundReference: {
      source: 'ThaiWater / สทนช. สถานีอ้างอิงรอบตำบล',
      providerStatus: stationResult.status === 'fulfilled' ? 'available' : 'unavailable',
      retrievedAt: fetchedAt,
      station,
    },
    sevenDayForecast: {
      source: 'Open-Meteo forecast model',
      referenceAt: modelReferenceAt,
      time: Array.isArray(daily?.time) ? daily.time : [],
      precipitationSum: Array.isArray(daily?.precipitation_sum)
        ? (daily.precipitation_sum as unknown[]).map(finiteNonNegative)
        : [],
    },
    planningOutlook: {
      source: 'Open-Meteo ensemble · Google WeatherNext 2',
      providerStatus: ensembleResult.status === 'fulfilled' ? 'available' : 'unavailable',
      retrievedAt: fetchedAt,
      horizon: '15 วัน — ใช้เพื่อวางแผน ไม่ใช้แจ้งเตือน',
      ...outlook,
    },
    nwpComparison: nwpResult.status === 'fulfilled' ? nwpResult.value : {
      runAt: null,
      models: [],
      consensus: {
        usable: false,
        agreement: 'unavailable',
        label: 'เปรียบเทียบไม่ได้',
        summary: 'ข้อมูล ECMWF/GFS ไม่ครบหรือหมดอายุ จึงไม่ใช้ประกอบภาพรวมผู้บริหาร',
        officialWarningAllowed: false,
        requiresHumanApproval: true,
      },
    },
    derived: {
      antecedentRainProxy: assessment.antecedentRainProxy,
      label: 'ดัชนีฝนก่อนหน้าโดยประมาณ',
      method: 'ฝน 24 ชม. จากสถานีสดภายใน 10 กม. ÷ 80 มม. × 100; ไม่ใช่ค่าความชื้นดิน',
    },
    assessment,
    decisionPolicy: {
      automatedOperationalActions: false,
      humanApprovalRequired: true,
      message: 'ระบบไม่ออกคำสั่งประกาศ อพยพ เปิด EOC หรือเบิกงบ เจ้าหน้าที่ต้องตรวจสอบและผู้มีอำนาจต้องอนุมัติ',
    },
  }, {
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
