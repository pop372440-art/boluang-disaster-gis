export type WeatherFreshnessStatus = 'fresh' | 'stale' | 'expired' | 'unknown';

export type WeatherFreshness = {
  status: WeatherFreshnessStatus;
  ageMinutes: number | null;
  observedAt: string | null;
};

export function degreesToThaiWindDirection(value: unknown): string | null {
  const degrees = Number(value);
  if (!Number.isFinite(degrees) || degrees < 0 || degrees > 360) return null;

  const directions = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
  return directions[Math.round((degrees % 360) / 45) % directions.length];
}

export function evaluateWeatherFreshness(
  observedAt: string | number | Date | null | undefined,
  staleAfterMinutes: number,
  expireAfterMinutes: number,
  now = Date.now()
): WeatherFreshness {
  const timestamp = observedAt instanceof Date
    ? observedAt.getTime()
    : typeof observedAt === 'number'
      ? observedAt
      : typeof observedAt === 'string'
        ? Date.parse(observedAt)
        : NaN;

  if (!Number.isFinite(timestamp) || staleAfterMinutes < 0 || expireAfterMinutes <= staleAfterMinutes) {
    return { status: 'unknown', ageMinutes: null, observedAt: null };
  }

  const ageMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  const status: WeatherFreshnessStatus = ageMinutes > expireAfterMinutes
    ? 'expired'
    : ageMinutes > staleAfterMinutes
      ? 'stale'
      : 'fresh';

  return { status, ageMinutes, observedAt: new Date(timestamp).toISOString() };
}

export function compareRainModels(rainByModel: number[][]) {
  const totals = rainByModel
    .map(values => values.slice(0, 3).reduce((sum, value) => sum + (Number.isFinite(value) && value >= 0 ? value : 0), 0))
    .filter(Number.isFinite);

  if (totals.length < 2) {
    return { modelCount: totals.length, minMm: null, maxMm: null, spreadMm: null, confidence: 'low' as const };
  }

  const minMm = Math.min(...totals);
  const maxMm = Math.max(...totals);
  const spreadMm = maxMm - minMm;
  const confidence = spreadMm <= 2 ? 'high' : spreadMm <= 5 ? 'medium' : 'low';

  return {
    modelCount: totals.length,
    minMm: +minMm.toFixed(1),
    maxMm: +maxMm.toFixed(1),
    spreadMm: +spreadMm.toFixed(1),
    confidence
  };
}
