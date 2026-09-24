import type { GeoJsonFeature, Position } from './geojson-validation.ts';

type VillageSummaryRow = {
  featureIndex: number;
  rain3h: number | null;
  riskIndex: number | null;
  level: { color: string; name: string; act: string };
  name: string;
};

const EARTH_RADIUS_KM = 6371.0088;

function ringAreaKm2(ring: Position[]) {
  if (ring.length < 4) return 0;
  const referenceLatitude = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  const cosine = Math.cos(referenceLatitude * Math.PI / 180);
  const projected = ring.map(([longitude, latitude]) => [
    EARTH_RADIUS_KM * longitude * Math.PI / 180 * cosine,
    EARTH_RADIUS_KM * latitude * Math.PI / 180,
  ]);
  let twiceArea = 0;
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index];
    const next = projected[(index + 1) % projected.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(twiceArea) / 2;
}

export function polygonAreaKm2(feature: GeoJsonFeature) {
  const geometry = feature.geometry;
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates as Position[][]]
    : geometry.coordinates as Position[][][];
  return polygons.reduce((total, polygon) => {
    const exterior = ringAreaKm2(polygon[0] ?? []);
    const holes = polygon.slice(1).reduce((sum, ring) => sum + ringAreaKm2(ring), 0);
    return total + Math.max(0, exterior - holes);
  }, 0);
}

export function summarizeTambonRisk(rows: VillageSummaryRow[], features: GeoJsonFeature[]) {
  const usable = rows.filter((row) => row.rain3h != null && row.riskIndex != null);
  if (!usable.length) return null;
  const withArea = usable.map((row) => ({
    row,
    areaKm2: polygonAreaKm2(features[row.featureIndex]),
  })).filter((entry) => entry.areaKm2 > 0);
  if (!withArea.length) return null;
  const totalAreaKm2 = withArea.reduce((sum, entry) => sum + entry.areaKm2, 0);
  const rainyAreaKm2 = withArea
    .filter((entry) => (entry.row.rain3h ?? 0) > 1)
    .reduce((sum, entry) => sum + entry.areaKm2, 0);
  const areaWeightedRainMm = withArea.reduce(
    (sum, entry) => sum + (entry.row.rain3h ?? 0) * entry.areaKm2,
    0,
  ) / totalAreaKm2;
  const peak = Math.max(...usable.map((row) => row.rain3h as number));
  return {
    areaWeightedRainMm,
    peak,
    rainyAreaKm2,
    totalAreaKm2,
    rainyAreaPct: Math.round((rainyAreaKm2 / totalAreaKm2) * 100),
    affectedVillageCount: usable.filter((row) => (row.rain3h ?? 0) > 1).length,
    usableVillageCount: usable.length,
    worst: { ...usable[0], rain3h: usable[0].rain3h as number, riskIndex: usable[0].riskIndex as number },
    level: usable[0].level,
  };
}
