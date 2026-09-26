export type SeasonalMode = 'rain' | 'cold' | 'heat' | 'smoke' | 'fire';

export const SEASONAL_MODES: Record<SeasonalMode, {
  label: string;
  shortLabel: string;
  accent: string;
  layers: string[];
  priorities: string[];
}> = {
  rain: {
    label: 'ฤดูฝนและพายุ', shortLabel: 'ฝน', accent: '#38bdf8',
    layers: ['เรดาร์ฝน', 'ฝนคาดการณ์ 3 ชม.', 'ฝนสะสม 24 ชม.', 'ลมกระโชก', 'ดินอิ่มน้ำ', 'พื้นที่เสี่ยงดินถล่ม'],
    priorities: ['ติดตามกลุ่มฝน', 'ตรวจหมู่บ้านฝนสูงสุด', 'ประเมินน้ำป่าและดินถล่ม'],
  },
  cold: {
    label: 'ฤดูหนาวและหมอก', shortLabel: 'หนาว', accent: '#a5f3fc',
    layers: ['อุณหภูมิต่ำสุด', 'อุณหภูมิรู้สึกจริง', 'ความชื้น', 'หมอกและทัศนวิสัย', 'ลม', 'กลุ่มเปราะบาง'],
    priorities: ['เฝ้าระวังหนาวจัด', 'ดูทัศนวิสัย', 'ดูแลผู้สูงอายุและพื้นที่สูง'],
  },
  heat: {
    label: 'ฤดูร้อนและภัยแล้ง', shortLabel: 'ร้อน', accent: '#fb923c',
    layers: ['อุณหภูมิสูงสุด', 'ดัชนีความร้อน', 'UV', 'ความชื้น', 'ฝนสะสม 7 วัน', 'แหล่งน้ำชุมชน'],
    priorities: ['ติดตามความร้อน', 'ประเมินน้ำต้นทุน', 'แจ้งเตือนกิจกรรมกลางแจ้ง'],
  },
  smoke: {
    label: 'หมอกควันและ PM2.5', shortLabel: 'ฝุ่น', accent: '#fbbf24',
    layers: ['PM2.5', 'PM10', 'AQI', 'ลมและทิศทาง', 'การระบายอากาศ', 'Hotspot รอบพื้นที่'],
    priorities: ['ประเมินผลกระทบสุขภาพ', 'ติดตามทิศทางควัน', 'แจ้งกลุ่มเสี่ยง'],
  },
  fire: {
    label: 'ไฟป่าและจุดความร้อน', shortLabel: 'ไฟป่า', accent: '#f87171',
    layers: ['VIIRS Hotspot', 'MODIS Hotspot', 'ระยะจากชุมชน', 'ลม', 'ความชื้น', 'จำนวนวันที่ไม่มีฝน'],
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

