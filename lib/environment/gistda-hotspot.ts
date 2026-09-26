export type HotspotRecord = Record<string, unknown>;

export type NormalizedHotspot = HotspotRecord & {
  latitude: number;
  longitude: number;
  distanceKm: number;
};

export type HotspotParseResult =
  | { ok: true; hotspots: NormalizedHotspot[]; received: number }
  | { ok: false; reason: 'invalid-schema' };

const coordinatesOf = (item: HotspotRecord) => {
  const latitude = Number(item.latitude ?? item.lat);
  const longitude = Number(item.longitude ?? item.lon ?? item.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

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
      }));
    });
  });
  const records = directRecords ?? satelliteRecords;
  const recognized = directRecords !== null || Object.values(payload).some((frames) => Array.isArray(frames) && frames.some((frame) => frame && typeof frame === 'object' && 'data' in frame && Array.isArray(frame.data)));
  if (!recognized) return { ok: false, reason: 'invalid-schema' };

  const hotspots = records.flatMap((item) => {
    const point = coordinatesOf(item);
    if (!point) return [];
    const distance = distanceKm(center, point);
    return distance <= radiusKm
      ? [{ ...item, latitude: point.latitude, longitude: point.longitude, distanceKm: Number(distance.toFixed(1)) }]
      : [];
  }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 200);

  return { ok: true, hotspots, received: records.length };
};
