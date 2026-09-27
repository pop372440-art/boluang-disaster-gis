export const INCIDENT_RISK_TYPES = [
  'ไฟป่า / หมอกควัน (PM 2.5)',
  'น้ำป่าไหลหลาก / น้ำท่วม',
  'ดินโคลนถล่ม / ดินสไลด์',
  'ต้นไม้ล้มขวางทาง',
  'การลักลอบทิ้งขยะ / ขยะมูลฝอยตกค้าง',
  'มลพิษทางน้ำ / น้ำเสีย',
  'การบุกรุกทำลายป่า / ลักลอบตัดไม้',
  'อัคคีภัย / วาตภัย',
  'เหตุด่วน / เหตุร้าย',
  'อื่นๆ'
] as const;

export type IncidentRiskType = (typeof INCIDENT_RISK_TYPES)[number];

export type IncidentAiResult = {
  type: IncidentRiskType;
  severity: number;
  description: string;
};

export function parseIncidentAiResult(value: unknown): IncidentAiResult | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Record<string, unknown>;
  const type = candidate.type;
  const severity = Number(candidate.severity);
  const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';

  if (typeof type !== 'string' || !INCIDENT_RISK_TYPES.includes(type as IncidentRiskType)) return null;
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) return null;
  if (description.length < 5 || description.length > 500) return null;

  return { type: type as IncidentRiskType, severity, description };
}

export function getIncidentAiPublicError(status: number) {
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      message: 'AI มีผู้ใช้งานจำนวนมาก กรุณารอสักครู่แล้วลองวิเคราะห์อีกครั้ง'
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: 'PROVIDER_AUTH_ERROR',
      message: 'ระบบ AI ยังไม่พร้อมใช้งาน กรุณาระบุข้อมูลด้วยตนเองและแจ้งผู้ดูแลระบบ'
    };
  }

  if (status >= 500) {
    return {
      code: 'PROVIDER_UNAVAILABLE',
      message: 'ผู้ให้บริการ AI ขัดข้องชั่วคราว กรุณาลองใหม่หรือระบุข้อมูลด้วยตนเอง'
    };
  }

  return {
    code: 'MODEL_REQUEST_REJECTED',
    message: 'AI ไม่สามารถประมวลผลภาพนี้ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP ที่เห็นเหตุการณ์ชัดเจน'
  };
}
