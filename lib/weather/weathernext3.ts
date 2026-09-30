import { createSign } from 'node:crypto';

const BIGQUERY_SCOPE = 'https://www.googleapis.com/auth/bigquery';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BIGQUERY_URL = 'https://bigquery.googleapis.com/bigquery/v2';
const BANGKOK_TIME_ZONE = 'Asia/Bangkok';
const MEMBER_COUNT = 64;

type BigQueryCell = { v?: unknown };
type BigQueryRow = { f?: BigQueryCell[] };
type BigQueryResponse = {
  jobComplete?: boolean;
  rows?: BigQueryRow[];
};

export type WeatherNext3Outlook = {
  source: 'Google WeatherNext 3 · BigQuery';
  providerStatus: 'available';
  retrievedAt: string;
  referenceAt: string;
  memberCount: 64;
  peakMedianMm: number | null;
  peakDate: string | null;
  dailyMedianMm: Array<{ date: string; precipitationMm: number }>;
  method: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function configuredValue(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function weatherNext3Configuration() {
  const projectId = configuredValue('GOOGLE_WEATHERNEXT3_PROJECT_ID');
  const datasetId = configuredValue('GOOGLE_WEATHERNEXT3_DATASET_ID');
  const clientEmail = configuredValue('GOOGLE_WEATHERNEXT3_SERVICE_ACCOUNT_EMAIL');
  const privateKey = configuredValue('GOOGLE_WEATHERNEXT3_PRIVATE_KEY')?.replace(/\\n/g, '\n') ?? null;

  if (!projectId || !datasetId || !clientEmail || !privateKey) return null;
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,1023}$/.test(datasetId)) return null;
  return { projectId, datasetId, clientEmail, privateKey };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function accessToken(config: NonNullable<ReturnType<typeof weatherNext3Configuration>>) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: config.clientEmail,
    scope: BIGQUERY_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(config.privateKey, 'base64url')}`;

  const response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  }, 8_000);
  if (!response.ok) throw new Error(`WeatherNext authentication failed (${response.status})`);
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== 'string') throw new Error('WeatherNext authentication response is invalid');
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return payload.access_token;
}

function queryFor(projectId: string, datasetId: string) {
  const table = `\`${projectId}.${datasetId}.weathernext_3_0_0_0p1deg\``;
  return `
    WITH latest AS (
      SELECT MAX(init_time) AS init_time
      FROM ${table}
      WHERE init_time BETWEEN TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 HOUR) AND CURRENT_TIMESTAMP()
        AND EXTRACT(HOUR FROM init_time) IN (0, 6, 12, 18)
    ), nearest_cell AS (
      SELECT AS VALUE weather
      FROM ${table} AS weather
      JOIN latest USING (init_time)
      ORDER BY ST_DISTANCE(weather.geography, ST_GEOGPOINT(98.3744, 18.1633))
      LIMIT 1
    )
    SELECT
      FORMAT_TIMESTAMP('%FT%TZ', weather.init_time) AS run_at,
      FORMAT_TIMESTAMP('%FT%TZ', forecast.time) AS forecast_time,
      CAST(forecast.total_precipitation_1hr_p50 * 1000 AS STRING) AS precipitation_mm
    FROM nearest_cell AS weather
    CROSS JOIN UNNEST(weather.forecast) AS forecast
    WHERE forecast.hours BETWEEN 1 AND 360
    ORDER BY forecast.time
  `;
}

export function aggregateWeatherNext3Daily(rows: Array<{ forecastTime: string; precipitationMm: number }>) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isFinite(Date.parse(row.forecastTime)) || !Number.isFinite(row.precipitationMm) || row.precipitationMm < 0) continue;
    const date = formatter.format(new Date(row.forecastTime));
    totals.set(date, (totals.get(date) ?? 0) + row.precipitationMm);
  }
  return [...totals.entries()].map(([date, precipitationMm]) => ({
    date,
    precipitationMm: Math.round(precipitationMm * 10) / 10,
  }));
}

export async function getWeatherNext3Outlook(): Promise<WeatherNext3Outlook | null> {
  const config = weatherNext3Configuration();
  if (!config) return null;
  const token = await accessToken(config);
  const response = await fetchWithTimeout(`${BIGQUERY_URL}/projects/${encodeURIComponent(config.projectId)}/queries`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: queryFor(config.projectId, config.datasetId),
      useLegacySql: false,
      timeoutMs: 10_000,
      maximumBytesBilled: '500000000',
    }),
  }, 12_000);
  if (!response.ok) throw new Error(`WeatherNext BigQuery request failed (${response.status})`);
  const payload = await response.json() as BigQueryResponse;
  if (!payload.jobComplete) throw new Error('WeatherNext BigQuery request did not finish in time');

  let referenceAt: string | null = null;
  const hourly: Array<{ forecastTime: string; precipitationMm: number }> = [];
  for (const row of payload.rows ?? []) {
    const values = row.f ?? [];
    const runAt = values[0]?.v;
    const forecastTime = values[1]?.v;
    const precipitationMm = Number(values[2]?.v);
    if (typeof runAt === 'string') referenceAt = runAt;
    if (typeof forecastTime === 'string' && Number.isFinite(precipitationMm) && precipitationMm >= 0) {
      hourly.push({ forecastTime, precipitationMm });
    }
  }
  if (!referenceAt || hourly.length < 24) throw new Error('WeatherNext BigQuery returned incomplete forecast data');

  const dailyMedianMm = aggregateWeatherNext3Daily(hourly);
  const peak = dailyMedianMm.reduce<{ date: string; precipitationMm: number } | null>(
    (current, day) => current === null || day.precipitationMm > current.precipitationMm ? day : current,
    null,
  );
  return {
    source: 'Google WeatherNext 3 · BigQuery',
    providerStatus: 'available',
    retrievedAt: new Date().toISOString(),
    referenceAt,
    memberCount: MEMBER_COUNT,
    peakMedianMm: peak?.precipitationMm ?? null,
    peakDate: peak?.date ?? null,
    dailyMedianMm,
    method: 'ผลรวมรายวันของมัธยฐาน ensemble (p50) จากฝนสะสมรายชั่วโมง 1 ชม. แปลงจากเมตรเป็นมิลลิเมตร',
  };
}
