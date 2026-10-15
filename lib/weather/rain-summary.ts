export interface RainHour {
  time?: string;
  rain: number | null;
  prob: number | null;
}

// A planning summary of the model envelope, never an arrival-time prediction.
export function summarizeRain(hours: readonly RainHour[]) {
  const horizon = hours.slice(0, 24);
  const valid = (row: RainHour) => typeof row.rain === 'number'
    && Number.isFinite(row.rain) && row.rain >= 0
    && typeof row.time === 'string' && Number.isFinite(Date.parse(row.time));
  if (horizon.length !== 24 || horizon.some(row => !valid(row))) return null;
  if (horizon.some((row, index) => index > 0
    && Date.parse(row.time!) - Date.parse(horizon[index - 1].time!) !== 3_600_000)) return null;

  let peakIndex = 0;
  let peakMm = -1;
  for (let index = 0; index <= horizon.length - 3; index++) {
    const total = horizon.slice(index, index + 3).reduce((sum, row) => sum + row.rain!, 0);
    if (total > peakMm) { peakMm = total; peakIndex = index; }
  }
  const peak = horizon.slice(peakIndex, peakIndex + 3);
  const probabilities = peak.map(row => row.prob)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
  return {
    totalMm: horizon.reduce((sum, row) => sum + row.rain!, 0),
    peakMm,
    start: peak[0].time!,
    end: new Date(Date.parse(peak[2].time!) + 3_600_000).toISOString(),
    maxProbability: probabilities.length === 3 ? Math.max(...probabilities) : null,
  };
}

export function formatRainTime(iso: string) {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  }).format(new Date(iso));
}
