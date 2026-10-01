const TOKEN_PREFIX = 'BL_';
const TOKEN_BYTES = 24;

export const REPORT_STATUS_SELECT = 'tracking_code,risk_type,severity_level,village_name,status,created_at,image_url,resolved_image_url,resolved_at' as const;

export type ReportStatusRow = {
  tracking_code: string;
  risk_type: string | null;
  severity_level: number | null;
  village_name: string | null;
  status: string | null;
  created_at: string | null;
  image_url: string | null;
  resolved_image_url: string | null;
  resolved_at: string | null;
};

export type PublicReportStatus = {
  reference: string;
  riskType: string;
  severityLevel: number | null;
  villageName: string;
  status: string;
  createdAt: string | null;
  resolvedAt: string | null;
  publicUpdate: string;
  beforeImageUrl: string | null;
  afterImageUrl: string | null;
  imageExpiresAt: string | null;
};

export function generateTrackingToken(randomValues?: Uint8Array): string {
  const bytes = randomValues ?? crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  if (bytes.byteLength < 16) throw new Error('Tracking tokens require at least 128 bits of entropy');
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${TOKEN_PREFIX}${encoded}`;
}

export function normalizeTrackingToken(input: unknown): string {
  if (typeof input !== 'string') return '';
  const cleaned = input.trim().replace(/[\u200B-\u200D\uFEFF\s]/g, '');
  if (!cleaned) return '';

  // Accept a copied QR destination as well as the raw token. Fragments stay out of access logs.
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const url = new URL(cleaned);
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
      return (fragment.get('token') || url.searchParams.get('token') || url.searchParams.get('code') || '').trim();
    } catch {
      return '';
    }
  }

  return cleaned;
}

export function isOpaqueTrackingToken(token: string): boolean {
  return /^BL_[A-Za-z0-9_-]{22,86}$/.test(token);
}

export function isLegacyTrackingCode(token: string): boolean {
  return /^BL-\d{6}$/.test(token);
}

export function maskTrackingToken(token: string): string {
  if (token.length < 12) return '••••••';
  return `${token.slice(0, 5)}••••••••${token.slice(-6)}`;
}

export function storageObjectPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.includes('://')) return value.replace(/^\/+/, '').replace(/^disaster_images\//, '');
  try {
    const url = new URL(value);
    const publicMarker = '/storage/v1/object/public/disaster_images/';
    const signedMarker = '/storage/v1/object/sign/disaster_images/';
    const publicIndex = url.pathname.indexOf(publicMarker);
    const signedIndex = url.pathname.indexOf(signedMarker);
    const path = publicIndex >= 0
      ? url.pathname.slice(publicIndex + publicMarker.length)
      : signedIndex >= 0 ? url.pathname.slice(signedIndex + signedMarker.length) : '';
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

export function toPublicReportStatus(
  row: ReportStatusRow,
  signed: { before: string | null; after: string | null; expiresAt: string | null },
): PublicReportStatus {
  const status = row.status || 'รับเรื่องแล้ว';
  const publicUpdate = status === 'ดำเนินการเสร็จแล้ว'
    ? 'เทศบาลดำเนินการและปิดคำร้องแล้ว หากยังพบปัญหา โปรดแจ้งเหตุใหม่พร้อมข้อมูลล่าสุด'
    : status === 'กำลังดำเนินการ'
      ? 'เจ้าหน้าที่กำลังตรวจสอบและดำเนินการตามลำดับความเร่งด่วน'
      : 'ระบบรับคำร้องแล้วและอยู่ระหว่างส่งต่อให้เจ้าหน้าที่ตรวจสอบ';

  return {
    reference: maskTrackingToken(row.tracking_code),
    riskType: row.risk_type || 'ไม่ระบุประเภทภัย',
    severityLevel: Number.isFinite(Number(row.severity_level)) ? Number(row.severity_level) : null,
    villageName: row.village_name || 'พื้นที่ตำบลบ่อหลวง',
    status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    publicUpdate,
    beforeImageUrl: signed.before,
    afterImageUrl: signed.after,
    imageExpiresAt: signed.expiresAt,
  };
}
