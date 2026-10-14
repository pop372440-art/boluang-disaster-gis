'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { hotspotAge, validPm, windFrom, observationUsable, type FireSmokeSummary } from '@/lib/environment/fire-smoke';
import { parseSourceTimestamp } from '@/lib/environment/source-quality';
const Map = dynamic(()=>import('@/components/intelligence/FireSmokeMap'),{ssr:false,loading:()=> <p className="p-6">กำลังเปิดแผนที่…</p>});
const stamp=(value?: string | null)=> { const ms=parseSourceTimestamp(value); return ms==null?'ไม่ทราบเวลา':new Date(ms).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}); };
const num=(value?: number)=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(1):'—';
const panel='rounded-3xl border border-emerald-900/10 bg-white p-5 shadow-sm';
export default function FireSmokePage() {
  const [data,setData]=useState<FireSmokeSummary|null>(null);
  const [boundary,setBoundary]=useState<GeoJSON.FeatureCollection|null>(null);
  const [villages,setVillages]=useState<GeoJSON.FeatureCollection|null>(null);
  const [village,setVillage]=useState('');
  const [location,setLocation]=useState<[number,number]|null>(null);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  const [now,setNow]=useState(0);
  const [showPoints,setShowPoints]=useState(true);
  const [showOld,setShowOld]=useState(false);
  useEffect(()=>{const tick=()=>setNow(Date.now());tick();const timer=setInterval(tick,60_000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')setRefresh(n=>n+1);},10*60_000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{let active=true;const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20_000);setLoading(true);
    fetch('/api/environment/summary',{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json() as Promise<FireSmokeSummary>;}).then(d=>{if(active){setData(d);setError('');}}).catch(()=>{if(active)setError(controller.signal.aborted?'การอ่านข้อมูลใช้เวลานาน กรุณาลองใหม่':'อ่านข้อมูลล่าสุดไม่สำเร็จ');}).finally(()=>{clearTimeout(timeout);if(active)setLoading(false);});
    return ()=>{active=false;clearTimeout(timeout);controller.abort();};},[refresh]);
  useEffect(()=>{const controller=new AbortController();
    const read=async(path:string)=>{const r=await fetch(path,{signal:controller.signal});if(!r.ok)throw new Error();return r.json() as Promise<GeoJSON.FeatureCollection>;};
    Promise.allSettled([read('/geojson/boluang.json'),read('/geojson/block.json')]).then(([a,b])=>{if(controller.signal.aborted)return;if(a.status==='fulfilled')setBoundary(a.value);if(b.status==='fulfilled')setVillages(b.value);});return ()=>controller.abort();},[]);
  const checked=parseSourceTimestamp(data?.fetchedAt);
  const old=now>0&&(checked==null||now-checked>20*60_000);
  const airUsable=!error&&!old&&data?.sources?.airQuality?.state==='ready'&&observationUsable(data?.airQuality?.current?.time,now,180);
  const pm=airUsable?validPm(data?.airQuality?.current?.pm2_5):null;
  const fireReady=!error&&!old&&data?.fire?.state==='ready'&&observationUsable(data?.fire?.acquisitionTime,now,360);
  const points=data?.fire?.hotspots ?? [];
  const recent=points.filter(p=>hotspotAge(p,now)==='recent');
  const visible=showPoints&&fireReady?points.filter(p=>hotspotAge(p,now)==='recent'||showOld):[];
  const current=data?.weather?.current;
  const weatherReady=!error&&!old&&data?.sources?.weather?.state==='ready'&&observationUsable(current?.time,now,180);
  const selected=villages?.features.find(f=>f.properties?.own_villag===village)??null;
  const forecast=(data?.weather?.hourly?.time??[]).map((time,i)=>({time,rain:data?.weather?.hourly?.precipitation?.[i],probability:data?.weather?.hourly?.precipitation_probability?.[i],wind:data?.weather?.hourly?.wind_speed_10m?.[i]})).filter(h=>(parseSourceTimestamp(h.time)??0)>=now).slice(0,8);
  function locate(){if(!navigator.geolocation){setMessage('อุปกรณ์นี้ไม่รองรับตำแหน่ง');return;}setMessage('กำลังหาตำแหน่ง…');navigator.geolocation.getCurrentPosition(p=>{setLocation([p.coords.latitude,p.coords.longitude]);setVillage('');setMessage('แผนที่เลื่อนไปยังตำแหน่งของคุณแล้ว ข้อมูลสรุปยังเป็นศูนย์กลางบ่อหลวง');},()=>setMessage('อ่านตำแหน่งไม่ได้ คุณยังเลือกหมู่บ้านได้'),{timeout:10_000,maximumAge:60_000});}
  return <main className="min-h-screen bg-[#f3f7f3] pb-24 text-slate-900">
    <header className="border-b border-emerald-900/10 bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5"><div><p className="text-xs font-bold text-emerald-700">เทศบาลตำบลบ่อหลวง • อำเภอฮอด</p><h1 className="text-2xl font-bold">ไฟป่าและฝุ่นควัน</h1><p className="mt-1 text-sm text-slate-600">เฝ้าระวังในบ่อหลวงและพื้นที่รอบข้าง</p></div><button onClick={()=>{setLoading(true);setRefresh(n=>n+1);}} disabled={loading} className="min-h-12 rounded-2xl bg-emerald-800 px-5 font-bold text-white disabled:opacity-50">{loading?'กำลังอ่านข้อมูล…':'↻ อัปเดต'}</button></div></header>
    <div className="mx-auto max-w-6xl space-y-5 p-4">
      <p role="status" className="text-sm text-slate-600">อ่านข้อมูล {stamp(data?.fetchedAt)} • เวลาไทย {error&&<strong className="text-red-700"> • {error} กรุณาอัปเดตอีกครั้ง</strong>}{old&&data&&<strong className="text-amber-800"> • ข้อมูลเก่า ห้ามใช้ยืนยันสถานการณ์ปัจจุบัน</strong>}</p>
      {data && !fireReady && <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">ข้อมูลจุดความร้อนยังไม่พร้อมใช้: รอบดาวเทียม {stamp(data.fire?.acquisitionTime)} เก่าหรือไม่ทราบเวลา จึงไม่แสดงเป็นศูนย์จุด และไม่ยืนยันว่าไม่มีไฟป่า</p>}
      <section className="grid gap-3 sm:grid-cols-3" aria-label="สรุปสถานการณ์">
        <article className={panel}><p className="font-bold">☁ ฝุ่น PM2.5 ประเมิน</p><p className="my-3 text-4xl font-bold text-emerald-800">{pm==null?'—':pm.toFixed(1)} <span className="text-sm text-slate-600">µg/m³</span></p><p className="text-sm">{pm==null?'ไม่มีข้อมูลล่าสุดที่ใช้ได้': 'ค่ารายชั่วโมงจากแบบจำลอง ไม่ใช่สถานีตรวจวัด'}</p><p className="mt-2 text-xs text-slate-500">CAMS ผ่าน Open-Meteo • เวลา {stamp(data?.airQuality?.current?.time)}</p></article>
        <article className={panel}><p className="font-bold">🔥 จุดความร้อนภายใน 12 ชั่วโมง</p><p className="my-3 text-4xl font-bold text-orange-700">{fireReady?recent.length:'—'} <span className="text-sm text-slate-600">จุด</span></p><p className="text-sm">{fireReady?'ในรัศมี 50 กม. ไม่ใช่จำนวนไฟป่าที่ยืนยัน':'ข้อมูลดาวเทียมยังไม่พร้อม ไม่ใช่การยืนยันว่าไม่มีไฟ'}</p><p className="mt-2 text-xs text-slate-500">GISTDA • รอบข้อมูล {stamp(data?.fire?.acquisitionTime)}</p></article>
        <article className={panel}><p className="font-bold">➤ ลมประกอบการเฝ้าระวัง</p><p className="my-3 text-4xl font-bold text-sky-800">{weatherReady?num(current?.wind_speed_10m):'—'} <span className="text-sm text-slate-600">กม./ชม.</span></p><p className="text-sm">พัดจาก{weatherReady?windFrom(current?.wind_direction_10m):'ไม่ทราบทิศ'} • กระโชก {weatherReady?num(current?.wind_gusts_10m):'—'} กม./ชม.</p><p className="mt-2 text-xs text-slate-500">แบบจำลอง Open-Meteo • {stamp(current?.time)}</p></article>
      </section>
      <section className="rounded-3xl bg-emerald-950 p-5 text-white"><h2 className="font-bold">ดูแลตัวเองวันนี้</h2><p className="mt-2 leading-relaxed">{pm==null?'ข้อมูลฝุ่นไม่พร้อม ให้ตรวจประกาศหน่วยงานและสภาพอากาศจริงก่อนทำกิจกรรมกลางแจ้ง':pm>37.5?'แบบจำลองคาดว่าฝุ่นสูง ควรลดกิจกรรมกลางแจ้ง โดยเฉพาะเด็ก ผู้สูงอายุ และผู้มีโรคทางเดินหายใจ':'ติดตามข้อมูลฝุ่นและประกาศในพื้นที่ก่อนทำกิจกรรมกลางแจ้ง ค่าประมาณนี้ไม่ได้รับรองว่าอากาศปลอดภัย'}</p><p className="mt-2 text-sm text-emerald-100">ไม่ใช้ค่ารายชั่วโมงนี้แทนค่าเฉลี่ย 24 ชั่วโมงหรือ AQI ทางการ หากพบไฟหรือควันจริง ให้แจ้งเหตุ</p></section>
      <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">แผนที่ 13 หมู่บ้าน</h2><button onClick={locate} className="min-h-12 rounded-xl border border-emerald-800 px-4 font-bold text-emerald-900">◎ ตำแหน่งของฉัน</button></div><label className="mt-3 block text-sm">เลือกหมู่บ้านเพื่อเลื่อนแผนที่<select value={village} onChange={e=>{setVillage(e.target.value);setLocation(null);}} className="mt-2 min-h-12 w-full rounded-xl border bg-white px-3"><option value="">ทั้งตำบลบ่อหลวง</option>{villages?.features.map((f,i)=><option key={i} value={f.properties?.own_villag}>{f.properties?.own_villag}</option>)}</select></label><p className="my-2 text-xs text-slate-500">เลือกหมู่บ้านเพื่อดูขอบเขตเท่านั้น ค่าฝุ่นและลมด้านบนเป็นค่าที่ศูนย์กลางบ่อหลวง</p><div className="flex flex-wrap gap-4 py-3 text-sm"><label><input type="checkbox" checked={showPoints} onChange={e=>setShowPoints(e.target.checked)} /> จุดความร้อน</label><label><input type="checkbox" checked={showOld} onChange={e=>setShowOld(e.target.checked)} /> รวมจุดเก่า / ไม่ทราบเวลา</label></div><p role="status" className="text-sm">{message}</p><div className="relative z-0 mt-3 h-[420px] overflow-hidden rounded-2xl"><Map boundary={boundary} villages={villages} points={visible} selected={selected} location={location} now={now} /></div><p className="mt-3 text-xs text-slate-600">สีส้ม: ตรวจพบภายใน 12 ชม. • สีเทา: เก่าหรือไม่ทราบเวลา • จุดความร้อนอาจเป็นการเผาหรือความร้อนประเภทอื่น ยังไม่ยืนยันว่าเป็นไฟป่า</p>{(!boundary||!villages)&&!loading&&<p className="mt-2 text-sm text-amber-800">ขอบเขตบางชั้นยังโหลดไม่สำเร็จ</p>}</section>
      <section className={panel}><h2 className="text-lg font-bold">ฝนและลมล่วงหน้า</h2><p className="text-sm text-slate-600">แบบจำลอง Open-Meteo • ไม่ใช่เรดาร์ตรวจวัดหรือแบบจำลองการกระจายควัน</p>{weatherReady?<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead><tr><th className="p-2">เวลา</th><th>ฝน มม.</th><th>โอกาสฝน</th><th>ลม กม./ชม.</th></tr></thead><tbody>{forecast.map(h=><tr key={h.time} className="border-t"><td className="p-2">{stamp(h.time)}</td><td>{num(h.rain)}</td><td>{num(h.probability)}%</td><td>{num(h.wind)}</td></tr>)}</tbody></table></div>:<p className="mt-3">ไม่มีพยากรณ์ล่าสุดที่ใช้ได้</p>}</section>
      <section className={panel}><h2 className="text-lg font-bold">รายการจุดความร้อน</h2><p className="mt-1 text-sm text-slate-600">จุดเก่า / ไม่ทราบเวลา {fireReady?points.length-recent.length:'—'} จุด • ไม่ใช้แทนการยืนยันภาคสนาม</p>{fireReady&&visible.length===0&&<p className="mt-3">ไม่พบจุดในตัวกรองนี้ ไม่ได้ยืนยันว่าไม่มีไฟป่า</p>}<ul className="divide-y">{visible.slice(0,20).map(p=><li key={p.dedupeKey} className="py-3 text-sm"><strong>{p.satellite} • ห่างศูนย์กลาง {p.distanceKm} กม.</strong><p>ตรวจพบ {stamp(p.acquiredAt)} • {hotspotAge(p,now)==='recent'?'ภายใน 12 ชม.':hotspotAge(p,now)==='unknown'?'ไม่ทราบเวลา':'ข้อมูลเก่า'}</p><p className="text-slate-500">พิกัด {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}</p></li>)}</ul>{visible.length>20&&<p className="text-sm">แสดงรายการ 20 จุดแรก ทุกจุดในตัวกรองแสดงบนแผนที่</p>}</section>
      <details className={panel}><summary className="cursor-pointer font-bold">แหล่งข้อมูลและข้อจำกัด</summary><div className="mt-3 space-y-2 text-sm"><p>GISTDA Sphere: ดาวเทียมจุดความร้อน ครอบคลุมรัศมี 50 กม. อาจตรวจไม่พบเพราะเมฆ เวลาผ่านของดาวเทียม หรือขนาดของไฟ</p><p>CAMS ผ่าน Open-Meteo: ค่าฝุ่นจากแบบจำลอง ไม่ใช่สถานีในหมู่บ้าน • Open-Meteo: พยากรณ์อากาศ • OpenStreetMap: แผนที่ฐาน</p>{Object.entries(data?.sources??{}).map(([key,source])=><p key={key}>{source.source} — {source.state==='ready'?'อ่านแหล่งข้อมูลได้':'ข้อมูลยังไม่พร้อม'} {source.quality?.state&&` • คุณภาพเวลา ${source.quality.state}`}</p>)}<p>ทิศลมไม่ได้ยืนยันเส้นทางควัน ระบบนี้เป็นข้อมูลประกอบการเฝ้าระวัง ไม่ใช่ประกาศเตือนภัยทางการ</p></div></details>
      <nav className="flex flex-wrap gap-3"><Link href="/report" className="min-h-12 rounded-2xl bg-orange-700 px-6 py-3 font-bold text-white">📷 แจ้งไฟ / ควัน พร้อมรูปและพิกัด</Link><Link href="/intelligence" className="min-h-12 rounded-2xl border border-emerald-800 px-5 py-3 font-bold">ดูศูนย์เฝ้าระวังทั้งหมด</Link></nav>
    </div>
  </main>;
}
