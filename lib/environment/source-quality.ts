export type SourceQualityState = 'fresh' | 'stale' | 'expired' | 'invalid_schema' | 'unknown';

export type SourceQuality = {
  state: SourceQualityState;
  observedAt: string | null;
  checkedAt: string;
  ageMinutes: number | null;
  staleAfterMinutes: number;
  expireAfterMinutes: number;
};

export function assessSourceQuality(
  observedAt: string | null | undefined,
  options: { staleAfterMinutes: number; expireAfterMinutes: number; now?: number; invalidSchema?: boolean },
): SourceQuality {
  const checkedAtMs = options.now ?? Date.now();
  const checkedAt = new Date(checkedAtMs).toISOString();
  if (options.invalidSchema) return {
    state: 'invalid_schema', observedAt: null, checkedAt, ageMinutes: null,
    staleAfterMinutes: options.staleAfterMinutes, expireAfterMinutes: options.expireAfterMinutes,
  };
  const observedAtMs = observedAt ? Date.parse(observedAt) : Number.NaN;
  if (!Number.isFinite(observedAtMs)) return {
    state: 'unknown', observedAt: null, checkedAt, ageMinutes: null,
    staleAfterMinutes: options.staleAfterMinutes, expireAfterMinutes: options.expireAfterMinutes,
  };
  const ageMinutes = Math.max(0, (checkedAtMs - observedAtMs) / 60_000);
  return {
    state: ageMinutes > options.expireAfterMinutes ? 'expired' : ageMinutes > options.staleAfterMinutes ? 'stale' : 'fresh',
    observedAt: new Date(observedAtMs).toISOString(), checkedAt, ageMinutes,
    staleAfterMinutes: options.staleAfterMinutes, expireAfterMinutes: options.expireAfterMinutes,
  };
}

export function latestObservedAt(values: Array<string | null | undefined>) {
  const valid = values.flatMap((value) => {
    if (!value) return [];
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? [parsed] : [];
  });
  return valid.length ? new Date(Math.max(...valid)).toISOString() : null;
}
