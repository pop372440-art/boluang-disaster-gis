export type ForecastAgreement = 'high' | 'medium' | 'low' | 'unavailable';

export type ForecastComparisonConfig = {
  highDifferenceMm: number;
  mediumDifferenceMm: number;
  highRelativeDifference?: number;
  mediumRelativeDifference?: number;
};

export type ForecastComparison = {
  primaryRain3h: number | null;
  referenceRain3h: number | null;
  differenceMm: number | null;
  relativeDifference: number | null;
  agreement: ForecastAgreement;
};

// An agreement label is meaningful only while both model runs are current.
export function compareFreshRainForecasts(
  primaryRain3h: number | null,
  referenceRain3h: number | null,
  primaryFresh: boolean,
  referenceFresh: boolean,
  config: ForecastComparisonConfig,
): ForecastComparison {
  return compareRainForecasts(
    primaryFresh ? primaryRain3h : null,
    referenceFresh ? referenceRain3h : null,
    config,
  );
}

export function compareRainForecasts(
  primaryRain3h: number | null,
  referenceRain3h: number | null,
  config: ForecastComparisonConfig,
): ForecastComparison {
  if (
    primaryRain3h == null || referenceRain3h == null ||
    !Number.isFinite(primaryRain3h) || !Number.isFinite(referenceRain3h) ||
    primaryRain3h < 0 || referenceRain3h < 0
  ) {
    return { primaryRain3h, referenceRain3h, differenceMm: null, relativeDifference: null, agreement: 'unavailable' };
  }
  const differenceMm = Math.abs(primaryRain3h - referenceRain3h);
  const relativeDifference = differenceMm / Math.max(primaryRain3h, referenceRain3h, 1);
  const high = differenceMm <= config.highDifferenceMm &&
    relativeDifference <= (config.highRelativeDifference ?? Number.POSITIVE_INFINITY);
  const medium = differenceMm <= config.mediumDifferenceMm &&
    relativeDifference <= (config.mediumRelativeDifference ?? Number.POSITIVE_INFINITY);
  const agreement = high
    ? 'high'
    : medium ? 'medium' : 'low';
  return { primaryRain3h, referenceRain3h, differenceMm, relativeDifference, agreement };
}
