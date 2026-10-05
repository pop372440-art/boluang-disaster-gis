import { screenEnvironmentalEvidence, type EnvironmentalEvidence } from './alert-screening.ts';

export type HistoricalEnvironmentalRow = EnvironmentalEvidence & {
  observedAt: string;
  actualEvent: boolean;
};

export function backtestEnvironmentalRows(rows: HistoricalEnvironmentalRow[], from: string, to: string) {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) throw new Error('ช่วงเวลาทดสอบไม่ถูกต้อง');
  const selected = rows.filter(row => {
    const at = Date.parse(row.observedAt);
    return Number.isFinite(at) && at >= fromMs && at <= toMs;
  });
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  for (const row of selected) {
    const predicted = screenEnvironmentalEvidence(row).eligible;
    if (predicted && row.actualEvent) truePositive += 1;
    else if (predicted) falsePositive += 1;
    else if (row.actualEvent) falseNegative += 1;
    else trueNegative += 1;
  }
  const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : null;
  const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : null;
  return { count: selected.length, truePositive, falsePositive, falseNegative, trueNegative, precision, recall };
}
