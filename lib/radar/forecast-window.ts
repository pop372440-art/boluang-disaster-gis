export type ForecastHour = {
  time: Date | null;
  rain: number | null;
  probability: number | null;
};

const bangkokTimestamp = (value: string | undefined) => {
  if (!value) return Number.NaN;
  return Date.parse(`${value}:00+07:00`);
};

export function findForecastStartIndex(times: string[], now: number) {
  const firstFuture = times.findIndex((time) => bangkokTimestamp(time) >= now);
  return firstFuture >= 0 ? firstFuture : Math.max(times.length - 3, 0);
}

export function selectNextForecastHours(
  times: string[],
  precipitation: Array<number | null>,
  probabilities: Array<number | null>,
  now: number,
  count = 3,
): ForecastHour[] {
  const start = findForecastStartIndex(times, now);
  return Array.from({ length: count }, (_, offset) => ({
    time: times[start + offset] ? new Date(`${times[start + offset]}:00+07:00`) : null,
    rain: precipitation[start + offset] ?? null,
    probability: probabilities[start + offset] ?? null,
  }));
}
