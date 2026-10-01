import type { ReactNode } from 'react';
import Link from 'next/link';

type DocumentPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  rawHref: string;
  rawFilename: string;
  children: ReactNode;
};

export function DocumentPage({ eyebrow, title, description, rawHref, rawFilename, children }: DocumentPageProps) {
  return (
    <div className="min-h-screen bg-[#050b14] pb-20 text-white">
      <header className="border-b border-slate-800 bg-[#0b132b] px-4 py-5 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-400">{eyebrow}</p>
            <h1 className="mt-1 text-2xl font-black md:text-3xl">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/open-data" className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-bold transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
              ← กลับ Open Data
            </Link>
            <a href={rawHref} download={rawFilename} className="rounded-xl border border-sky-500 bg-sky-700 px-4 py-2.5 text-sm font-bold transition hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
              ดาวน์โหลด JSON
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}

export function SummaryGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(item => (
        <div key={item.label} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <dt className="text-xs font-semibold text-slate-400">{item.label}</dt>
          <dd className="mt-1 break-words text-sm font-bold leading-6 text-slate-100">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-slate-700 py-3 first:border-t-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold text-slate-400">{label}</dt>
      <dd className="break-words text-sm leading-6 text-slate-200">{children}</dd>
    </div>
  );
}
