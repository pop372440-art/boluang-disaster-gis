export type IntelligenceQualityInput = {
  weatherReady: boolean;
  airReady: boolean;
  fireReady: boolean;
  nwpUsable: boolean;
  villageSnapshotsAvailable: boolean;
  fetchedAt: string | null;
};

export type IntelligenceQuality = {
  score: number;
  level: 'high' | 'medium' | 'low';
  label: string;
  stale: boolean;
  limitations: string[];
};

export function assessIntelligenceQuality(input: IntelligenceQualityInput, now = Date.now()): IntelligenceQuality {
  const limitations: string[] = [];
  let score = 0;
  if (input.weatherReady) score += 25; else limitations.push('ข้อมูลอากาศไม่พร้อม');
  if (input.airReady) score += 15; else limitations.push('ข้อมูลคุณภาพอากาศไม่พร้อม');
  if (input.fireReady) score += 15; else limitations.push('ข้อมูล Hotspot ไม่พร้อมหรือยังไม่ตั้งค่า');
  if (input.nwpUsable) score += 20; else limitations.push('ECMWF/GFS ไม่ครบหรือหมดอายุ');
  if (input.villageSnapshotsAvailable) score += 15; else limitations.push('ยังไม่มี snapshot รายหมู่บ้านที่ยืนยันเวลาได้');

  const timestamp = input.fetchedAt ? Date.parse(input.fetchedAt) : Number.NaN;
  const stale = !Number.isFinite(timestamp) || now - timestamp > 20 * 60_000;
  if (!stale) score += 10; else limitations.push('ข้อมูลสรุปเก่ากว่าเกณฑ์ 20 นาทีหรือไม่ทราบเวลา');

  const level = score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low';
  return {
    score,
    level,
    label: level === 'high' ? 'ข้อมูลพร้อมใช้คัดกรอง' : level === 'medium' ? 'ข้อมูลมีข้อจำกัด' : 'ข้อมูลไม่พอสำหรับสรุป',
    stale,
    limitations,
  };
}
