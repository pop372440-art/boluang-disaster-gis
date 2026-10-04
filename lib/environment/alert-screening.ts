import type { EnvironmentalAlertLevel } from './server/alert-store';

export type EnvironmentalEvidence = {
  pm25: number | null;
  pm25Quality: string;
  hotspotCount: number | null;
  hotspotQuality: string;
};

const rank: Record<EnvironmentalAlertLevel, number> = { watch: 1, warning: 2, critical: 3 };

export function screenEnvironmentalEvidence(evidence: EnvironmentalEvidence) {
  const reasons: string[] = [];
  let level: EnvironmentalAlertLevel | null = null;
  const promote = (next: EnvironmentalAlertLevel) => {
    if (!level || rank[next] > rank[level]) level = next;
  };

  if (evidence.pm25Quality === 'fresh' && evidence.pm25 != null) {
    if (evidence.pm25 > 75) { promote('critical'); reasons.push(`PM2.5 แบบจำลอง CAMS ${evidence.pm25.toFixed(1)} µg/m³`); }
    else if (evidence.pm25 > 37.5) { promote('warning'); reasons.push(`PM2.5 แบบจำลอง CAMS ${evidence.pm25.toFixed(1)} µg/m³`); }
    else if (evidence.pm25 > 25) { promote('watch'); reasons.push(`PM2.5 แบบจำลอง CAMS ${evidence.pm25.toFixed(1)} µg/m³`); }
  }
  if (evidence.hotspotQuality === 'fresh' && evidence.hotspotCount != null && evidence.hotspotCount > 0) {
    if (evidence.hotspotCount >= 10) promote('critical');
    else if (evidence.hotspotCount >= 3) promote('warning');
    else promote('watch');
    reasons.push(`GISTDA พบ Hotspot ${evidence.hotspotCount} จุดในรัศมี 50 กม.`);
  }
  return { level, reasons, eligible: level !== null };
}
