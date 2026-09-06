// app/api/weather/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/* ---------- ค่าคงที่ของระบบ ---------- */
const BO_LUANG = { lat: 18.1633, lng: 98.3744 };
const PROBE_RINGS_KM = [25, 50, 75, 100, 130];   // วงตรวจจับฝนต้นทาง
const FALLBACK_STEERING_KMH = 28;                 // ความเร็วนำพาเริ่มต้น ฤดูมรสุมภาคเหนือ
const RAIN_TRIGGER_MMH = 0.3;                     // ถือว่า "มีฝน" ที่จุดตรวจ

/* เกณฑ์เตือนภัยสามระดับ (บ่อหลวง: ที่สูง ลำห้วยสายสั้น น้ำมาเร็ว) */
const T = {
  YELLOW: { hourly: 10, sum3h: 35 },
  ORANGE: { sum6h: 60 },
  RED:    { sum12h: 90, consecHourly: 20, consecCount: 2 },
};

/* ---------- ตรีโกณมิติภูมิศาสตร์ ---------- */
const R_EARTH = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function destinationPoint(lat: number, lon: number, bearingDeg: number, distKm: number) {
  const δ = distKm / R_EARTH;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );
  return { lat: +toDeg(φ2).toFixed(4), lng: +(((toDeg(λ2) + 540) % 360) - 180).toFixed(4) };
}

