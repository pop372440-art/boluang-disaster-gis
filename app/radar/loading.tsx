export default function RadarLoading() {
  return (
    <main className="min-h-screen bg-[#111319] text-white overflow-hidden" aria-busy="true" aria-label="กำลังโหลดหน้า Radar">
      <div className="h-16 border-b border-slate-700 bg-[#1A1D24] animate-pulse" />
      <div className="relative h-[calc(100vh-4rem)] bg-[#151821]">
        <div className="absolute left-5 top-5 h-80 w-72 rounded-2xl bg-slate-800/80 animate-pulse" />
        <div className="absolute right-5 top-5 hidden h-96 w-96 rounded-2xl bg-slate-800/80 animate-pulse xl:block" />
        <div className="absolute bottom-5 left-1/2 h-28 w-[min(760px,90%)] -translate-x-1/2 rounded-2xl bg-slate-800/80 animate-pulse" />
      </div>
    </main>
  );
}
