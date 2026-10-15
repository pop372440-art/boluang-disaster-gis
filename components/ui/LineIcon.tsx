import type { SVGProps } from 'react';

export type IconName = 'map' | 'layers' | 'weather' | 'water' | 'external' | 'report' | 'chart' | 'download' | 'close' | 'search' | 'help';
const paths: Record<IconName, string> = {
  map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
  layers: 'm3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4',
  weather: 'M7 16a4 4 0 1 1 1-7 5 5 0 0 1 10 1 3 3 0 0 1 0 6H7Zm2 3-1 2m6-2-1 2',
  water: 'M3 8c3-4 6 4 9 0s6 4 9 0M3 14c3-4 6 4 9 0s6 4 9 0M3 20c3-4 6 4 9 0s6 4 9 0',
  external: 'M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5',
  report: 'M12 8v5m0 4h.01M10 3 2 19h20L14 3h-4Z',
  chart: 'M4 3v17h17M8 16v-4m5 4V7m5 9v-6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  close: 'm6 6 12 12M6 18 18 6',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  help: 'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
};

export default function LineIcon({ name, className = 'h-4 w-4', ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}><path d={paths[name]} /></svg>;
}
