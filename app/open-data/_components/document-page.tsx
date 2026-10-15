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
    <div className="bl-ui min-h-screen bg-[#050b14] pb-20 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-5 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-sky-700">{eyebrow}</p>
            <h1 className="mt-1 text-2xl font-semibold md:text-3xl">{title}</h1>
            <p className="mt-2 max-w-3xl text-base leading-6 text-slate-700">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/open-data" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base font-bold transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
              ← กลับ Open Data
            </Link>
            <a href={rawHref} download={rawFilename} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-base font-bold transition hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
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
        <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <dt className="text-sm font-semibold text-slate-600">{item.label}</dt>
          <dd className="mt-1 break-words text-base font-bold leading-6 text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-slate-200 py-3 first:border-t-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-slate-600">{label}</dt>
      <dd className="break-words text-base leading-6 text-slate-800">{children}</dd>
    </div>
  );
}
