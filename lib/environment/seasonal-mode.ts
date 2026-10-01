export type SeasonalMode = 'rain' | 'cold' | 'heat' | 'smoke' | 'fire';
export type IntelligenceLayerId = 'radar' | 'villageRain' | 'wind' | 'landslide' | 'temperature' | 'humidity' | 'visibility' | 'air' | 'hotspots' | 'uv' | 'unavailable';
export type SeasonalLayer = { id: IntelligenceLayerId; label: string };

export const SEASONAL_MODES: Record<SeasonalMode, {
  label: string;
  shortLabel: string;
  accent: string;
  layers: SeasonalLayer[];
  priorities: string[];
}> = {
  rain: {
    label: 'ฤดูฝนและพายุ', shortLabel: 'ฝน', accent: '#38bdf8',
    layers: [
      { id: 'radar', label: 'เรดาร์ฝน' }, { id: 'villageRain', label: 'ฝนคาดการณ์ 3 ชม. รายหมู่บ้าน' },
      { id: 'villageRain', label: 'ฝนสะสม 24 ชม. รายหมู่บ้าน' }, { id: 'wind', label: 'ลมกระโชก ณ จุดอ้างอิง' },
      { id: 'unavailable', label: 'ดินอิ่มน้ำ — ยังไม่มีข้อมูลยืนยัน' }, { id: 'landslide', label: 'พื้นที่ความไวต่อดินถล่ม' },
    ],
    priorities: ['ติดตามกลุ่มฝน', 'ตรวจหมู่บ้านฝนสูงสุด', 'ประเมินน้ำป่าและดินถล่ม'],
  },
  cold: {
    label: 'ฤดูหนาวและหมอก', shortLabel: 'หนาว', accent: '#a5f3fc',
    layers: [
      { id: 'temperature', label: 'อุณหภูมิ ณ จุดอ้างอิง' }, { id: 'temperature', label: 'อุณหภูมิรู้สึกจริง' },
      { id: 'humidity', label: 'ความชื้น ณ จุดอ้างอิง' }, { id: 'visibility', label: 'ทัศนวิสัยจากแบบจำลอง' },
      { id: 'wind', label: 'ลม ณ จุดอ้างอิง' }, { id: 'unavailable', label: 'กลุ่มเปราะบาง — ยังไม่มีชุดข้อมูลเผยแพร่' },
    ],
    priorities: ['เฝ้าระวังหนาวจัด', 'ดูทัศนวิสัย', 'ดูแลผู้สูงอายุและพื้นที่สูง'],
  },
  heat: {
    label: 'ฤดูร้อนและภัยแล้ง', shortLabel: 'ร้อน', accent: '#fb923c',
    layers: [
      { id: 'temperature', label: 'อุณหภูมิสูงสุด' }, { id: 'temperature', label: 'อุณหภูมิรู้สึกจริง' },
      { id: 'uv', label: 'UV จากแบบจำลอง' }, { id: 'humidity', label: 'ความชื้น ณ จุดอ้างอิง' },
      { id: 'villageRain', label: 'ฝนสะสม 7 วันรายหมู่บ้าน' }, { id: 'unavailable', label: 'แหล่งน้ำชุมชน — รอตรวจรับรอง' },
    ],
    priorities: ['ติดตามความร้อน', 'ประเมินน้ำต้นทุน', 'แจ้งเตือนกิจกรรมกลางแจ้ง'],
  },
  smoke: {
    label: 'หมอกควันและ PM2.5', shortLabel: 'ฝุ่น', accent: '#fbbf24',
    layers: [
      { id: 'air', label: 'PM2.5 ประเมินจาก CAMS' }, { id: 'air', label: 'PM10 ประเมินจาก CAMS' },
      { id: 'air', label: 'AQI ประเมิน' }, { id: 'wind', label: 'ลมและทิศทาง ณ จุดอ้างอิง' },
      { id: 'unavailable', label: 'การระบายอากาศ — ยังไม่มีชั้นข้อมูล' }, { id: 'hotspots', label: 'Hotspot รอบพื้นที่ 50 กม.' },
    ],
    priorities: ['ประเมินผลกระทบสุขภาพ', 'ติดตามทิศทางควัน', 'แจ้งกลุ่มเสี่ยง'],
  },
  fire: {
    label: 'ไฟป่าและจุดความร้อน', shortLabel: 'ไฟป่า', accent: '#f87171',
    layers: [
      { id: 'hotspots', label: 'Hotspot จาก GISTDA' }, { id: 'hotspots', label: 'ชนิดดาวเทียม VIIRS / MODIS' },
      { id: 'hotspots', label: 'ระยะจากจุดกลางบ่อหลวง' }, { id: 'wind', label: 'ลม ณ จุดอ้างอิง' },
      { id: 'humidity', label: 'ความชื้น ณ จุดอ้างอิง' }, { id: 'unavailable', label: 'จำนวนวันที่ไม่มีฝน — ยังไม่ผ่าน validation' },
    ],
    priorities: ['ตรวจสอบจุดความร้อน', 'ประเมินทิศทางลม', 'จัดลำดับพื้นที่ลาดตระเวน'],
  },
};

export function inferSeasonalMode(month: number): SeasonalMode {
  if (month >= 5 && month <= 10) return 'rain';
  if (month === 11 || month === 12) return 'cold';
  if (month >= 1 && month <= 2) return 'smoke';
  if (month === 3) return 'fire';
  return 'heat';
}
