import { parseSourceTimestamp } from './source-quality.ts';

export type HotspotRecord = Record<string, unknown>;

export type NormalizedHotspot = HotspotRecord & {
  latitude: number;
  longitude: number;
  distanceKm: number;
  satellite: string;
  acquiredAt: string | null;
  dedupeKey: string;
};

export type HotspotParseResult =
  | { ok: true; hotspots: NormalizedHotspot[]; received: number; observedAt: string | null; satelliteTypes: string[] }
  | { ok: false; reason: 'invalid-schema' };

const coordinatesOf = (item: HotspotRecord) => {
  const latitude = Number(item.latitude ?? item.lat);
  const longitude = Number(item.longitude ?? item.lon ?? item.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

const stringValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

const acquiredAtOf = (item: HotspotRecord) => {
  const direct = stringValue(item.acquiredAt ?? item.acquired_at ?? item.acquisition_time ?? item.datetime ?? item.date_time);
  const date = stringValue(item.acquiredDate ?? item.acq_date ?? item.date);
  const time = stringValue(item.acquiredTime ?? item.acq_time ?? item.time);
  const candidate = direct ?? (date && time ? `${date}T${time}` : date);
  if (!candidate) return null;
  const parsed = parseSourceTimestamp(candidate);
  return parsed == null ? null : new Date(parsed).toISOString();
};

const satelliteOf = (item: HotspotRecord) =>
  stringValue(item.satellite ?? item.satellite_name ?? item.platform ?? item.source) ?? 'ไม่ระบุ';

export const distanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

export const parseGistdaHotspots = (
  payload: unknown,
  center: { latitude: number; longitude: number },
  radiusKm = 50,
): HotspotParseResult => {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'invalid-schema' };
  }

  const directRecords = 'data' in payload && Array.isArray(payload.data) ? payload.data as HotspotRecord[] : null;
  const satelliteRecords = Object.entries(payload).flatMap(([satellite, frames]) => {
    if (!Array.isArray(frames)) return [];
    return frames.flatMap((frame) => {
      if (!frame || typeof frame !== 'object' || !('data' in frame) || !Array.isArray(frame.data)) return [];
      return (frame.data as HotspotRecord[]).map((item) => ({
        ...item,
        satellite,
        acquiredDate: 'date' in frame ? frame.date : undefined,
        acquiredTime: 'time' in frame ? frame.time : undefined,
      }));
    });
  });
  const records = directRecords ?? satelliteRecords;
  const recognized = directRecords !== null || Object.values(payload).some((frames) => Array.isArray(frames) && frames.some((frame) => frame && typeof frame === 'object' && 'data' in frame && Array.isArray(frame.data)));
  if (!recognized) return { ok: false, reason: 'invalid-schema' };

  const seen = new Set<string>();
  const hotspots = records.flatMap((item) => {
    const point = coordinatesOf(item);
    if (!point) return [];
    const distance = distanceKm(center, point);
    if (distance > radiusKm) return [];
    const satellite = satelliteOf(item);
    const acquiredAt = acquiredAtOf(item);
    const dedupeKey = [point.latitude.toFixed(5), point.longitude.toFixed(5), satellite.toLowerCase(), acquiredAt ?? 'unknown'].join(':');
    if (seen.has(dedupeKey)) return [];
    seen.add(dedupeKey);
    return [{
      ...item,
      latitude: point.latitude,
      longitude: point.longitude,
      distanceKm: Number(distance.toFixed(1)),
      satellite,
      acquiredAt,
      dedupeKey,
    }];
  }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 200);

  const frameTimes = Object.entries(payload).flatMap(([satellite, frames]) => {
    if (!Array.isArray(frames)) return [];
    return frames.flatMap((frame) => {
      if (!frame || typeof frame !== 'object') return [];
      const date = 'date' in frame ? stringValue(frame.date) : null;
      const time = 'time' in frame ? stringValue(frame.time) : null;
      const parsed = parseSourceTimestamp(date && time ? `${date}T${time}` : date);
      return parsed != null ? [{ at: parsed, satellite }] : [];
    });
  });
  const itemTimes = hotspots.flatMap((item) => item.acquiredAt ? [Date.parse(item.acquiredAt)] : []).filter(Number.isFinite);
  const observedAtMs = [...frameTimes.map((item) => item.at), ...itemTimes];
  const satelliteTypes = [...new Set([
    ...hotspots.map((item) => item.satellite),
    ...frameTimes.map((item) => item.satellite),
  ].filter((value) => value && value !== 'ไม่ระบุ'))];

  return {
    ok: true,
    hotspots,
    received: records.length,
    observedAt: observedAtMs.length ? new Date(Math.max(...observedAtMs)).toISOString() : null,
    satelliteTypes,
  };
};
