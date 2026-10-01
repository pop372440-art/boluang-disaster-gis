import { permanentRedirect } from 'next/navigation';

export default function LegacyDashboardPage() {
  permanentRedirect('/dashboard');
}
