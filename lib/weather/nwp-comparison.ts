export type NwpFreshness = 'fresh' | 'stale' | 'expired' | 'unknown';
export type NwpAgreement = 'high' | 'medium' | 'low' | 'unavailable';

export type NwpModelInput = {
  id: 'ecmwf' | 'gfs';
  name: string;
  provider: string;
  resolutionKm: number;
  runAt: string;
  gridLatitude: number | null;
  gridLongitude: number | null;
  times: string[];
  precipitation: Array<number | null>;
};

export type NwpWindow = {
  key: '0-24' | '24-48' | '48-72';
  label: string;
  startAt: string;
  endAt: string;
  totalMm: number | null;
  validHours: number;
};

export type NwpModelSummary = Omit<NwpModelInput, 'times' | 'precipitation'> & {
  freshness: NwpFreshness;
  ageHours: number | null;
  windows: NwpWindow[];
};

export type NwpComparison = {
  generatedAt: string;
  runAt: string | null;
  windowStartAt: string | null;
  windowEndAt: string | null;
  models: NwpModelSummary[];
  hourly: Array<{ time: string; ecmwfMm: number | null; gfsMm: number | null }>;
  consensus: {
    usable: boolean;
    agreement: NwpAgreement;
    label: string;
    summary: string;
    spreadsMm: Array<{ key: NwpWindow['key']; differenceMm: number | null }>;
    officialWarningAllowed: false;
    requiresHumanApproval: true;
  };
};

const WINDOW_DEFINITIONS = [
  { key: '0-24', label: '0–24 ชม.', start: 0, end: 24 },
  { key: '24-48', label: '24–48 ชม.', start: 24, end: 48 },
  { key: '48-72', label: '48–72 ชม.', start: 48, end: 72 },
] as const;

const round1 = (value: number) => Math.round(value * 10) / 10;

function localBangkokTimestamp(value: string) {
  const timestamp = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+07:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function freshness(runAt: string, now: number) {
  const timestamp = Date.parse(runAt);
  if (!Number.isFinite(timestamp)) return { freshness: 'unknown' as const, ageHours: null };
  const ageHours = Math.max(0, Math.floor(((now - timestamp) / 3_600_000) * 10) / 10);
  if (ageHours > 24) return { freshness: 'expired' as const, ageHours };
  if (ageHours > 12) return { freshness: 'stale' as const, ageHours };
  return { freshness: 'fresh' as const, ageHours };
}

function summarizeModel(model: NwpModelInput, startAt: number, now: number): NwpModelSummary {
  const indexed = new Map<number, number | null>();
  model.times.forEach((time, index) => {
    const timestamp = localBangkokTimestamp(time);
    const raw = model.precipitation[index];
    if (timestamp === null) return;
    indexed.set(timestamp, typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null);
  });

  const windows = WINDOW_DEFINITIONS.map((definition) => {
    const values = Array.from({ length: definition.end - definition.start }, (_, index) =>
      indexed.get(startAt + (definition.start + index) * 3_600_000) ?? null,
    );
    const valid = values.filter((value): value is number => value !== null);
    return {
      key: definition.key,
      label: definition.label,
      startAt: new Date(startAt + definition.start * 3_600_000).toISOString(),
      endAt: new Date(startAt + definition.end * 3_600_000).toISOString(),
      totalMm: valid.length === values.length ? round1(valid.reduce((sum, value) => sum + value, 0)) : null,
      validHours: valid.length,
    };
  });

  return { ...model, ...freshness(model.runAt, now), windows };
}

export function buildNwpComparison(inputs: NwpModelInput[], now = Date.now()): NwpComparison {
  const generatedAt = new Date(now).toISOString();
  const startAt = Math.floor(now / 3_600_000) * 3_600_000;
  const models = inputs.map((model) => summarizeModel(model, startAt, now));
  const ecmwf = models.find((model) => model.id === 'ecmwf');
  const gfs = models.find((model) => model.id === 'gfs');
  const sameRun = Boolean(ecmwf && gfs && ecmwf.runAt === gfs.runAt);
  const complete = Boolean(ecmwf && gfs && [...ecmwf.windows, ...gfs.windows].every((window) => window.totalMm !== null));
  const freshEnough = Boolean(ecmwf && gfs && ecmwf.freshness !== 'expired' && gfs.freshness !== 'expired');
  const usable = sameRun && complete && freshEnough;
  const spreadsMm = WINDOW_DEFINITIONS.map((definition, index) => {
    const left = ecmwf?.windows[index]?.totalMm;
    const right = gfs?.windows[index]?.totalMm;
    return {
      key: definition.key,
      differenceMm: left == null || right == null ? null : round1(Math.abs(left - right)),
    };
  });

  let agreement: NwpAgreement = 'unavailable';
  if (usable && ecmwf && gfs) {
    const ratios = WINDOW_DEFINITIONS.map((_, index) => {
      const left = ecmwf.windows[index].totalMm ?? 0;
      const right = gfs.windows[index].totalMm ?? 0;
      return Math.abs(left - right) / Math.max(5, (left + right) / 2);
    });
    const worst = Math.max(...ratios);
    agreement = worst <= 0.35 ? 'high' : worst <= 0.7 ? 'medium' : 'low';
  }

  const labels: Record<NwpAgreement, string> = {
    high: 'สอดคล้องสูง', medium: 'สอดคล้องปานกลาง', low: 'สอดคล้องต่ำ', unavailable: 'เปรียบเทียบไม่ได้',
  };
  const firstLeft = ecmwf?.windows[0]?.totalMm;
  const firstRight = gfs?.windows[0]?.totalMm;
  const summary = usable && firstLeft != null && firstRight != null
    ? `24 ชั่วโมงแรก ECMWF ${firstLeft.toFixed(1)} มม. และ GFS ${firstRight.toFixed(1)} มม. ใช้เป็นแนวโน้มพื้นที่ ไม่ใช่ค่าตรวจวัดรายหมู่บ้าน`
    : 'ข้อมูลสองแบบจำลองไม่ครบ ไม่ใช่รอบเดียวกัน หรือหมดอายุ จึงระงับการสรุปความสอดคล้อง';

  const hourly = Array.from({ length: 72 }, (_, index) => {
    const timestamp = startAt + index * 3_600_000;
    const read = (model: NwpModelInput | undefined) => {
      if (!model) return null;
      const match = model.times.findIndex((time) => localBangkokTimestamp(time) === timestamp);
      const value = match >= 0 ? model.precipitation[match] : null;
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    };
    return { time: new Date(timestamp).toISOString(), ecmwfMm: read(inputs.find((model) => model.id === 'ecmwf')), gfsMm: read(inputs.find((model) => model.id === 'gfs')) };
  });

  return {
    generatedAt,
    runAt: sameRun ? ecmwf?.runAt ?? null : null,
    windowStartAt: new Date(startAt).toISOString(),
    windowEndAt: new Date(startAt + 72 * 3_600_000).toISOString(),
    models,
    hourly,
    consensus: {
      usable,
      agreement,
      label: labels[agreement],
      summary,
      spreadsMm,
      officialWarningAllowed: false,
      requiresHumanApproval: true,
    },
  };
}
