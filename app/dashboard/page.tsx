import type { Metadata } from 'next';
import PublicDashboard from '@/components/dashboard/PublicDashboard';

export const metadata: Metadata = {
  title: 'Public Dashboard | Bo Luang Disaster GIS',
  description: 'สถิติการรับแจ้งเหตุสาธารณะของเทศบาลตำบลบ่อหลวง พร้อมตัวกรองวันที่ หมู่บ้าน ประเภทเหตุ และสถานะ',
};

export default function DashboardPage() {
  return <PublicDashboard />;
}
