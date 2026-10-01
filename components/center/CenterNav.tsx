'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const CENTER_ROUTES = [
  { href: '/center', aliases: ['/center'], icon: '⌂', label: 'ภาพรวม' },
  { href: '/center/weather', aliases: ['/center/weather', '/weather', '/radar'], icon: '☁', label: 'อากาศและแบบจำลอง' },
  { href: '/center/environment', aliases: ['/center/environment', '/intelligence'], icon: '◉', label: 'สิ่งแวดล้อม' },
  { href: '/center/flood', aliases: ['/center/flood', '/flood'], icon: '≋', label: 'น้ำและน้ำท่วม' },
  { href: '/center/executive', aliases: ['/center/executive', '/executive'], icon: '▦', label: 'ภาพรวมผู้บริหาร' },
] as const;

export default function CenterNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="เมนูศูนย์สถานการณ์บ่อหลวง" className="relative z-[1300] border-b border-slate-700 bg-slate-950 text-slate-100 shadow-lg">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2 sm:px-5">
        <Link href="/center" className="mr-1 hidden shrink-0 rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 md:block">
          <span className="block text-[10px] font-black tracking-[0.18em] text-cyan-300">BO LUANG</span>
          <span className="block text-xs font-extrabold text-white">Situation Center</span>
        </Link>
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-1" role="list">
            {CENTER_ROUTES.map((item) => {
              const active = item.aliases.includes(pathname as never);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-100' : 'border-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`}
                >
                  <span aria-hidden="true" className="text-base text-cyan-300">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <Link href="/" className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
          แผนที่ GIS
        </Link>
      </div>
    </nav>
  );
}
