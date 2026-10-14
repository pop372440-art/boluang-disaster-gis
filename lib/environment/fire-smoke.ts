import { parseSourceTimestamp } from './source-quality.ts';
import type { NormalizedHotspot } from './gistda-hotspot.ts';

export function hotspotAge(point: Pick<NormalizedHotspot, 'acquiredAt'>, now: number) {
  const time = parseSourceTimestamp(point.acquiredAt);
  if (time == null || time > now + 5 * 60_000) return 'unknown';
  const hours = (now - time) / 3_600_000;
  return hours <= 12 ? 'recent' : hours <= 24 ? 'older' : 'historical';
}
export function validPm(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
export function observationUsable(value: string | null | undefined, now: number, maxAgeMinutes: number) {
  const time = parseSourceTimestamp(value);
  return now > 0 && time != null && time <= now + 5 * 60_000 && now - time <= maxAgeMinutes * 60_000;
}
export function windFrom(degrees: unknown) {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return 'ไม่ทราบทิศ';
  return ['เหนือ','ตะวันออกเฉียงเหนือ','ตะวันออก','ตะวันออกเฉียงใต้','ใต้','ตะวันตกเฉียงใต้','ตะวันตก','ตะวันตกเฉียงเหนือ'][Math.round(((degrees % 360 + 360) % 360) / 45) % 8];
}
export type FireSmokeSummary = {
  fetchedAt?: string;
  weather?: { current?: { time?: string; wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number; relative_humidity_2m?: number }; hourly?: { time?: string[]; precipitation?: number[]; precipitation_probability?: number[]; wind_speed_10m?: number[] } };
  airQuality?: { current?: { time?: string; pm2_5?: number }; hourly?: { time?: string[]; pm2_5?: number[] } };
  fire?: { state?: string; source?: string; hotspots?: NormalizedHotspot[]; acquisitionTime?: string; coverageCheckedAt?: string; radiusKm?: number; quality?: { state?: string } };
  sources?: Record<string, { state?: string; source?: string; observedAt?: string; quality?: { state?: string } }>;
};
