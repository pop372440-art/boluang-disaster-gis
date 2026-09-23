export type LongRangeSignal = 'low' | 'monitor' | 'prepare' | 'unavailable';
export type LongRangeConfidence = 'low' | 'very-low';

export type LongRangeOutlookConfig = {
  startLeadDay: number;
  endLeadDay: number;
  monitorRainMm: number;
  prepareRainMm: number;
  monitorProbabilityPct: number;
  prepareProbabilityPct: number;
  agreementMm: number;
};

export type LongRangeOutlookDay = {
  date: string;
  leadDay: number;
  consensusRainMm: number | null;
  upperScenarioRainMm: number | null;
  modelSpreadMm: number | null;
  precipitationProbabilityPct: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  windGustMaxKmh: number | null;
  signal: LongRangeSignal;
  confidence: LongRangeConfidence;
  confidenceScore: number;
  reasons: string[];
};

export type DailyOutlookInput = {
  date: string;
  primaryRainMm: number | null;
  referenceRainMm: number | null;
  precipitationProbabilityPct: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  windGustMaxKmh: number | null;
};

const valid = (value: number | null) => value != null && Number.isFinite(value) && value >= 0;
const finite = (value: number | null) => value != null && Number.isFinite(value);
const round = (value: number) => Math.round(value * 10) / 10;

export function daysBetweenBangkokDates(baseDate: string, date: string) {
  const base = Date.parse(`${baseDate}T00:00:00+07:00`);
  const target = Date.parse(`${date}T00:00:00+07:00`);
  return Number.isFinite(base) && Number.isFinite(target)
    ? Math.round((target - base) / 86_400_000)
    : Number.NaN;
}

export function buildLongRangeOutlook(
  baseDate: string,
  inputs: DailyOutlookInput[],
  config: LongRangeOutlookConfig,
): LongRangeOutlookDay[] {
  return inputs.flatMap((input) => {
    const leadDay = daysBetweenBangkokDates(baseDate, input.date);
    if (!Number.isFinite(leadDay) || leadDay < config.startLeadDay || leadDay > config.endLeadDay) return [];
    const rainValues = [input.primaryRainMm, input.referenceRainMm].filter(valid) as number[];
    const consensusRainMm = rainValues.length ? round(rainValues.reduce((sum, value) => sum + value, 0) / rainValues.length) : null;
    const upperScenarioRainMm = rainValues.length ? round(Math.max(...rainValues)) : null;
    const modelSpreadMm = rainValues.length === 2 ? round(Math.abs(rainValues[0] - rainValues[1])) : null;
    const probability = valid(input.precipitationProbabilityPct) && input.precipitationProbabilityPct! <= 100
      ? input.precipitationProbabilityPct : null;
    const reasons = [`ระยะพยากรณ์ D+${leadDay} มีความไม่แน่นอนสูง`];
    if (rainValues.length < 2) reasons.push('มีแบบจำลองที่ใช้งานได้เพียงแหล่งเดียว');
    if (modelSpreadMm != null) reasons.push(`แบบจำลองต่างกัน ${modelSpreadMm.toFixed(1)} มม./วัน`);
    if (modelSpreadMm != null && modelSpreadMm > config.agreementMm) reasons.push('แบบจำลองยังไม่สอดคล้องกัน');

    let confidenceScore = 0.45 - Math.max(leadDay - config.startLeadDay, 0) * 0.05;
    if (rainValues.length < 2) confidenceScore -= 0.2;
    if (modelSpreadMm != null && modelSpreadMm > config.agreementMm) confidenceScore -= 0.15;
    confidenceScore = Math.max(0.1, Math.min(0.55, confidenceScore));

    let signal: LongRangeSignal = 'low';
    if (upperScenarioRainMm == null) signal = 'unavailable';
    else if (
      consensusRainMm != null && consensusRainMm >= config.prepareRainMm &&
      probability != null && probability >= config.prepareProbabilityPct
    ) signal = 'prepare';
    else if (
      upperScenarioRainMm >= config.monitorRainMm ||
      (probability != null && probability >= config.monitorProbabilityPct)
    ) signal = 'monitor';

    reasons.push('เป็น planning outlook ไม่ใช่คำเตือนภัยหรือคำสั่งอพยพ');
    return [{
      date: input.date,
      leadDay,
      consensusRainMm,
      upperScenarioRainMm,
      modelSpreadMm,
      precipitationProbabilityPct: probability,
      temperatureMinC: finite(input.temperatureMinC) ? input.temperatureMinC : null,
      temperatureMaxC: finite(input.temperatureMaxC) ? input.temperatureMaxC : null,
      windGustMaxKmh: valid(input.windGustMaxKmh) ? input.windGustMaxKmh : null,
      signal,
      confidence: confidenceScore >= 0.4 ? 'low' : 'very-low',
      confidenceScore: round(confidenceScore),
      reasons,
    }];
  });
}
