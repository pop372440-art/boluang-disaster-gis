'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { hotspotAge, validPm, windFrom, observationUsable, type FireSmokeSummary } from '@/lib/environment/fire-smoke';
import { parseSourceTimestamp } from '@/lib/environment/source-quality';

const Map = dynamic(()=>import('@/components/intelligence/FireSmokeMap'),{ssr:false,loading:()=> <p className="p-6 text-center font-bold">กำลังเปิดแผนที่…</p>});
const stamp=(value?: string | null)=> { const ms=parseSourceTimestamp(value); return ms==null?'ไม่ทราบเวลา':new Date(ms).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}); };
const num=(value?: number)=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(1):'—';
const panel='rounded-[1.75rem] border border-emerald-950/10 bg-white p-5 shadow-sm';

function Icon({kind,className='h-10 w-10'}:{kind:'smoke'|'fire'|'wind'|'sound'|'camera'|'map'|'refresh';className?:string}) {
  const common={className,fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,viewBox:'0 0 24 24','aria-hidden':true};
  if(kind==='smoke')return <svg {...common}><path d="M4 15h11a4 4 0 1 0-3.7-5.5A5 5 0 0 0 2 12"/><path d="M5 19h14M9 22h10"/></svg>;
  if(kind==='fire')return <svg {...common}><path d="M12 22c4.4 0 7-3 7-7.1 0-3.1-1.7-5.8-5.1-8.4.1 2.1-.8 3.6-2.1 4.6.1-3.2-1.5-6.2-4.4-9.1.2 4-2.4 6.1-2.4 9.8C5 17.5 8 22 12 22Z"/><path d="M9.5 18.5c0-1.8 1-3 2.7-4.4.1 1.4.8 2.2 1.8 3.2"/></svg>;
  if(kind==='wind')return <svg {...common}><path d="M3 8h10a2.5 2.5 0 1 0-2.4-3.2M3 12h16a2 2 0 1 1-1.8 2.9M3 16h8"/></svg>;
  if(kind==='sound')return <svg {...common}><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></svg>;
  if(kind==='camera')return <svg {...common}><path d="M14.5 5 16 7h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4l1.5-2h5Z"/><circle cx="12" cy="13" r="3"/></svg>;
  if(kind==='map')return <svg {...common}><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/></svg>;
  return <svg {...common}><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/></svg>;
}

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
  const [speaking,setSpeaking]=useState(false);
  useEffect(()=>{const tick=()=>setNow(Date.now());tick();const timer=setInterval(tick,60_000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')setRefresh(n=>n+1);},10*60_000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{let active=true;const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20_000);setLoading(true);fetch('/api/environment/summary',{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json() as Promise<FireSmokeSummary>;}).then(d=>{if(active){setData(d);setError('');}}).catch(()=>{if(active)setError(controller.signal.aborted?'การอ่านข้อมูลใช้เวลานาน กรุณาลองใหม่':'อ่านข้อมูลล่าสุดไม่สำเร็จ');}).finally(()=>{clearTimeout(timeout);if(active)setLoading(false);});return ()=>{active=false;clearTimeout(timeout);controller.abort();};},[refresh]);
  useEffect(()=>{const controller=new AbortController();const read=async(path:string)=>{const r=await fetch(path,{signal:controller.signal});if(!r.ok)throw new Error();return r.json() as Promise<GeoJSON.FeatureCollection>;};Promise.allSettled([read('/geojson/boluang.json'),read('/geojson/block.json')]).then(([a,b])=>{if(controller.signal.aborted)return;if(a.status==='fulfilled')setBoundary(a.value);if(b.status==='fulfilled')setVillages(b.value);});return ()=>controller.abort();},[]);

  const checked=parseSourceTimestamp(data?.fetchedAt);
  const old=now>0&&(checked==null||now-checked>20*60_000);
  const airUsable=!error&&!old&&data?.sources?.airQuality?.state==='ready'&&observationUsable(data?.airQuality?.current?.time,now,180);
  const pm=airUsable?validPm(data?.airQuality?.current?.pm2_5):null;
  const fireReady=!error&&!old&&data?.fire?.state==='ready'&&observationUsable(data?.fire?.coverageCheckedAt??data?.fire?.acquisitionTime,now,360);
  const points=data?.fire?.hotspots ?? [];
  const recent=points.filter(p=>hotspotAge(p,now)==='recent');
  const visible=showPoints&&fireReady?points.filter(p=>hotspotAge(p,now)==='recent'||showOld):[];
  const current=data?.weather?.current;
  const weatherReady=!error&&!old&&data?.sources?.weather?.state==='ready'&&observationUsable(current?.time,now,180);
  const selected=villages?.features.find(f=>f.properties?.own_villag===village)??null;
  const forecast=(data?.weather?.hourly?.time??[]).map((time,i)=>({time,rain:data?.weather?.hourly?.precipitation?.[i],probability:data?.weather?.hourly?.precipitation_probability?.[i],wind:data?.weather?.hourly?.wind_speed_10m?.[i]})).filter(h=>(parseSourceTimestamp(h.time)??0)>=now).slice(0,8);
  const situation=useMemo(()=>{
    if(loading&&!data)return {tone:'slate',label:'กำลังอ่านข้อมูล',detail:'กรุณารอสักครู่ ระบบกำลังตรวจข้อมูลล่าสุด'};
    if(error||old)return {tone:'amber',label:'ข้อมูลยังไม่พร้อม',detail:'อย่าใช้หน้านี้ยืนยันว่าไม่มีไฟหรือควัน'};
    if(!fireReady)return {tone:'amber',label:'ดาวเทียมยังไม่พร้อม',detail:'ข้อมูลจุดความร้อนเก่าหรือไม่ทราบเวลา'};
    if(recent.length>0)return {tone:'red',label:'พบจุดความร้อน',detail:`พบ ${recent.length} จุดในรัศมี 50 กิโลเมตร ต้องตรวจสอบภาคสนาม`};
    if(pm!=null&&pm>37.5)return {tone:'orange',label:'ควรระวังฝุ่น',detail:'ลดกิจกรรมกลางแจ้ง โดยเฉพาะกลุ่มเสี่ยง'};
    return {tone:'green',label:'ติดตามสถานการณ์',detail:'ยังต้องสังเกตไฟและควันจริงในพื้นที่'};
  },[data,error,fireReady,loading,old,pm,recent.length]);
  const tone={green:'bg-emerald-800',orange:'bg-orange-700',red:'bg-red-800',amber:'bg-amber-700',slate:'bg-slate-700'}[situation.tone];
  const advice=pm==null?'ข้อมูลฝุ่นไม่พร้อม ให้ตรวจประกาศและสภาพอากาศจริงก่อนออกนอกบ้าน':pm>37.5?'ฝุ่นอยู่ในระดับที่ควรระวัง ลดกิจกรรมกลางแจ้ง และดูแลเด็ก ผู้สูงอายุ และผู้มีโรคทางเดินหายใจ':'ค่าฝุ่นแบบจำลองยังไม่สูง แต่ต้องติดตามประกาศและสภาพจริงในพื้นที่';

  function speak(){if(!('speechSynthesis' in window)){setMessage('โทรศัพท์เครื่องนี้ยังไม่รองรับการอ่านออกเสียง');return;}window.speechSynthesis.cancel();const text=`สรุปไฟป่าและฝุ่นควัน เทศบาลตำบลบ่อหลวง ${situation.label} ${situation.detail} ${fireReady?`พบจุดความร้อนภายในสิบสองชั่วโมง ${recent.length} จุด`:'ข้อมูลดาวเทียมจุดความร้อนยังไม่พร้อม'} ${pm==null?'ข้อมูลฝุ่นยังไม่พร้อม':`ค่าฝุ่นพีเอ็มสองจุดห้าโดยประมาณ ${pm.toFixed(1)} ไมโครกรัมต่อลูกบาศก์เมตร`} ${weatherReady?`ลมพัดจาก${windFrom(current?.wind_direction_10m)} ความเร็ว ${num(current?.wind_speed_10m)} กิโลเมตรต่อชั่วโมง`:''} ${advice} หากเห็นไฟหรือควัน ให้กดปุ่มสีส้มแจ้งเหตุพร้อมรูปและพิกัด`;const utterance=new SpeechSynthesisUtterance(text);utterance.lang='th-TH';utterance.rate=.82;utterance.onstart=()=>setSpeaking(true);utterance.onend=()=>setSpeaking(false);utterance.onerror=()=>setSpeaking(false);window.speechSynthesis.speak(utterance);}
  function locate(){if(!navigator.geolocation){setMessage('อุปกรณ์นี้ไม่รองรับตำแหน่ง');return;}setMessage('กำลังหาตำแหน่ง…');navigator.geolocation.getCurrentPosition(p=>{setLocation([p.coords.latitude,p.coords.longitude]);setVillage('');setMessage('แผนที่เลื่อนไปยังตำแหน่งของคุณแล้ว ข้อมูลสรุปยังเป็นศูนย์กลางบ่อหลวง');document.getElementById('village-map')?.scrollIntoView({behavior:'smooth'});},()=>setMessage('อ่านตำแหน่งไม่ได้ คุณยังเลือกหมู่บ้านได้'),{timeout:10_000,maximumAge:60_000});}

  return <main className="min-h-screen bg-[#f2f6f3] pb-20 text-slate-950">
    <header className="bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4"><div><p className="text-xs font-black text-emerald-800">เทศบาลตำบลบ่อหลวง</p><h1 className="text-xl font-black sm:text-2xl">ไฟป่าและฝุ่นควัน</h1></div><button onClick={()=>{setLoading(true);setRefresh(n=>n+1);}} disabled={loading} className="grid min-h-12 min-w-12 place-items-center rounded-2xl border border-emerald-900/15 bg-emerald-50 text-emerald-900 disabled:opacity-50" aria-label="อ่านข้อมูลล่าสุด"><Icon kind="refresh" className={`h-6 w-6 ${loading?'animate-spin':''}`}/></button></div></header>
    <div className="mx-auto max-w-6xl space-y-5 p-4">
      <section className={`${tone} overflow-hidden rounded-[2rem] p-6 text-white shadow-lg sm:p-8`} aria-labelledby="situation-title"><div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-bold text-white/80">สถานการณ์ตอนนี้</p><h2 id="situation-title" className="mt-2 text-3xl font-black leading-tight sm:text-5xl">{situation.label}</h2><p className="mt-3 max-w-2xl text-lg font-semibold leading-8 text-white/90">{situation.detail}</p><p className="mt-3 text-xs text-white/75">อ่านข้อมูล {stamp(data?.fetchedAt)} • เวลาไทย</p></div><div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-white/15 ring-1 ring-white/30 sm:h-36 sm:w-36"><Icon kind={recent.length>0?'fire':pm!=null&&pm>37.5?'smoke':'wind'} className="h-16 w-16 sm:h-20 sm:w-20"/></div></div></section>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="ข้อมูลสำคัญ"><article className={panel}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-100 text-sky-800"><Icon kind="smoke" className="h-7 w-7"/></span><p className="mt-3 text-sm font-black">ฝุ่น PM2.5</p><p className="mt-1 text-3xl font-black text-sky-900">{pm==null?'—':pm.toFixed(1)}</p><p className="text-xs font-bold text-slate-500">µg/m³ • ค่าประเมิน</p></article><article className={panel}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-100 text-orange-800"><Icon kind="fire" className="h-7 w-7"/></span><p className="mt-3 text-sm font-black">จุดความร้อน</p><p className="mt-1 text-3xl font-black text-orange-800">{fireReady?recent.length:'—'}</p><p className="text-xs font-bold text-slate-500">ภายใน 12 ชม.</p></article><article className={`${panel} col-span-2 sm:col-span-1`}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><Icon kind="wind" className="h-7 w-7"/></span><p className="mt-3 text-sm font-black">ลม</p><p className="mt-1 text-3xl font-black text-emerald-900">{weatherReady?num(current?.wind_speed_10m):'—'} <span className="text-sm">กม./ชม.</span></p><p className="text-xs font-bold text-slate-500">จาก{weatherReady?windFrom(current?.wind_direction_10m):'ไม่ทราบทิศ'}</p></article></section>
      {data&&!fireReady&&<div role="alert" className="rounded-3xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-950"><p className="text-xl font-black">ข้อมูลดาวเทียมเก่า — ไม่แสดงเป็น 0 จุด</p><p className="mt-2 leading-7">รอบข้อมูล {stamp(data.fire?.acquisitionTime)} ไม่ใช้ยืนยันว่าไม่มีไฟป่า กรุณาสังเกตไฟและควันจริงในพื้นที่</p></div>}
      {fireReady&&<p className="rounded-2xl bg-white px-4 py-3 text-center text-xs font-bold text-slate-600">จุดความร้อน: {data?.fire?.source} • ตรวจแหล่งข้อมูล {stamp(data?.fire?.coverageCheckedAt)}</p>}
      <section className="grid gap-3 sm:grid-cols-3" aria-label="การใช้งานหลัก"><button onClick={speak} className="flex min-h-20 items-center justify-center gap-3 rounded-3xl bg-[#073c35] px-5 text-lg font-black text-white shadow-md"><Icon kind="sound" className="h-9 w-9"/>{speaking?'กำลังอ่านให้ฟัง…':'ฟังสรุปด้วยเสียง'}</button><Link href="/report" className="flex min-h-20 items-center justify-center gap-3 rounded-3xl bg-orange-700 px-5 text-center text-lg font-black text-white shadow-md"><Icon kind="camera" className="h-9 w-9"/>เห็นไฟหรือควัน<br/>กดแจ้งทันที</Link><button onClick={locate} className="flex min-h-20 items-center justify-center gap-3 rounded-3xl border-2 border-emerald-800 bg-white px-5 text-lg font-black text-emerald-950"><Icon kind="map" className="h-9 w-9"/>ดูตำแหน่งของฉัน</button></section>
      <section className="rounded-[1.75rem] bg-emerald-950 p-6 text-white"><h2 className="text-xl font-black">วันนี้ควรทำอย่างไร</h2><p className="mt-3 text-lg font-semibold leading-8">{advice}</p><p className="mt-2 text-sm text-emerald-100">หากเห็นไฟหรือควันจริง ให้แจ้งเหตุทันที ระบบนี้ไม่ใช่ประกาศเตือนภัยทางการ</p></section>
      <p role="status" className="text-center text-sm font-bold text-slate-600">{message}</p>
      <section id="village-map" className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">แผนที่ 13 หมู่บ้าน</h2><button onClick={locate} className="min-h-12 rounded-xl border border-emerald-800 px-4 font-bold text-emerald-900">ตำแหน่งของฉัน</button></div><label className="mt-4 block text-sm font-bold">เลือกหมู่บ้าน<select value={village} onChange={e=>{setVillage(e.target.value);setLocation(null);}} className="mt-2 min-h-14 w-full rounded-2xl border bg-white px-4 text-base"><option value="">ทั้งตำบลบ่อหลวง</option>{villages?.features.map((f,i)=><option key={i} value={f.properties?.own_villag}>{f.properties?.own_villag}</option>)}</select></label><div className="flex flex-wrap gap-4 py-4 text-sm"><label><input type="checkbox" checked={showPoints} onChange={e=>setShowPoints(e.target.checked)} /> จุดความร้อน</label><label><input type="checkbox" checked={showOld} onChange={e=>setShowOld(e.target.checked)} /> ดูข้อมูลเก่า</label></div><div className="relative z-0 h-[390px] overflow-hidden rounded-2xl"><Map boundary={boundary} villages={villages} points={visible} selected={selected} location={location} now={now}/></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-600"><span className="inline-flex items-center gap-2"><i className="h-3 w-5 rounded-sm bg-gradient-to-r from-teal-600 via-blue-600 to-violet-600"/>สีอ่อนใช้แยกเขตหมู่บ้าน ไม่ใช่ระดับอันตราย</span><span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-orange-600"/>จุดความร้อนภายใน 12 ชั่วโมง</span></div><p className="mt-2 text-xs leading-5 text-slate-600">จุดความร้อนอาจเกิดจากสาเหตุอื่นและยังไม่ยืนยันว่าเป็นไฟป่า</p></section>
      <details className={panel}><summary className="cursor-pointer text-lg font-black">ข้อมูลเพิ่มเติม: ฝนและลมล่วงหน้า</summary>{weatherReady?<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead><tr><th className="p-2">เวลา</th><th>ฝน มม.</th><th>โอกาสฝน</th><th>ลม กม./ชม.</th></tr></thead><tbody>{forecast.map(h=><tr key={h.time} className="border-t"><td className="p-2">{stamp(h.time)}</td><td>{num(h.rain)}</td><td>{num(h.probability)}%</td><td>{num(h.wind)}</td></tr>)}</tbody></table></div>:<p className="mt-3">ไม่มีพยากรณ์ล่าสุดที่ใช้ได้</p>}</details>
      <details className={panel}><summary className="cursor-pointer text-lg font-black">แหล่งข้อมูลและเครดิต</summary><div className="mt-4 space-y-4 text-sm leading-6">
        <p className="rounded-2xl bg-amber-50 p-4 font-semibold text-amber-950">ระบบนี้ไม่ได้ผลิตข้อมูลดาวเทียมหรือข้อมูลอากาศเอง ข้อมูลอาจคลาดเคลื่อน ใช้ประกอบการตัดสินใจและต้องตรวจสอบสภาพจริง ไม่ใช้แทนประกาศของทางราชการ</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <a className="rounded-2xl border p-4 hover:bg-slate-50" href="https://api.sphere.gistda.or.th/" target="_blank" rel="noreferrer"><strong className="block text-base text-emerald-900">GISTDA Sphere ↗</strong>จุดความร้อนจากดาวเทียมในรัศมี 50 กม. ซึ่งระบบใช้งานอยู่ อาจตรวจไม่พบจากเมฆ เวลาผ่านของดาวเทียม หรือขนาดไฟ</a>
          <a className="rounded-2xl border p-4 hover:bg-slate-50" href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer"><strong className="block text-base text-emerald-900">NASA FIRMS ↗</strong>แหล่งตรวจสอบอิสระสำหรับจุดความร้อน VIIRS จาก Suomi NPP, NOAA-20 และ NOAA-21 — ยังไม่ได้ใช้คำนวณตัวเลขบนหน้านี้</a>
          <a className="rounded-2xl border p-4 hover:bg-slate-50" href="https://open-meteo.com/" target="_blank" rel="noreferrer"><strong className="block text-base text-emerald-900">Open-Meteo · CAMS ↗</strong>พยากรณ์อากาศ ลม และค่าฝุ่นจากแบบจำลอง Copernicus CAMS ไม่ใช่สถานีตรวจวัดในหมู่บ้าน · CC BY 4.0</a>
          <a className="rounded-2xl border p-4 hover:bg-slate-50" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer"><strong className="block text-base text-emerald-900">OpenStreetMap ↗</strong>แผนที่ฐาน © ผู้ร่วมพัฒนา OpenStreetMap · ODbL แสดงผลด้วยซอฟต์แวร์แผนที่ Leaflet</a>
        </div>
        <div><p className="font-black">สถานะแหล่งข้อมูลที่ระบบอ่านอยู่</p>{Object.entries(data?.sources??{}).map(([key,source])=><p key={key} className="mt-1">{source.source} — {source.state==='ready'?'อ่านแหล่งข้อมูลได้':'ข้อมูลยังไม่พร้อม'} {source.quality?.state&&` • คุณภาพเวลา ${source.quality.state}`}</p>)}</div>
        <p className="text-xs text-slate-500">แนวทางการแสดงเครดิตประยุกต์จากรูปแบบของ 1Short Weather โดยอ้างอิงและเชื่อมไปยังเจ้าของข้อมูลต้นทางโดยตรง ไม่ได้คัดลอกข้อมูลหรือเครื่องหมายการค้าของ 1Short</p>
      </div></details>
      <Link href="/intelligence" className="block text-center font-bold text-emerald-900 underline">ดูศูนย์เฝ้าระวังฉบับเต็ม</Link>
    </div>
  </main>;
}
