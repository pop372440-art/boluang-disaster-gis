import type { DataFreshness } from './types.ts';

type FreshnessOptions = {
  staleAfterMinutes: number;
  expireAfterMinutes: number;
  now?: Date | number;
};

const toMillis = (value: Date | string | number | null | undefined): number | null => {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function evaluateFreshness(
  observedAt: Date | string | number | null | undefined,
  options: FreshnessOptions,
): DataFreshness {
  const checkedAtMs = toMillis(options.now ?? Date.now()) ?? Date.now();
  const observedAtMs = toMillis(observedAt);
  const base = {
    observedAt: observedAtMs == null ? null : new Date(observedAtMs).toISOString(),
    checkedAt: new Date(checkedAtMs).toISOString(),
    staleAfterMinutes: options.staleAfterMinutes,
    expireAfterMinutes: options.expireAfterMinutes,
  };

  if (observedAtMs == null) {
    return { ...base, status: 'unknown', ageMinutes: null };
  }

  const ageMinutes = Math.max(0, (checkedAtMs - observedAtMs) / 60_000);
  if (ageMinutes > options.expireAfterMinutes) return { ...base, status: 'expired', ageMinutes };
  if (ageMinutes > options.staleAfterMinutes) return { ...base, status: 'stale', ageMinutes };
  return { ...base, status: 'fresh', ageMinutes };
}

export const canUseForAlert = (freshness: DataFreshness) => freshness.status === 'fresh';
