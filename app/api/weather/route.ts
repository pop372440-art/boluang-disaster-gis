// app/api/weather/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PNG } from 'pngjs';

export const runtime = 'nodejs';        // pngjs ต้องใช้ Node runtime
export const dynamic = 'force-dynamic';

/* ═══════════ ค่าคงที่ ═══════════ */
const BO_LUANG = { lat: 18.1633, lng: 98.3744 };

/* เกณฑ์เตือนภัย — ปรับให้ต่ำลงจากเดิม เพราะแบบจำลองความละเอียดหยาบ
   เกลี่ยยอดฝนพายุลง 3–5 เท่า  ⚠ ต้องสอบทานกับสถิติน้ำป่าบ่อหลวงจริง */
const T = {
  YELLOW: { peakHourly: 4,  sum3h: 12 },
  ORANGE: { peakHourly: 8,  sum3h: 25, sum6h: 25 },
  RED:    { sum6h: 45, sum12h: 50, consecMm: 12, consecCount: 2 },
};
/* เกณฑ์จากการ "ตรวจวัดจริง" ด้วยเรดาร์ (มม./ชม.) */
const OBS = { yellow: 2, orange: 10, red: 25 };

/* เรดาร์ */
const RADAR_Z = 7;              // 1 พิกเซล ≈ 1.16 กม. ที่ละติจูด 18°N
const RADAR_BLOCK = 3;          // ไทล์ 3×3 = 768×768 px ≈ 890 กม.
const RADAR_SCHEME = 0;         // 0 = ขาวดำ → ถอดค่าความเข้มได้ตรงที่สุด
const SEARCH_PX = 18;           // ระยะค้นหาเวกเตอร์การเคลื่อนที่
const CORRIDOR_KM = [10, 20, 30, 45, 60, 80, 100, 120];

/* ⚠ การแปลงค่าพิกเซล → dBZ เป็นค่าประมาณ ต้องสอบเทียบกับ
   มาตรวัดน้ำฝนจริงในพื้นที่ก่อนใช้สั่งการ */
const PX_TO_DBZ = (v: number) => (v <= 4 ? -Infinity : (v / 255) * 87 - 20);
const DBZ_TO_MMH = (d: number) =>
  !isFinite(d) || d < 5 ? 0 : Math.pow(Math.pow(10, d / 10) / 200, 1 / 1.6);

/* ═══════════ ตรีโกณภูมิศาสตร์ ═══════════ */
const R_EARTH = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const COMPASS = ['เหนือ','ตะวันออกเฉียงเหนือ','ตะวันออก','ตะวันออกเฉียงใต้',
                 'ใต้','ตะวันตกเฉียงใต้','ตะวันตก','ตะวันตกเฉียงเหนือ'];
const compassTh = (deg: number) =>
  COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

function lonLatToPx(lat: number, lng: number, z: number) {
  const n = 256 * Math.pow(2, z);
  const x = ((lng + 180) / 360) * n;
  const s = Math.sin(toRad(lat));
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}
const kmPerPx = (lat: number, z: number) =>
  (40075.016686 * Math.cos(toRad(lat))) / (256 * Math.pow(2, z));

/* ═══════════ แคชในหน่วยความจำ + fallback ═══════════ */
type CacheEntry = { value: any; at: number };
const memCache = new Map<string, CacheEntry>();
const lastGood = new Map<string, CacheEntry>();
const TTL = 4 * 60 * 1000;

/* ═══════════ ตัวช่วยดึงข้อมูล ═══════════ */
async function getJSON<T>(url: string, ms = 9000): Promise<T | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: c.signal, cache: 'no-store',
      headers: { 'User-Agent': 'BoLuang-Disaster-GIS/2.0' },
    });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/* ═══════════ อ่านไทล์เรดาร์เป็นตารางค่าความเข้ม ═══════════ */
type Grid = { d: Uint8Array; w: number; h: number; ox: number; oy: number };

async function fetchTile(url: string): Promise<PNG | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 7000);
  try {
    const r = await fetch(url, { signal: c.signal, cache: 'no-store' });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return await new Promise<PNG | null>((res) =>
      new PNG().parse(buf, (e, png) => res(e ? null : png))
    );
  } catch { return null; } finally { clearTimeout(t); }
}

