export type ScreeningLevel = 'normal' | 'watch' | 'warning';

export type ScreeningStatus = {
  level: ScreeningLevel;
  label: string;
  reasons: string[];
};

export const getScreeningStatus = (input: {
  precipitationMm?: number | null;
  windGustKmh?: number | null;
  pm25?: number | null;
  hotspotCount?: number | null;
}): ScreeningStatus => {
  const reasons: string[] = [];
  let severity = 0;
  const promote = (next: ScreeningLevel) => {
    severity = Math.max(severity, next === 'warning' ? 2 : next === 'watch' ? 1 : 0);
  };

  if ((input.precipitationMm ?? 0) >= 20) { promote('warning'); reasons.push('ฝนปัจจุบันตั้งแต่ 20 มม.'); }
  else if ((input.precipitationMm ?? 0) >= 10) { promote('watch'); reasons.push('ฝนปัจจุบันตั้งแต่ 10 มม.'); }
  if ((input.windGustKmh ?? 0) >= 60) { promote('warning'); reasons.push('ลมกระโชกตั้งแต่ 60 กม./ชม.'); }
  else if ((input.windGustKmh ?? 0) >= 40) { promote('watch'); reasons.push('ลมกระโชกตั้งแต่ 40 กม./ชม.'); }
  if ((input.pm25 ?? 0) > 37.5) { promote('warning'); reasons.push('PM2.5 เกิน 37.5 µg/m³'); }
  else if ((input.pm25 ?? 0) > 25) { promote('watch'); reasons.push('PM2.5 เกิน 25 µg/m³'); }
  if ((input.hotspotCount ?? 0) > 0) { promote('watch'); reasons.push(`พบ Hotspot ${input.hotspotCount} จุดในรัศมี 50 กม.`); }

  const level: ScreeningLevel = severity >= 2 ? 'warning' : severity === 1 ? 'watch' : 'normal';
  return {
    level,
    label: level === 'warning' ? 'ควรตรวจสอบเร่งด่วน' : level === 'watch' ? 'เฝ้าระวัง' : 'ติดตามปกติ',
    reasons,
  };
};
