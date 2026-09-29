export type FreshnessStatus = 'fresh' | 'stale' | 'expired' | 'unknown';
export type SituationLevel = 'normal' | 'limited' | 'monitor' | 'unavailable';

export type Freshness = {
  status: FreshnessStatus;
  ageMinutes: number | null;
  referenceAt: string | null;
};

export type SituationInput = {
  modelPrecipitationMm: number | null;
  modelReferenceAt: string | null;
  stationRain24hMm: number | null;
  stationObservedAt: string | null;
  stationDistanceKm: number | null;
  now?: number;
};

export type SituationAssessment = {
  level: SituationLevel;
  label: string;
  summary: string;
  dataQuality: 'ready' | 'limited' | 'unavailable';
  modelFreshness: Freshness;
  stationFreshness: Freshness;
  stationUsable: boolean;
  antecedentRainProxy: number | null;
  officialWarningAllowed: false;
  requiresHumanApproval: true;
  reviewItems: string[];
};

export const LOCAL_REFERENCE_RADIUS_KM = 10;
export const MODEL_MONITOR_THRESHOLD_MM = 10;
export const STATION_MONITOR_THRESHOLD_MM_24H = 35;

export function finiteNonNegative(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function bangkokLocalToIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const timestamp = Date.parse(hasZone ? trimmed : `${trimmed}+07:00`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function evaluateFreshness(
  value: string | null | undefined,
  staleAfterMinutes: number,
  expireAfterMinutes: number,
  now = Date.now(),
): Freshness {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return { status: 'unknown', ageMinutes: null, referenceAt: null };
  const ageMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (ageMinutes > expireAfterMinutes) return { status: 'expired', ageMinutes, referenceAt: new Date(timestamp).toISOString() };
  if (ageMinutes > staleAfterMinutes) return { status: 'stale', ageMinutes, referenceAt: new Date(timestamp).toISOString() };
  return { status: 'fresh', ageMinutes, referenceAt: new Date(timestamp).toISOString() };
}

export function median(values: number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value)).toSorted((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

export function assessExecutiveSituation(input: SituationInput): SituationAssessment {
  const now = input.now ?? Date.now();
  const modelFreshness = evaluateFreshness(input.modelReferenceAt, 90, 180, now);
  const stationFreshness = evaluateFreshness(input.stationObservedAt, 120, 360, now);
  const modelUsable = input.modelPrecipitationMm !== null && modelFreshness.status === 'fresh';
  const stationUsable = input.stationRain24hMm !== null &&
    stationFreshness.status === 'fresh' &&
    input.stationDistanceKm !== null &&
    input.stationDistanceKm <= LOCAL_REFERENCE_RADIUS_KM;

  const antecedentRainProxy = stationUsable && input.stationRain24hMm !== null
    ? Math.min(100, Math.round((input.stationRain24hMm / 80) * 100))
    : null;

  const shared = {
    modelFreshness,
    stationFreshness,
    stationUsable,
    antecedentRainProxy,
    officialWarningAllowed: false as const,
    requiresHumanApproval: true as const,
  };

  if (!modelUsable) {
    return {
      ...shared,
      level: 'unavailable',
      label: 'ประเมินไม่ได้',
      summary: 'ข้อมูลแบบจำลองปัจจุบันไม่พร้อมหรือหมดอายุ ระบบระงับการสรุประดับสถานการณ์',
      dataQuality: 'unavailable',
      reviewItems: ['ตรวจสอบสถานะแหล่งข้อมูล', 'ใช้อ้างอิงประกาศทางการและการตรวจสอบภาคสนามแทน'],
    };
  }

  if (stationUsable && input.stationRain24hMm !== null && input.stationRain24hMm >= STATION_MONITOR_THRESHOLD_MM_24H) {
    return {
      ...shared,
      level: 'monitor',
      label: 'ติดตามสัญญาณ',
      summary: 'สถานีอ้างอิงใกล้พื้นที่รายงานฝนสะสมถึงเกณฑ์คัดกรอง ต้องตรวจสอบกับประกาศทางการและข้อมูลภาคสนาม',
      dataQuality: 'ready',
      reviewItems: ['ตรวจสอบเวลาและตัวตนสถานี', 'เทียบประกาศจากหน่วยงานทางการ', 'ให้เจ้าหน้าที่ประเมินก่อนเผยแพร่คำเตือน'],
    };
  }

  if (input.modelPrecipitationMm !== null && input.modelPrecipitationMm >= MODEL_MONITOR_THRESHOLD_MM) {
    return {
      ...shared,
      level: 'monitor',
      label: 'ติดตามสัญญาณแบบจำลอง',
      summary: 'แบบจำลองแสดงฝนในช่วงเวลาอ้างอิงถึงเกณฑ์คัดกรอง แต่ยังไม่ใช่การตรวจพบด้วยเรดาร์หรือสถานีจริง',
      dataQuality: stationUsable ? 'ready' : 'limited',
      reviewItems: ['ตรวจสอบภาพเรดาร์ที่ยังไม่หมดอายุ', 'ยืนยันกับสถานีหรือรายงานภาคสนาม', 'ให้ผู้มีอำนาจอนุมัติก่อนประกาศหรือสั่งการ'],
    };
  }

  if (!stationUsable) {
    return {
      ...shared,
      level: 'limited',
      label: 'ข้อมูลภาคพื้นดินจำกัด',
      summary: 'แบบจำลองยังไม่ถึงเกณฑ์ติดตาม แต่ไม่มีสถานีสดภายในรัศมีอ้างอิง จึงไม่สรุปว่า “ปลอดภัย”',
      dataQuality: 'limited',
      reviewItems: ['ติดตามประกาศทางการ', 'ตรวจสอบรายงานจากหมู่บ้านและเจ้าหน้าที่ภาคสนาม'],
    };
  }

  return {
    ...shared,
    level: 'normal',
    label: 'ไม่พบสัญญาณถึงเกณฑ์คัดกรอง',
    summary: 'ข้อมูลที่ผ่านเกณฑ์ความสดยังไม่พบสัญญาณถึงเกณฑ์ติดตาม ทั้งนี้ไม่ใช่การรับรองความปลอดภัย',
    dataQuality: 'ready',
    reviewItems: ['ติดตามข้อมูลรอบถัดไป', 'อ้างอิงประกาศทางการเมื่อมีเหตุผิดปกติ'],
  };
}
