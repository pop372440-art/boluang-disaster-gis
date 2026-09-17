import { transitionAlertState, type AlertState } from './alert-state-machine.ts';
import type { DataFreshness } from './types.ts';
import type { GeoJsonFeature, Position } from './geojson-validation.ts';
import type { OpenMeteoLocationForecast } from './open-meteo-adapter.ts';
import { aggregatePolygonValues } from './polygon-aggregation.ts';
import { assessRisk, sumApi7 } from './risk-engine.ts';
import { getRiskLevelDefinition, RISK_CONFIG } from './threshold-config.ts';
import { generateRepresentativeSamplePoints } from './village-sampling.ts';

export type VillageSamplePlan = {
  featureIndex: number;
  villageId: string;
  points: Position[];
};

export type VillageRiskRow = {
  id: string;
  featureIndex: number;
  moo: string;
  name: string;
  households: number;
  population: number;
  centroid: Position;
  sampleCount: number;
  sampleCoverage: number;
  rain1h: number | null;
  rain3h: number | null;
  rain3hMean: number | null;
  rain3hMax: number | null;
  rain3hP90: number | null;
  rain24h: number | null;
  maxProb: number | null;
  api7: number | null;
  soilFactor: number | null;
  terrainFactor: number | null;
  riskIndex: number | null;
  level: ReturnType<typeof getRiskLevelDefinition> & { act: string };
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  recommendedActions: string[];
  dataFreshness: DataFreshness;
  alertEligible: boolean;
  alertState: AlertState;
  peakTime: Date | null;
  hours: Array<{ time: Date | null; rain: number | null; prob: number | null }>;
  raw: Record<string, unknown>;
};

type SampleMetric = {
  rain1h: number | null;
  rain3h: number | null;
  rain24h: number | null;
  probability: number | null;
  api7: number | null;
  hours: Array<{ time: Date | null; rain: number | null; prob: number | null }>;
};

export function createVillageSamplePlans(features: GeoJsonFeature[]): VillageSamplePlan[] {
  return features.map((feature, featureIndex) => ({
    featureIndex,
    villageId: String(feature.properties.village_id ?? `feature-${featureIndex}`),
    points: generateRepresentativeSamplePoints(feature.geometry, RISK_CONFIG.villageSampling),
  }));
}

