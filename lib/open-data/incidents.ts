import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const OPEN_DATA_INCIDENT_VERSION = 'incidents-public-v1.0';
export const OPEN_DATA_INCIDENT_SELECT = [
  'created_at',
  'risk_type',
  'severity_level',
  'village_name',
  'status',
].join(',');

export type PublicIncidentRecord = {
  reportDate: string;
  riskType: string;
  severityLevel: number | null;
  villageName: string;
  status: string;
};

type IncidentRow = {
  created_at: unknown;
  risk_type: unknown;
  severity_level: unknown;
  village_name: unknown;
  status: unknown;
};

const bangkokDate = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Bangkok',
});

function textOrFallback(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function toPublicIncidentRecord(row: IncidentRow): PublicIncidentRecord | null {
  if (typeof row.created_at !== 'string' || Number.isNaN(Date.parse(row.created_at))) return null;
  const severity = row.severity_level === null || row.severity_level === undefined || row.severity_level === ''
    ? Number.NaN
    : Number(row.severity_level);

  return {
    reportDate: bangkokDate.format(new Date(row.created_at)),
    riskType: textOrFallback(row.risk_type, 'ไม่ระบุประเภท'),
    severityLevel: Number.isFinite(severity) ? severity : null,
    villageName: textOrFallback(row.village_name, 'ไม่ระบุหมู่บ้าน'),
    status: textOrFallback(row.status, 'รับเรื่องแล้ว'),
  };
}

function protectSpreadsheetFormula(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: string | number | null) {
  const safe = protectSpreadsheetFormula(value === null ? '' : String(value));
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildIncidentCsv(records: PublicIncidentRecord[]) {
  const header = ['วันที่รับแจ้ง', 'ประเภทเหตุ', 'ระดับความรุนแรง', 'หมู่บ้าน', 'สถานะ'];
  const rows = records.map(record => [
    record.reportDate,
    record.riskType,
    record.severityLevel,
    record.villageName,
    record.status,
  ].map(csvCell).join(','));
  return `\uFEFF${[header.map(csvCell).join(','), ...rows].join('\r\n')}\r\n`;
}

export function openDataServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function fetchPublicIncidents(client: SupabaseClient, maximum = 10_000) {
  const pageSize = 1000;
  const records: PublicIncidentRecord[] = [];
  let offset = 0;

  while (offset < maximum) {
    const { data, error } = await client
      .from('boluang_disaster_reports')
      .select(OPEN_DATA_INCIDENT_SELECT)
      .order('created_at', { ascending: false })
      .range(offset, Math.min(offset + pageSize - 1, maximum - 1));
    if (error) throw error;

    const batch = ((data ?? []) as unknown as IncidentRow[])
      .map(toPublicIncidentRecord)
      .filter((record): record is PublicIncidentRecord => record !== null);
    records.push(...batch);

    if ((data ?? []).length < pageSize) return { records, truncated: false };
    offset += pageSize;
  }

  return { records, truncated: true };
}
