export type Position = [number, number];
export type PolygonGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown;
};

export type GeoJsonFeature = {
  type: 'Feature';
  geometry: PolygonGeometry;
  properties: Record<string, unknown>;
};

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
};

const VILLAGE_NUMBER_BY_NAME: Record<string, number> = {
  บ้านบ่อหลวง: 1,
  บ้านวังกอง: 2,
  บ้านขุน: 3,
  บ้านนาฟ่อน: 4,
  บ้านแม่ลายเหนือ: 5,
  บ้านแม่ลายใต้: 6,
  บ้านพุย: 7,
  บ้านกิ่วลม: 8,
  บ้านแม่สะนาม: 9,
  บ้านเตียนอาง: 10,
  บ้านบ่อสะแง๋: 11,
  บ้านบ่อพะแวน: 12,
  บ้านแม่หืด: 13,
};

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number' &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]) &&
  value[0] >= -180 && value[0] <= 180 &&
  value[1] >= -90 && value[1] <= 90;

const validateRing = (value: unknown) =>
  Array.isArray(value) && value.length >= 4 && value.every(isPosition);

const validateGeometry = (value: unknown): value is PolygonGeometry => {
  if (!value || typeof value !== 'object') return false;
  const geometry = value as PolygonGeometry;
  if (geometry.type === 'Polygon') {
    return Array.isArray(geometry.coordinates) && geometry.coordinates.every(validateRing);
  }
  if (geometry.type === 'MultiPolygon') {
    return Array.isArray(geometry.coordinates) && geometry.coordinates.every(
      (polygon) => Array.isArray(polygon) && polygon.every(validateRing),
    );
  }
  return false;
};

export function validatePolygonFeatureCollection(value: unknown): GeoJsonFeatureCollection {
  if (!value || typeof value !== 'object') throw new Error('GeoJSON ไม่ใช่วัตถุ');
  const collection = value as Partial<GeoJsonFeatureCollection>;
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('GeoJSON ต้องเป็น FeatureCollection');
  }

  const features = collection.features.map((feature, index) => {
    if (!feature || feature.type !== 'Feature' || !validateGeometry(feature.geometry)) {
      throw new Error(`GeoJSON feature ${index + 1} ไม่มี polygon geometry ที่ถูกต้อง`);
    }
    return {
      type: 'Feature' as const,
      geometry: feature.geometry,
      properties: feature.properties && typeof feature.properties === 'object' ? { ...feature.properties } : {},
    };
  });

  return { type: 'FeatureCollection', features };
}

export function validateAndNormalizeVillageGeoJson(value: unknown): GeoJsonFeatureCollection {
  const collection = validatePolygonFeatureCollection(value);
  const seen = new Set<number>();

  const features = collection.features.map((feature, featureIndex) => {
    const rawName = feature.properties.own_villag;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    const moo = VILLAGE_NUMBER_BY_NAME[name];
    if (!moo) throw new Error(`ไม่รู้จักชื่อหมู่บ้านใน feature ${featureIndex + 1}: ${name || '(ว่าง)'}`);
    if (seen.has(moo)) throw new Error(`พบข้อมูลหมู่ ${moo} ซ้ำใน GeoJSON`);
    seen.add(moo);

    return {
      ...feature,
      properties: {
        ...feature.properties,
        __idx: featureIndex,
        village_id: `moo-${moo}`,
        moo,
        name_th: name,
      },
    };
  });

  const missing = Object.values(VILLAGE_NUMBER_BY_NAME).filter((moo) => !seen.has(moo));
  if (missing.length) throw new Error(`GeoJSON ขาดข้อมูลหมู่ ${missing.join(', ')}`);
  if (features.length !== 13) throw new Error(`GeoJSON หมู่บ้านต้องมี 13 features แต่พบ ${features.length}`);

  return { type: 'FeatureCollection', features };
}