async function buildGrid(host: string, path: string,
                         lat: number, lng: number): Promise<Grid | null> {
  const c = lonLatToPx(lat, lng, RADAR_Z);
  const tx0 = Math.floor(c.x / 256) - Math.floor(RADAR_BLOCK / 2);
  const ty0 = Math.floor(c.y / 256) - Math.floor(RADAR_BLOCK / 2);
  const W = RADAR_BLOCK * 256;
  const grid: Grid = { d: new Uint8Array(W * W), w: W, h: W,
                       ox: tx0 * 256, oy: ty0 * 256 };

  const jobs: Promise<void>[] = [];
  for (let i = 0; i < RADAR_BLOCK; i++)
    for (let j = 0; j < RADAR_BLOCK; j++) {
      const url = `${host}${path}/256/${RADAR_Z}/${tx0 + i}/${ty0 + j}/${RADAR_SCHEME}/1_0.png`;
      jobs.push(
        fetchTile(url).then((png) => {
          if (!png) return;
          for (let y = 0; y < 256; y++)
            for (let x = 0; x < 256; x++) {
              const k = (y * 256 + x) << 2;
              const a = png.data[k + 3];
              // ขาวดำ: ใช้ความสว่างถ่วงด้วย alpha กันพื้นหลังโปร่งใส
              const v = a < 20 ? 0 : png.data[k];
              grid.d[(j * 256 + y) * W + (i * 256 + x)] = v;
            }
        })
      );
    }
  await Promise.all(jobs);
  return grid.d.some((v) => v > 0) ? grid : grid; // คืนเสมอ (0 = ไม่มีฝน)
}

const sample = (g: Grid, px: number, py: number) => {
  const x = Math.round(px - g.ox), y = Math.round(py - g.oy);
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 0;
  return g.d[y * g.w + x];
};
/* ค่าเฉลี่ยในรัศมี r พิกเซล กันสัญญาณรบกวนจุดเดียว */
function sampleArea(g: Grid, px: number, py: number, r = 2) {
  let s = 0, n = 0;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) { s += sample(g, px + dx, py + dy); n++; }
  return s / n;
}

/* ═══════════ หาเวกเตอร์การเคลื่อนที่จากเรดาร์ 2 เฟรม ═══════════ */
function estimateMotion(a: Grid, b: Grid, cx: number, cy: number) {
  const R = 90; // หน้าต่างเทียบ ±90 px ≈ ±105 กม.
  let best = { dx: 0, dy: 0, score: -1 };
  for (let dy = -SEARCH_PX; dy <= SEARCH_PX; dy++)
    for (let dx = -SEARCH_PX; dx <= SEARCH_PX; dx++) {
      let num = 0, cnt = 0;
      for (let y = -R; y <= R; y += 3)
        for (let x = -R; x <= R; x += 3) {
          const v1 = sample(a, cx + x, cy + y);
          const v2 = sample(b, cx + x + dx, cy + y + dy);
          if (v1 > 8 || v2 > 8) { num += Math.min(v1, v2); cnt++; }
        }
      const score = cnt > 0 ? num / cnt : 0;
      if (score > best.score) best = { dx, dy, score };
    }
  return best;
}

