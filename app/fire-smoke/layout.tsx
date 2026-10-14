import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'ไฟป่าและฝุ่นควันบ่อหลวง',
  description: 'ข้อมูลฝุ่น PM2.5 ประเมิน จุดความร้อนจากดาวเทียม และลมฝน สำหรับประชาชนในตำบลบ่อหลวง พร้อมแหล่งข้อมูลและเวลาปรับปรุง',
};
export default function FireSmokeLayout({children}:{children:React.ReactNode}) { return children; }
