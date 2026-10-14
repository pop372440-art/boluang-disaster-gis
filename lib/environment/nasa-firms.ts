import { distanceKm, type NormalizedHotspot } from './gistda-hotspot.ts';
import { parseSourceTimestamp } from './source-quality.ts';

const splitCsvLine = (line: string) => {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { values.push(value); value = ''; }
    else value += character;
  }
  values.push(value);
  return values;
};

const acquisitionTime = (date: string, time: string) => {
  const normalizedTime = time.padStart(4, '0');
  const candidate = `${date}T${normalizedTime.slice(0, 2)}:${normalizedTime.slice(2)}:00Z`;
  const parsed = parseSourceTimestamp(candidate);
  return parsed == null ? null : new Date(parsed).toISOString();
};

export type NasaFirmsParseResult =
  | { ok: true; hotspots: NormalizedHotspot[]; received: number; observedAt: string | null; satelliteTypes: string[] }
  | { ok: false; reason: 'invalid-schema' };

export function parseNasaFirmsCsv(csv: string, center: { latitude: number; longitude: number }, radiusKm = 50): NasaFirmsParseResult {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { ok: false, reason: 'invalid-schema' };
  const headers = splitCsvLine(lines[0]).map((value) => value.trim().toLowerCase());
  const required = ['latitude', 'longitude', 'acq_date', 'acq_time'];
  if (required.some((key) => !headers.includes(key))) return { ok: false, reason: 'invalid-schema' };
  const records = lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, splitCsvLine(line)[index] ?? ''])));
  const seen = new Set<string>();
  const hotspots = records.flatMap((record) => {
    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const distance = distanceKm(center, { latitude, longitude });
    if (distance > radiusKm) return [];
    const satellite = record.satellite || record.instrument || 'NASA FIRMS VIIRS';
    const acquiredAt = acquisitionTime(record.acq_date, record.acq_time);
    const dedupeKey = [latitude.toFixed(5), longitude.toFixed(5), satellite.toLowerCase(), acquiredAt ?? 'unknown'].join(':');
    if (seen.has(dedupeKey)) return [];
    seen.add(dedupeKey);
    return [{ ...record, latitude, longitude, distanceKm: Number(distance.toFixed(1)), satellite, acquiredAt, dedupeKey }];
  }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 200);
  const observed = hotspots.flatMap((point) => point.acquiredAt ? [Date.parse(point.acquiredAt)] : []).filter(Number.isFinite);
  return {
    ok: true,
    hotspots,
    received: records.length,
    observedAt: observed.length ? new Date(Math.max(...observed)).toISOString() : null,
    satelliteTypes: [...new Set(hotspots.map((point) => point.satellite))],
  };
}