/* ═══════════ ประเมินระดับเตือนภัย ═══════════ */
function buildAlert(next24: number[], obsMmh: number, etaMin: number | null,
                    etaMmh: number) {
  const sum = (n: number) => next24.slice(0, n).reduce((a, b) => a + (b || 0), 0);
  const s3 = sum(3), s6 = sum(6), s12 = sum(12), s24 = sum(24);
  const peak = next24.length ? Math.max(...next24) : 0;

  let consec = 0, maxConsec = 0;
  for (const v of next24) {
    consec = v >= T.RED.consecMm ? consec + 1 : 0;
    maxConsec = Math.max(maxConsec, consec);
  }

  let score = 0;
  const reasons: string[] = [];

  /* ① การตรวจวัดจริง — น้ำหนักสูงสุดเสมอ */
  if (obsMmh >= OBS.red)         { score = Math.max(score, 3); reasons.push(`เรดาร์ตรวจพบฝนตกหนักมากในพื้นที่ ${obsMmh.toFixed(1)} มม./ชม.`); }
  else if (obsMmh >= OBS.orange) { score = Math.max(score, 2); reasons.push(`เรดาร์ตรวจพบฝนหนักในพื้นที่ ${obsMmh.toFixed(1)} มม./ชม.`); }
  else if (obsMmh >= OBS.yellow) { score = Math.max(score, 1); reasons.push(`เรดาร์ตรวจพบฝนกำลังตกในพื้นที่ ${obsMmh.toFixed(1)} มม./ชม.`); }

  /* ② กลุ่มฝนกำลังเคลื่อนเข้ามา */
  if (etaMin !== null && etaMin <= 60) {
    if (etaMmh >= OBS.orange)      { score = Math.max(score, 2); reasons.push(`กลุ่มฝนหนักจะถึงพื้นที่ในอีก ${etaMin} นาที`); }
    else if (etaMmh >= OBS.yellow) { score = Math.max(score, 1); reasons.push(`กลุ่มฝนจะถึงพื้นที่ในอีก ${etaMin} นาที`); }
  }

  /* ③ แบบจำลองพยากรณ์ */
  if (s12 >= T.RED.sum12h || s6 >= T.RED.sum6h || maxConsec >= T.RED.consecCount) {
    score = Math.max(score, 3); reasons.push(`คาดการณ์ฝนสะสม 12 ชม. ${s12.toFixed(1)} มม.`);
  } else if (s6 >= T.ORANGE.sum6h || s3 >= T.ORANGE.sum3h || peak >= T.ORANGE.peakHourly) {
    score = Math.max(score, 2); reasons.push(`คาดการณ์ฝนสะสม 6 ชม. ${s6.toFixed(1)} มม.`);
  } else if (peak >= T.YELLOW.peakHourly || s3 >= T.YELLOW.sum3h) {
    score = Math.max(score, 1); reasons.push(`คาดการณ์ฝนสะสม 3 ชม. ${s3.toFixed(1)} มม.`);
  }

  const M = [
    { level: 'GREEN',  color: '#10b981', title: 'สถานการณ์ปกติ',
      action: 'ยังไม่พบสัญญาณฝนที่เข้าเกณฑ์เฝ้าระวัง' },
    { level: 'YELLOW', color: '#facc15', title: 'เฝ้าระวัง',
      action: 'ระมัดระวังการเดินทางบนเส้นทางลาดชัน ติดตามสถานการณ์ต่อเนื่อง' },
    { level: 'ORANGE', color: '#f97316', title: 'เตือนภัย เฝ้าระวังใกล้ชิด',
      action: 'ตรวจสอบระดับน้ำในลำห้วยทุก 1 ชั่วโมง งดกิจกรรมริมน้ำ แจ้ง อสม./ผู้ใหญ่บ้าน' },
    { level: 'RED',    color: '#ef4444', title: 'อพยพ / เตรียมพร้อมสูงสุด',
      action: 'แจ้งครัวเรือนริมลำห้วยเคลื่อนย้ายขึ้นที่สูงทันที เฝ้าระวังดินสไลด์สายฮอด–บ่อหลวง–อมก๋อย' },
  ][score];

  return {
    ...M, code: score,
    message: (reasons.length ? reasons.join(' • ') : M.action) +
             (score > 0 ? ` — ${M.action}` : ''),
    reasons,
    sums: { s3, s6, s12, s24, peak },
  };
}

