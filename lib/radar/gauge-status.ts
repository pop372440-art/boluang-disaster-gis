export type PublicGaugeStatus = {
  status: 'ok';
  validation: {
    stage: 'collecting_real_observations';
    validated: false;
    observationCount: number;
    coverageStartedAt: string | null;
    fieldEventCount: number;
  };
  station: {
    id: 'thaiwater:1254';
    code: 'STN0583';
    name: string;
    agencyName: string | null;
    latitude: number;
    longitude: number;
    observedAt: string;
    fetchedAt: string;
    qualityFlag: 'provisional' | 'suspect_stale';
    source: 'thaiwater:rain_24h';
    sourceUrl: string;
  };
  measurements: {
    rain1hMm: number | null;
    rain24hMm: number | null;
  };
  ingestion: {
    status: 'succeeded' | 'failed' | 'running' | 'unknown';
    completedAt: string | null;
  };
};

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const timestamp = (value: unknown) => {
  const parsed = text(value);
  if (!parsed || Number.isNaN(Date.parse(parsed))) return null;
  return parsed;
};

export function parsePublicGaugeStatus(value: unknown): PublicGaugeStatus {
  const root = record(value);
  const validation = record(root?.validation);
  const station = record(root?.station);
  const measurements = record(root?.measurements);
  const ingestion = record(root?.ingestion);
  const stationId = text(station?.id);
  const stationCode = text(station?.code);
  const source = text(station?.source);
  const stationName = text(station?.name);
  const observedAt = timestamp(station?.observedAt);
  const fetchedAt = timestamp(station?.fetchedAt);
  const latitude = finite(station?.latitude);
  const longitude = finite(station?.longitude);
  const qualityFlag = text(station?.qualityFlag);
  const sourceUrl = text(station?.sourceUrl);
  const observationCount = finite(validation?.observationCount);

  if (root?.status !== 'ok' || stationId !== 'thaiwater:1254' || stationCode !== 'STN0583'
      || source !== 'thaiwater:rain_24h' || !stationName || !observedAt || !fetchedAt
      || latitude === null || longitude === null || !sourceUrl || observationCount === null
      || !['provisional', 'suspect_stale'].includes(qualityFlag ?? '')
      || /mock|simulat|virtual|fake|test|demo/i.test(`${source} ${stationName}`)) {
    throw new Error('ข้อมูลสถานีตรวจวัดจริงไม่ผ่านการตรวจสอบตัวตนหรือ provenance');
  }

  const rain1hMm = measurements?.rain1hMm === null ? null : finite(measurements?.rain1hMm);
  const rain24hMm = measurements?.rain24hMm === null ? null : finite(measurements?.rain24hMm);
  if ((rain1hMm !== null && rain1hMm < 0) || (rain24hMm !== null && rain24hMm < 0)) {
    throw new Error('ค่าฝนตรวจวัดอยู่นอกช่วงที่ยอมรับ');
  }

  const ingestionStatus = text(ingestion?.status);
  return {
    status: 'ok',
    validation: {
      stage: 'collecting_real_observations',
      validated: false,
      observationCount,
      coverageStartedAt: timestamp(validation?.coverageStartedAt),
      fieldEventCount: finite(validation?.fieldEventCount) ?? 0,
    },
    station: {
      id: 'thaiwater:1254',
      code: 'STN0583',
      name: stationName,
      agencyName: text(station?.agencyName),
      latitude,
      longitude,
      observedAt,
      fetchedAt,
      qualityFlag: qualityFlag as 'provisional' | 'suspect_stale',
      source: 'thaiwater:rain_24h',
      sourceUrl,
    },
    measurements: { rain1hMm, rain24hMm },
    ingestion: {
      status: ['succeeded', 'failed', 'running'].includes(ingestionStatus ?? '')
        ? ingestionStatus as 'succeeded' | 'failed' | 'running'
        : 'unknown',
      completedAt: timestamp(ingestion?.completedAt),
    },
  };
}
