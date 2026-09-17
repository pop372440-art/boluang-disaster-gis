export type AggregationMethod = 'mean' | 'max' | 'p90';

export type AggregatedMetric = {
  mean: number | null;
  max: number | null;
  p90: number | null;
  selected: number | null;
  method: AggregationMethod;
  validSamples: number;
  totalSamples: number;
  coverage: number;
};

export function percentile(values: number[], probability: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(probability * sorted.length) - 1);
  return sorted[index];
}

export function aggregatePolygonValues(
  values: Array<number | null | undefined>,
  method: AggregationMethod,
  minimumCoverage = 0.6,
): AggregatedMetric {
  const valid = values.filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0,
  );
  const coverage = values.length ? valid.length / values.length : 0;
  const mean = valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  const max = valid.length ? Math.max(...valid) : null;
  const p90 = percentile(valid, 0.9);
  const selectedValue = { mean, max, p90 }[method];
  return {
    mean,
    max,
    p90,
    selected: coverage >= minimumCoverage ? selectedValue : null,
    method,
    validSamples: valid.length,
    totalSamples: values.length,
    coverage,
  };
}