const COMPASS = ['เหนือ','ตะวันออกเฉียงเหนือ','ตะวันออก','ตะวันออกเฉียงใต้','ใต้','ตะวันตกเฉียงใต้','ตะวันตก','ตะวันตกเฉียงเหนือ'];
const compassTh = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/* ---------- ตัวช่วยดึงข้อมูล ---------- */
async function getJSON<T>(url: string, revalidateSec: number): Promise<T | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: revalidateSec },
      headers: { 'User-Agent': 'BoLuang-Disaster-GIS/1.0 (Hot District, Chiang Mai)' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ---------- คำนวณระดับเตือนภัย ---------- */
function buildAlert(next24: number[]) {
  const sum = (n: number) => next24.slice(0, n).reduce((a, b) => a + (b || 0), 0);
  const s3 = sum(3), s6 = sum(6), s12 = sum(12), s24 = sum(24);
  const peak = Math.max(0, ...next24);

  let consec = 0, maxConsec = 0;
  for (const v of next24) {
    consec = v >= T.RED.consecHourly ? consec + 1 : 0;
    maxConsec = Math.max(maxConsec, consec);
  }

  const isRed = s12 >= T.RED.sum12h || maxConsec >= T.RED.consecCount;
  const isOrange = s6 >= T.ORANGE.sum6h;
  const isYellow = peak >= T.YELLOW.hourly || s3 >= T.YELLOW.sum3h;

  if (isRed) return {
    level: 'RED', code: 3, color: '#ef4444',
    title: 'อพยพ / เตรียมพร้อมสูงสุด',
    message: `คาดการณ์ฝนสะสม 12 ชม. ${s12.toFixed(1)} มม. เสี่ยงน้ำป่าไหลหลากและดินสไลด์บนสายฮอด–บ่อหลวง–อมก๋อย ให้แจ้งครัวเรือนริมลำห้วยเคลื่อนย้ายขึ้นที่สูงทันที`,
    sums: { s3, s6, s12, s24, peak },
  };
  if (isOrange) return {
    level: 'ORANGE', code: 2, color: '#f97316',
    title: 'เตือนภัย เฝ้าระวังใกล้ชิด',
    message: `คาดการณ์ฝนสะสม 6 ชม. ${s6.toFixed(1)} มม. ให้ตรวจสอบระดับน้ำในลำห้วยทุก 1 ชั่วโมง และงดกิจกรรมริมน้ำ`,
    sums: { s3, s6, s12, s24, peak },
  };
  if (isYellow) return {
    level: 'YELLOW', code: 1, color: '#facc15',
    title: 'เฝ้าระวัง',
    message: `คาดการณ์ฝนสูงสุด ${peak.toFixed(1)} มม./ชม. สะสม 3 ชม. ${s3.toFixed(1)} มม. โปรดระมัดระวังการเดินทางบนเส้นทางลาดชัน`,
    sums: { s3, s6, s12, s24, peak },
  };
  return {
    level: 'GREEN', code: 0, color: '#10b981',
    title: 'สถานการณ์ปกติ',
    message: 'ยังไม่พบสัญญาณฝนที่เข้าเกณฑ์เฝ้าระวังใน 24 ชั่วโมงข้างหน้า',
    sums: { s3, s6, s12, s24, peak },
  };
}

/* ---------- Handler ---------- */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get('lat') ?? '') || BO_LUANG.lat;
  const lng = parseFloat(sp.get('lng') ?? '') || BO_LUANG.lng;

  /* 1) สภาพอากาศจุดเป้าหมาย + ลมนำพา 700 hPa */
  const mainUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,` +
    `wind_speed_10m,wind_direction_10m,wind_speed_700hPa,wind_direction_700hPa,surface_pressure,cloud_cover` +
    `&hourly=precipitation,precipitation_probability,temperature_2m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max` +
    `&timezone=Asia%2FBangkok&forecast_days=7`;

  const aqiUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
    `&current=us_aqi,pm2_5,pm10&timezone=Asia%2FBangkok`;

  const [main, aqi, radarMeta] = await Promise.all([
    getJSON<any>(mainUrl, 300),
    getJSON<any>(aqiUrl, 900),
    getJSON<any>('https://api.rainviewer.com/public/weather-maps.json', 120),
  ]);

  if (!main?.current) {
    return NextResponse.json(
      { ok: false, error: 'ไม่สามารถดึงข้อมูลสภาพอากาศได้ในขณะนี้' },
      { status: 502 }
    );
  }

  const cur = main.current;

  /* 2) ทางเดินพายุ: ทวนทิศลม 700 hPa = ต้นทางของกลุ่มฝน */
  const steeringDirFrom = Number.isFinite(cur.wind_direction_700hPa)
    ? cur.wind_direction_700hPa
    : (cur.wind_direction_10m ?? 225);
  const steeringSpeed = Math.max(
    12,
    Number.isFinite(cur.wind_speed_700hPa) ? cur.wind_speed_700hPa : FALLBACK_STEERING_KMH
  );
  const probes = PROBE_RINGS_KM.map((km) => ({
    km,
    ...destinationPoint(lat, lng, steeringDirFrom, km),
  }));

  /* 3) ถามฝนที่จุดต้นทางทั้งห้าวงในคำขอเดียว */
  const probeUrl =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${probes.map((p) => p.lat).join(',')}` +
    `&longitude=${probes.map((p) => p.lng).join(',')}` +
    `&current=precipitation,rain,weather_code&timezone=Asia%2FBangkok&forecast_days=1`;
  const probeRes = await getJSON<any>(probeUrl, 180);
  const probeArr = Array.isArray(probeRes) ? probeRes : probeRes ? [probeRes] : [];

  const corridor = probes.map((p, i) => ({
    distanceKm: p.km,
    lat: p.lat,
    lng: p.lng,
    precipitation: probeArr[i]?.current?.precipitation ?? 0,
    weatherCode: probeArr[i]?.current?.weather_code ?? null,
  }));

  /* 4) ประเมินเวลาที่ฝนจะมาถึง */
  const incoming = corridor.find((c) => c.precipitation >= RAIN_TRIGGER_MMH);
  const rainingHere = (cur.precipitation ?? 0) >= RAIN_TRIGGER_MMH;

  const nowcast = rainingHere
    ? {
        status: 'RAINING_NOW' as const,
        etaMinutes: 0,
        headline: `ขณะนี้มีฝนตกในพื้นที่ ${(cur.precipitation ?? 0).toFixed(1)} มม./ชม.`,
      }
    : incoming
    ? {
        status: 'INCOMING' as const,
        etaMinutes: Math.round((incoming.distanceKm / steeringSpeed) * 60),
        headline:
          `ตรวจพบกลุ่มฝนห่างออกไป ${incoming.distanceKm} กม. ทางทิศ${compassTh(steeringDirFrom)} ` +
          `คาดถึงพื้นที่ในอีกประมาณ ${Math.round((incoming.distanceKm / steeringSpeed) * 60)} นาที`,
      }
    : {
        status: 'CLEAR' as const,
        etaMinutes: null,
        headline: `ไม่พบกลุ่มฝนในรัศมี ${PROBE_RINGS_KM.at(-1)} กม. ตามแนวลมนำพา`,
      };

  /* 5) เฟรมเรดาร์ RainViewer สำหรับซ้อนบน Leaflet */
  const rvHost = radarMeta?.host ?? 'https://tilecache.rainviewer.com';
  const rvPast = radarMeta?.radar?.past ?? [];
  const rvNow = radarMeta?.radar?.nowcast ?? [];
  const radar = {
    host: rvHost,
    tileTemplate: `${rvHost}{path}/256/{z}/{x}/{y}/4/1_1.png`,
    frames: [...rvPast, ...rvNow].map((f: any) => ({
      time: f.time,
      path: f.path,
      url: `${rvHost}${f.path}/256/{z}/{x}/{y}/4/1_1.png`,
      isForecast: rvNow.some((n: any) => n.time === f.time),
    })),
  };

  /* 6) จัดรูปข้อมูลรายชั่วโมง 24 ชม. ข้างหน้า */
  const times: string[] = main.hourly?.time ?? [];
  const nowIso = new Date().toISOString().slice(0, 13);
  let startIdx = times.findIndex((t) => t.slice(0, 13) >= nowIso);
  if (startIdx < 0) startIdx = 0;

  const next24 = (main.hourly?.precipitation ?? []).slice(startIdx, startIdx + 24).map(Number);
  const hourly = times.slice(startIdx, startIdx + 24).map((t, i) => ({
    time: t,
    hour: t.slice(11, 16),
    rain: Number(main.hourly.precipitation?.[startIdx + i] ?? 0),
    prob: Number(main.hourly.precipitation_probability?.[startIdx + i] ?? 0),
    temp: Number(main.hourly.temperature_2m?.[startIdx + i] ?? 0),
  }));

  /* 7) รายวัน 7 วัน — คงรูปแบบเดิมที่กราฟ Recharts ใช้อยู่ */
  const forecast = (main.daily?.time ?? []).map((d: string, i: number) => ({
    day: i === 0 ? 'วันนี้' : new Date(d).toLocaleDateString('th-TH', { weekday: 'short' }),
    date: d,
    maxTemp: Math.round(main.daily.temperature_2m_max?.[i] ?? 0),
    minTemp: Math.round(main.daily.temperature_2m_min?.[i] ?? 0),
    rain: Number((main.daily.precipitation_sum?.[i] ?? 0).toFixed(1)),
    prob: main.daily.precipitation_probability_max?.[i] ?? 0,
    code: main.daily.weather_code?.[i] ?? 0,
  }));

  const alert = buildAlert(next24);

  return NextResponse.json(
    {
      ok: true,
      updatedAt: new Date().toISOString(),
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
        rain_today: Number((main.daily?.precipitation_sum?.[0] ?? 0).toFixed(1)),
        uv_max: Math.round(main.daily?.uv_index_max?.[0] ?? 0),
      },
      aqi: {
        us_aqi: Math.round(aqi?.current?.us_aqi ?? 0),
        pm2_5: Number((aqi?.current?.pm2_5 ?? 0).toFixed(1)),
        pm10: Number((aqi?.current?.pm10 ?? 0).toFixed(1)),
      },
      steering: {
        directionFrom: Math.round(steeringDirFrom),
        directionText: compassTh(steeringDirFrom),
        speedKmh: Math.round(steeringSpeed),
        level: '700 hPa',
      },
      nowcast,
      corridor,
      radar,
      hourly,
      forecast,
      alert,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  );
}
