export type ForecastAgreement = 'high' | 'medium' | 'low' | 'unavailable';

export type ForecastComparisonConfig = {
  highDifferenceMm: number;
  mediumDifferenceMm: number;
};

export type ForecastComparison = {
  primaryRain3h: number | null;
  referenceRain3h: number | null;
  differenceMm: number | null;
  agreement: ForecastAgreement;
};

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
    return { primaryRain3h, referenceRain3h, differenceMm: null, agreement: 'unavailable' };
  }
  const differenceMm = Math.abs(primaryRain3h - referenceRain3h);
  const agreement = differenceMm <= config.highDifferenceMm
    ? 'high'
    : differenceMm <= config.mediumDifferenceMm ? 'medium' : 'low';
  return { primaryRain3h, referenceRain3h, differenceMm, agreement };
}