/* ═══════════ HANDLER ═══════════ */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get('lat') ?? '') || BO_LUANG.lat;
  const lng = parseFloat(sp.get('lng') ?? '') || BO_LUANG.lng;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;

  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < TTL)
    return NextResponse.json({ ...hit.value, cached: true });

  try {
    /* ---- ① สภาพอากาศหลัก (seamless) ---- */
    const mainUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,` +
      `weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover` +
      `&hourly=precipitation_probability,temperature_2m,weather_code,cape` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,` +
      `precipitation_probability_max,uv_index_max` +
      `&timezone=Asia%2FBangkok&forecast_days=7`;

    /* ---- ② ฝนรายชั่วโมงแบบหลายโมเดล แล้วเอาค่าสูงสุด ---- */
    const multiUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&hourly=precipitation&models=ecmwf_ifs025,gfs_seamless,icon_seamless,jma_seamless` +
      `&timezone=Asia%2FBangkok&forecast_days=3`;

    const aqiUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}` +
      `&longitude=${lng}&current=us_aqi,pm2_5,pm10&timezone=Asia%2FBangkok`;

    const [main, multi, aqi, rvMeta] = await Promise.all([
      getJSON<any>(mainUrl), getJSON<any>(multiUrl), getJSON<any>(aqiUrl),
      getJSON<any>('https://api.rainviewer.com/public/weather-maps.json'),
    ]);
    if (!main?.current) throw new Error('Open-Meteo ไม่ตอบสนอง');

    const cur = main.current;

    /* ---- ③ 🔴 แก้บั๊กเขตเวลา: ใช้ current.time เป็นหลักยึด ---- */
    const times: string[] = main.hourly?.time ?? [];
    const anchor: string = (cur.time ?? '').slice(0, 13);   // เวลาไทยตรงกัน
    let startIdx = anchor ? times.findIndex((t) => t.slice(0, 13) >= anchor) : -1;
    if (startIdx < 0) startIdx = 0;

    /* ---- ④ รวมฝนหลายโมเดล เอาค่าสูงสุดรายชั่วโมง ---- */
    const mTimes: string[] = multi?.hourly?.time ?? [];
    const mStart = anchor ? Math.max(0, mTimes.findIndex((t) => t.slice(0, 13) >= anchor)) : 0;
    const precipKeys = Object.keys(multi?.hourly ?? {}).filter((k) => k.startsWith('precipitation'));
    const next24: number[] = [];
    for (let i = 0; i < 24; i++) {
      let mx = 0;
      for (const k of precipKeys) {
        const v = Number(multi.hourly[k]?.[mStart + i] ?? 0);
        if (isFinite(v) && v > mx) mx = v;
      }
      next24.push(mx);
    }

    /* ---- ⑤ 🔴 อ่านค่าเรดาร์จริง + คำนวณเวกเตอร์การเคลื่อนที่ ---- */
    const host = rvMeta?.host ?? 'https://tilecache.rainviewer.com';
    const past = rvMeta?.radar?.past ?? [];
    const nowcastFrames = rvMeta?.radar?.nowcast ?? [];
    const f2 = past[past.length - 1];
    const f1 = past[past.length - 3] ?? past[past.length - 2];

    let obsMmh = 0, obsDbz = -Infinity;
    let motion: any = null, corridor: any[] = [], eta: any = null;
    let radarOk = false;

    if (f1 && f2) {
      const [gA, gB] = await Promise.all([
        buildGrid(host, f1.path, lat, lng),
        buildGrid(host, f2.path, lat, lng),
      ]);
      if (gA && gB) {
        radarOk = true;
        const c = lonLatToPx(lat, lng, RADAR_Z);
        const kpp = kmPerPx(lat, RADAR_Z);

        const vNow = sampleArea(gB, c.x, c.y, 2);
        obsDbz = PX_TO_DBZ(vNow);
        obsMmh = DBZ_TO_MMH(obsDbz);

        const mv = estimateMotion(gA, gB, c.x, c.y);
        const gapH = Math.max(1, f2.time - f1.time) / 3600;
        const distKm = Math.hypot(mv.dx, mv.dy) * kpp;
        const speed = distKm / gapH;
        const bearingTo = (toDeg(Math.atan2(mv.dx, -mv.dy)) + 360) % 360;
        motion = {
          speedKmh: Math.round(speed),
          movingToward: compassTh(bearingTo),
          comingFrom: compassTh((bearingTo + 180) % 360),
          stationary: speed < 8,
          confidence: mv.score > 25 ? 'สูง' : mv.score > 10 ? 'ปานกลาง' : 'ต่ำ',
        };

        /* สแกนทวนทิศการเคลื่อนที่ = ต้นทางของกลุ่มฝน */
        const len = Math.hypot(mv.dx, mv.dy) || 1;
        const ux = mv.dx / len, uy = mv.dy / len;
        corridor = CORRIDOR_KM.map((km) => {
          const p = km / kpp;
          const v = sampleArea(gB, c.x - ux * p, c.y - uy * p, 2);
          const dbz = PX_TO_DBZ(v);
          const mmh = DBZ_TO_MMH(dbz);
          return {
            distanceKm: km, mmh: +mmh.toFixed(1),
            dbz: isFinite(dbz) ? Math.round(dbz) : null,
            wet: mmh >= 0.5,
            etaMin: speed > 3 ? Math.round((km / speed) * 60) : null,
          };
        });
        const firstWet = corridor.find((x) => x.wet && x.etaMin !== null && x.etaMin <= 180);
        if (firstWet) eta = { minutes: firstWet.etaMin, mmh: firstWet.mmh, km: firstWet.distanceKm };
      }
    }

    /* ---- ⑥ สร้างข้อความ nowcast ---- */
    const nowcast = obsMmh >= 0.5
      ? { status: 'RAINING_NOW', etaMinutes: 0, intensityMmh: +obsMmh.toFixed(1),
          headline: `🌧️ ขณะนี้เรดาร์ตรวจพบฝนตกในพื้นที่ ประมาณ ${obsMmh.toFixed(1)} มม./ชม.` +
                    (motion?.stationary ? ' — กลุ่มฝนเกือบนิ่ง เสี่ยงฝนตกซ้ำที่เดิม' : '') }
      : eta
      ? { status: 'INCOMING', etaMinutes: eta.minutes, intensityMmh: eta.mmh,
          headline: `⏱️ กลุ่มฝนห่างออกไป ${eta.km} กม. ทางทิศ${motion?.comingFrom ?? '-'} ` +
                    `คาดถึงพื้นที่ในอีกประมาณ ${eta.minutes} นาที` }
      : { status: radarOk ? 'CLEAR' : 'NO_RADAR', etaMinutes: null, intensityMmh: 0,
          headline: radarOk
            ? `🌤️ ไม่พบกลุ่มฝนเคลื่อนเข้าพื้นที่ภายใน 3 ชั่วโมง (สแกนรัศมี 120 กม.)`
            : `⚠️ ไม่สามารถอ่านภาพเรดาร์ได้ ใช้ผลแบบจำลองเพียงอย่างเดียว` };

    const alert = buildAlert(next24, obsMmh, eta?.minutes ?? null, eta?.mmh ?? 0);

    const hourly = times.slice(startIdx, startIdx + 24).map((t, i) => ({
      time: t, hour: t.slice(11, 16),
      rain: +(next24[i] ?? 0).toFixed(1),
      prob: Number(main.hourly.precipitation_probability?.[startIdx + i] ?? 0),
      temp: Number(main.hourly.temperature_2m?.[startIdx + i] ?? 0),
      cape: Number(main.hourly.cape?.[startIdx + i] ?? 0),
    }));

    const forecast = (main.daily?.time ?? []).map((d: string, i: number) => ({
      day: i === 0 ? 'วันนี้' : new Date(d).toLocaleDateString('th-TH', { weekday: 'short' }),
      date: d,
      maxTemp: Math.round(main.daily.temperature_2m_max?.[i] ?? 0),
      minTemp: Math.round(main.daily.temperature_2m_min?.[i] ?? 0),
      rain: +(main.daily.precipitation_sum?.[i] ?? 0).toFixed(1),
      prob: main.daily.precipitation_probability_max?.[i] ?? 0,
      code: main.daily.weather_code?.[i] ?? 0,
    }));

    const payload = {
      ok: true, stale: false,
      updatedAt: new Date().toISOString(),
      forecastWindowStart: times[startIdx] ?? null,   // ตรวจสอบเขตเวลาได้จากตรงนี้
      position: { lat, lng },
      current: {
        temperature_2m: cur.temperature_2m,
        apparent_temperature: cur.apparent_temperature,
        relative_humidity_2m: cur.relative_humidity_2m,
        wind_speed_10m: cur.wind_speed_10m,
        wind_direction_10m: cur.wind_direction_10m,
        wind_direction_text: compassTh(cur.wind_direction_10m ?? 0),
        surface_pressure: cur.surface_pressure,
        cloud_cover: cur.cloud_cover,
        weather_code: cur.weather_code,
        rain_now: cur.precipitation ?? 0,
        radar_mmh: +obsMmh.toFixed(1),
        radar_dbz: isFinite(obsDbz) ? Math.round(obsDbz) : null,
        rain_today: +(main.daily?.precipitation_sum?.[0] ?? 0).toFixed(1),
        uv_max: Math.round(main.daily?.uv_index_max?.[0] ?? 0),
        localTime: cur.time ?? null,
      },
      aqi: {
        us_aqi: Math.round(aqi?.current?.us_aqi ?? 0),
        pm2_5: +(aqi?.current?.pm2_5 ?? 0).toFixed(1),
        pm10: +(aqi?.current?.pm10 ?? 0).toFixed(1),
      },
      motion, radarOk, nowcast, corridor, hourly, forecast, alert,
      models: precipKeys.length,
      radar: {
        host,
        frames: [...past, ...nowcastFrames].map((f: any) => ({
          time: f.time, path: f.path,
          url: `${host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`,
          isForecast: nowcastFrames.some((n: any) => n.time === f.time),
        })),
      },
    };

    memCache.set(key, { value: payload, at: Date.now() });
    lastGood.set(key, { value: payload, at: Date.now() });
    return NextResponse.json(payload);

  } catch (e: any) {
    /* fallback: คืนข้อมูลดีล่าสุด ดีกว่าจอว่างในวันฝนตก */
    const g = lastGood.get(key);
    if (g) return NextResponse.json({
      ...g.value, stale: true, staleSince: new Date(g.at).toISOString(),
      warning: 'ระบบข้อมูลภายนอกไม่ตอบสนอง กำลังแสดงข้อมูลล่าสุดที่ดึงได้',
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'ไม่สามารถดึงข้อมูลได้' }, { status: 502 });
  }
}