export function flattenSamplePlans(plans: VillageSamplePlan[]) {
  return plans.flatMap((plan) => plan.points.map((point) => ({
    featureIndex: plan.featureIndex,
    longitude: point[0],
    latitude: point[1],
  })));
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function extractSampleMetric(location: OpenMeteoLocationForecast | undefined, now: number): SampleMetric {
  const times = location?.hourly.time ?? [];
  const precipitation = location?.hourly.precipitation ?? [];
  const probability = location?.hourly.precipitationProbability ?? [];
  let index = times.findIndex((time) => new Date(`${time}:00+07:00`).getTime() >= now);
  if (index < 0) index = Math.max(times.length - 4, 0);
  const hours = [1, 2, 3].map((offset) => ({
    time: times[index + offset] ? new Date(`${times[index + offset]}:00+07:00`) : null,
    rain: precipitation[index + offset] ?? null,
    prob: probability[index + offset] ?? null,
  }));
  const rain3h = hours.every((hour) => hour.rain != null)
    ? hours.reduce((sum, hour) => sum + (hour.rain as number), 0)
    : null;
  const rain24Values = precipitation.slice(Math.max(index - 24, 0), index);
  const rain24h = rain24Values.length === 24 && rain24Values.every((value) => value != null)
    ? rain24Values.reduce<number>((sum, value) => sum + (value as number), 0)
    : null;
  const validProbability = hours.map((hour) => hour.prob).filter((value): value is number => value != null);
  return {
    rain1h: hours[0]?.rain ?? null,
    rain3h,
    rain24h,
    probability: validProbability.length ? Math.max(...validProbability) : null,
    api7: sumApi7(location?.daily.precipitationSum.slice(0, 7) ?? []),
    hours,
  };
}

export function aggregateVillageForecasts(input: {
  features: GeoJsonFeature[];
  plans: VillageSamplePlan[];
  locations: OpenMeteoLocationForecast[];
  freshness: DataFreshness;
  fetchedAt: string;
  previousAlerts: Map<string, AlertState>;
  now?: number;
}): VillageRiskRow[] {
  const now = input.now ?? Date.now();
  let locationIndex = 0;
  const rows = input.features.map((feature, featureIndex) => {
    const plan = input.plans[featureIndex];
    const sampleLocations = input.locations.slice(locationIndex, locationIndex + plan.points.length);
    locationIndex += plan.points.length;
    const sampleMetrics = sampleLocations.map((location) => extractSampleMetric(location, now));
    const method = RISK_CONFIG.villageSampling.aggregationMethod;
    const coverage = RISK_CONFIG.villageSampling.minimumCoverage;
    const rain1h = aggregatePolygonValues(sampleMetrics.map((sample) => sample.rain1h), method, coverage);
    const rain3h = aggregatePolygonValues(sampleMetrics.map((sample) => sample.rain3h), method, coverage);
    const rain24h = aggregatePolygonValues(sampleMetrics.map((sample) => sample.rain24h), 'mean', coverage);
    const api7 = aggregatePolygonValues(sampleMetrics.map((sample) => sample.api7), 'mean', coverage);
    const probability = aggregatePolygonValues(sampleMetrics.map((sample) => sample.probability), 'max', coverage);
    const hours = [0, 1, 2].map((hourIndex) => {
      const hourRain = aggregatePolygonValues(
        sampleMetrics.map((sample) => sample.hours[hourIndex]?.rain), method, coverage,
      );
      const hourProbability = aggregatePolygonValues(
        sampleMetrics.map((sample) => sample.hours[hourIndex]?.prob), 'max', coverage,
      );
      return {
        time: sampleMetrics.find((sample) => sample.hours[hourIndex]?.time)?.hours[hourIndex].time ?? null,
        rain: hourRain.selected,
        prob: hourProbability.selected,
      };
    });
    const peakHour = [...hours].sort((left, right) => (right.rain ?? -1) - (left.rain ?? -1))[0];
    const properties = feature.properties;
    const slopeValue = properties.slope_deg ?? properties.slope ?? properties.SLOPE;
    const slope = slopeValue == null || slopeValue === '' ? null : Number(slopeValue);
    const assessment = assessRisk({
      rain3h: rain3h.selected,
      api7: api7.selected,
      slopeDeg: typeof slope === 'number' && Number.isFinite(slope) && slope >= 0 ? slope : null,
      dataFreshness: input.freshness,
    });
    const id = String(properties.village_id ?? `feature-${featureIndex}`);
    const alertState = transitionAlertState(input.previousAlerts.get(id) ?? null, {
      riskIndex: assessment.riskIndex,
      alertEligible: assessment.alertEligible,
      now: input.fetchedAt,
    });
    const level = getRiskLevelDefinition(assessment.level);
    return {
      id,
      featureIndex,
      moo: String(properties.moo ?? featureIndex + 1),
      name: String(properties.name_th ?? properties.own_villag ?? `หมู่ ${featureIndex + 1}`),
      households: Number(properties.households ?? properties.house ?? properties.HOUSE ?? properties.hh ?? 0),
      population: Number(properties.population ?? properties.pop ?? properties.POP ?? 0),
      centroid: plan.points[0],
      sampleCount: plan.points.length,
      sampleCoverage: rain3h.coverage,
      rain1h: rain1h.selected,
      rain3h: rain3h.selected,
      rain3hMean: rain3h.mean,
      rain3hMax: rain3h.max,
      rain3hP90: rain3h.p90,
      rain24h: rain24h.selected,
      maxProb: probability.selected,
      api7: api7.selected,
      soilFactor: assessment.soilFactor,
      terrainFactor: assessment.terrainFactor,
      riskIndex: assessment.riskIndex,
      level: { ...level, act: level.recommendedActions[0] },
      confidence: rain3h.coverage < 1 ? 'low' : assessment.confidence,
      reasons: rain3h.coverage < 1
        ? [...assessment.reasons, `จุดตัวอย่างสมบูรณ์ ${rain3h.validSamples}/${rain3h.totalSamples} จุด`]
        : assessment.reasons,
      recommendedActions: assessment.recommendedActions,
      dataFreshness: assessment.dataFreshness,
      alertEligible: assessment.alertEligible,
      alertState,
      peakTime: peakHour?.time ?? null,
      hours,
      raw: properties,
    };
  });
  return rows.sort((left, right) => (right.riskIndex ?? -1) - (left.riskIndex ?? -1));
}
