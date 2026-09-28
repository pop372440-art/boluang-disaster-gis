import { permanentRedirect } from 'next/navigation';

export default function LegacyOpenDataPage() {
  permanentRedirect('/open-data');
}
