import type { DataSourceStatus, RadarMetadata } from './types.ts';

export const RADAR_REPORT_SCHEMA_VERSION = 'bo-luang-radar-report/1.0';

type ReportVillage = {
  id: string;
  moo: string;
  name: string;
  rain3h: number | null;
  riskIndex: number | null;
  level: { key: string; name: string };
  confidence: string;
  metNorwayFetchedAt?: string;
  forecastComparison?: { agreement?: string };
};

type ReportGauge = {
  station: { code: string; observedAt: string; fetchedAt: string; source: string };
  measurements: { rain1hMm: number | null; rain24hMm: number | null };
} | null;

const sourceRecord = (id: string, version: string, status: DataSourceStatus) => ({
  id,
  source: status.source,
  sourceVersion: version,
  observedAt: status.timestamp,
  checkedAt: status.freshness?.checkedAt ?? null,
  freshness: status.freshness?.status ?? 'unknown',
  ageMinutes: status.freshness?.ageMinutes ?? null,
});

export function buildRadarSituationReport(input: {
  generatedAt?: string;
  radarData: RadarMetadata | null;
  radarStatus: DataSourceStatus;
  forecastStatus: DataSourceStatus;
  metNorwayStatus: DataSourceStatus;
  gaugeStatus: ReportGauge;
  gaugeSourceStatus: DataSourceStatus;
  villages: ReportVillage[];
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  return {
    schemaVersion: RADAR_REPORT_SCHEMA_VERSION,
    generatedAt,
    area: 'ตำบลบ่อหลวง อำเภอฮอด จังหวัดเชียงใหม่',
    validation: {
      status: 'public_beta_unvalidated',
      notice: 'ข้อมูลเพื่อการเฝ้าระวัง ต้องให้เจ้าหน้าที่ตรวจสอบก่อนประกาศหรือสั่งการ',
    },
    sources: [
      sourceRecord('rainviewer', 'RainViewer weather-maps.json', input.radarStatus),
      sourceRecord('open-meteo', 'Open-Meteo Forecast API v1', input.forecastStatus),
      sourceRecord('met-norway', 'MET Norway Locationforecast 2.0 compact', input.metNorwayStatus),
      sourceRecord('stn0583', input.gaugeStatus?.station.source ?? 'thaiwater:rain_24h', input.gaugeSourceStatus),
    ],
    radar: {
      metadataFetchedAt: input.radarData?.fetchedAt ?? null,
      metadataGeneratedAt: input.radarData?.generatedAt ?? null,
      latestObservedAt: input.radarData?.observedFrames.at(-1)
        ? new Date(input.radarData.observedFrames.at(-1)!.time * 1000).toISOString()
        : null,
      observedFrameCount: input.radarData?.observedFrames.length ?? 0,
      nowcastFrameCount: input.radarData?.nowcastFrames.length ?? 0,
    },
    station: input.gaugeStatus ? {
      code: input.gaugeStatus.station.code,
      observedAt: input.gaugeStatus.station.observedAt,
      fetchedAt: input.gaugeStatus.station.fetchedAt,
      sourceVersion: input.gaugeStatus.station.source,
      rain1hMm: input.gaugeStatus.measurements.rain1hMm,
      rain24hMm: input.gaugeStatus.measurements.rain24hMm,
    } : null,
    villages: input.villages.map((village) => ({
      id: village.id,
      moo: village.moo,
      name: village.name,
      rain3hMm: village.rain3h,
      riskIndex: village.riskIndex,
      riskLevel: village.level.key,
      riskLabel: village.level.name,
      confidence: village.confidence,
      forecastObservedAt: input.forecastStatus.timestamp,
      metNorwayObservedAt: village.metNorwayFetchedAt ?? input.metNorwayStatus.timestamp,
      modelAgreement: village.forecastComparison?.agreement ?? 'unavailable',
    })),
  };
}
