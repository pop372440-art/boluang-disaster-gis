export type StationType = 'water' | 'rain';
export type StationFreshnessStatus = 'fresh' | 'stale' | 'expired' | 'unknown';

export const STATION_STALE_AFTER_MINUTES = 120;
export const STATION_EXPIRE_AFTER_MINUTES = 360;
export const LOCAL_STATION_DISTANCE_KM = 10;

export type StationFreshness = {
  status: StationFreshnessStatus;
  ageMinutes: number | null;
  observedAt: string | null;
  label: string;
};

export type StationRisk = {
  color: string;
  label: string;
  level: 'normal' | 'warning' | 'high' | 'critical' | 'unavailable';
  usableForWarning: boolean;
};

export function finiteMeasurement(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

export function normalizeThaiWaterTimestamp(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const withoutZone = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
  const timestamp = Date.parse(withoutZone ? `${withoutZone[1]}T${withoutZone[2]}+07:00` : trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function evaluateStationFreshness(value: unknown, now = Date.now()): StationFreshness {
  const observedAt = normalizeThaiWaterTimestamp(value);
  if (!observedAt) return { status: 'unknown', ageMinutes: null, observedAt: null, label: 'ไม่ทราบเวลาวัด' };

  const ageMinutes = Math.max(0, Math.floor((now - Date.parse(observedAt)) / 60_000));
  if (ageMinutes > STATION_EXPIRE_AFTER_MINUTES) {
    return { status: 'expired', ageMinutes, observedAt, label: 'ข้อมูลหมดอายุ' };
  }
  if (ageMinutes > STATION_STALE_AFTER_MINUTES) {
    return { status: 'stale', ageMinutes, observedAt, label: 'ข้อมูลเก่า' };
  }
  return { status: 'fresh', ageMinutes, observedAt, label: 'ข้อมูลล่าสุด' };
}

export function assessStationRisk(
  value: number | null,
  type: StationType,
  freshness: StationFreshness
): StationRisk {
  if (value === null || freshness.status !== 'fresh') {
    return { color: '#64748b', label: 'ประเมินไม่ได้', level: 'unavailable', usableForWarning: false };
  }

  const thresholds = type === 'rain'
    ? { warning: 35, high: 60, critical: 90 }
    : { warning: 3, high: 5, critical: 8 };

  if (value >= thresholds.critical) return { color: '#ef4444', label: 'วิกฤต', level: 'critical', usableForWarning: true };
  if (value >= thresholds.high) return { color: '#f97316', label: 'เสี่ยงสูง', level: 'high', usableForWarning: true };
  if (value >= thresholds.warning) return { color: '#eab308', label: 'เฝ้าระวัง', level: 'warning', usableForWarning: true };
  return { color: '#10b981', label: 'ปกติ', level: 'normal', usableForWarning: true };
}

export function stationDistanceLabel(distanceKm: number | null | undefined): string {
  if (!Number.isFinite(distanceKm)) return 'ไม่ทราบระยะทาง';
  return (distanceKm as number) <= LOCAL_STATION_DISTANCE_KM
    ? 'ใกล้พื้นที่ตำบล'
    : 'สถานีอ้างอิงนอกตำบล';
}

export function measurementDisplay(value: number | null, type: StationType): string {
  if (value === null) return 'ไม่มีข้อมูล';
  const unit = type === 'water' ? 'ม.' : 'มม.';
  const decimals = type === 'water' ? 2 : 1;
  return `${value.toFixed(decimals)} ${unit}${value === 0 ? ' (ค่าศูนย์ที่รายงาน)' : ''}`;
}
