export type LandslideSeverity = 'high' | 'moderate' | 'unknown';

export function classifyLandslideFeature(properties: Record<string, unknown> | null | undefined): LandslideSeverity {
  const description = String(properties?.ls_desth ?? '').trim();
  const hazardClass = Number(properties?.class);
  if (description === 'สูง' || hazardClass === 1) return 'high';
  if (description === 'ปานกลาง' || hazardClass === 2) return 'moderate';
  return 'unknown';
}

export function landslideFeatureStyle(properties: Record<string, unknown> | null | undefined) {
  const severity = classifyLandslideFeature(properties);
  if (severity === 'high') {
    return { color: '#EF4444', fillColor: '#EF4444', weight: 0.9, fillOpacity: 0.34 };
  }
  if (severity === 'moderate') {
    return { color: '#F59E0B', fillColor: '#F59E0B', weight: 0.65, fillOpacity: 0.22 };
  }
  return { color: '#94A3B8', fillColor: '#94A3B8', weight: 0.5, fillOpacity: 0.16 };
}
