'use client';

import Link from 'next/link';
import LineIcon, { type IconName } from '@/components/ui/LineIcon';
import { usePathname } from 'next/navigation';
import { areaHref, type AreaContext } from '@/lib/gis/area-context';

const CENTER_ROUTES = [
  { href: '/center', aliases: ['/center'], icon: 'chart', label: 'ภาพรวม' },
  { href: '/center/weather', aliases: ['/center/weather', '/weather', '/radar'], icon: 'weather', label: 'อากาศและแบบจำลอง' },
  { href: '/center/environment', aliases: ['/center/environment', '/intelligence'], icon: 'map', label: 'สิ่งแวดล้อม' },
  { href: '/center/flood', aliases: ['/center/flood', '/flood'], icon: 'water', label: 'น้ำและน้ำท่วม' },
  { href: '/center/executive', aliases: ['/center/executive', '/executive'], icon: 'chart', label: 'ภาพรวมผู้บริหาร' },
] as const;

export default function CenterNav({ area }: { area?: AreaContext }) {
  const pathname = usePathname();

  return (
    <nav aria-label="เมนูศูนย์สถานการณ์บ่อหลวง" className="bl-ui relative z-[1300] border-b border-slate-200 bg-white text-slate-900">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2 sm:px-5">
        <div className="mr-1 hidden shrink-0 rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 md:block">
          <span className="block text-[10px] font-semibold tracking-[0.18em] text-cyan-700">BO LUANG</span>
          <span className="block text-xs font-semibold text-slate-900">ศูนย์สถานการณ์</span>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-1" role="list">
            {CENTER_ROUTES.map((item) => {
              const active = item.aliases.includes(pathname as never);
              return (
                <Link
                  key={item.href}
                  href={area && ['/center/weather', '/center/flood'].includes(item.href) ? areaHref(item.href, area) : item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active ? 'border-cyan-200 bg-cyan-400/15 text-cyan-700' : 'border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900'}`}
                >
                  <LineIcon name={item.icon as IconName} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <Link href={area ? areaHref('/', area) : '/'} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
          แผนที่ GIS
        </Link>
      </div>
    </nav>
  );
}
