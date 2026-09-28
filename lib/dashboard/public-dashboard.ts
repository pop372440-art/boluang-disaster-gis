export const PUBLIC_DASHBOARD_SELECT = [
  'risk_type',
  'severity_level',
  'village_name',
  'status',
  'created_at',
].join(',');

export type PublicIncident = {
  riskType: string;
  severityLevel: number | null;
  villageName: string;
  status: string;
  createdAt: string;
};

export type DashboardFilters = {
  dateFrom: string;
  dateTo: string;
  village: string;
  riskType: string;
  status: string;
};

export type DashboardRow = {
  risk_type: unknown;
  severity_level: unknown;
  village_name: unknown;
  status: unknown;
  created_at: unknown;
};

const RESOLVED_STATUS_MARKERS = ['ดำเนินการเสร็จแล้ว', 'ปิดจ๊อบ', 'เสร็จสิ้น', 'ปิดเรื่อง'];

function textOrFallback(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function toPublicIncident(row: DashboardRow): PublicIncident | null {
  if (typeof row.created_at !== 'string' || Number.isNaN(Date.parse(row.created_at))) return null;

  const severity = row.severity_level === null || row.severity_level === undefined || row.severity_level === ''
    ? Number.NaN
    : Number(row.severity_level);

  return {
    riskType: textOrFallback(row.risk_type, 'ไม่ระบุประเภท'),
    severityLevel: Number.isFinite(severity) ? severity : null,
    villageName: textOrFallback(row.village_name, 'ไม่ระบุหมู่บ้าน'),
    status: textOrFallback(row.status, 'รับเรื่องแล้ว'),
    createdAt: row.created_at,
  };
}

export function isResolvedStatus(status: string) {
  return RESOLVED_STATUS_MARKERS.some(marker => status.includes(marker));
}

export function filterIncidents(incidents: PublicIncident[], filters: DashboardFilters) {
  const start = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00+07:00`).getTime() : null;
  const end = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999+07:00`).getTime() : null;

  return incidents.filter((incident) => {
    const createdAt = Date.parse(incident.createdAt);
    return (start === null || createdAt >= start)
      && (end === null || createdAt <= end)
      && (!filters.village || incident.villageName === filters.village)
      && (!filters.riskType || incident.riskType === filters.riskType)
      && (!filters.status || incident.status === filters.status);
  });
}

export function countBy(items: PublicIncident[], field: 'riskType' | 'villageName') {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item[field], (counts.get(item[field]) ?? 0) + 1);
  return Array.from(counts, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'th'));
}
