import { validateAndNormalizeVillageGeoJson, type GeoJsonFeature, type PolygonGeometry, type Position } from '../radar/geojson-validation.ts';
import { generateRepresentativeSamplePoints } from '../radar/village-sampling.ts';

export interface AreaContext { id: string; name: string; lat: number; lng: number }
export interface VillageContext extends AreaContext { feature: GeoJsonFeature }
export const BO_LUANG_CONTEXT: AreaContext = { id: 'bo-luang', name: 'ตำบลบ่อหลวง', lat: 18.1633, lng: 98.3744 };

function inRing([x, y]: Position, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function containsPoint(point: Position, geometry: PolygonGeometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates as Position[][]] : geometry.coordinates as Position[][][];
  return polygons.some(rings => inRing(point, rings[0]) && !rings.slice(1).some(hole => inRing(point, hole)));
}

export function villageContexts(payload: unknown): VillageContext[] {
  return validateAndNormalizeVillageGeoJson(payload).features.map(feature => {
    const point = generateRepresentativeSamplePoints(feature.geometry, { minPoints: 3, maxPoints: 12 }).find(p => containsPoint(p, feature.geometry));
    if (!point) throw new Error('ไม่พบจุดตัวแทนภายใน polygon หมู่บ้าน');
    return { id: String(feature.properties.village_id), name: String(feature.properties.name_th), lng: point[0], lat: point[1], feature };
  }).sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)));
}

export function areaHref(path: string, context: AreaContext) {
  return `${path}?${new URLSearchParams({ lat: String(context.lat), lng: String(context.lng), area: context.id, name: context.name })}`;
}
export function parseAreaSearch(search: string): AreaContext | null {
  const query = new URLSearchParams(search);
  if (!query.get('lat')?.trim() || !query.get('lng')?.trim()) return null;
  const lat = Number(query.get('lat')), lng = Number(query.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const rawId = query.get('area') ?? 'point';
  return { lat, lng, id: /^(?:moo-\d{1,2}|bo-luang)$/.test(rawId) ? rawId : 'point', name: (query.get('name') || 'พิกัดที่เลือก').slice(0, 100) };
}
