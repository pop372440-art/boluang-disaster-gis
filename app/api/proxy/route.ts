import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const service = searchParams.get('service');
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  
  // พารามิเตอร์สำหรับ Open-Meteo ที่ต้องดึงทีละหลายสถานี
  const lats = searchParams.get('lats'); 
  const lons = searchParams.get('lons');

  const GISTDA_API_KEY = process.env.GISTDA_API_KEY || '';

  try {
    let targetUrl = '';
    let cacheTime = 300; // ค่าเริ่มต้น Cache 5 นาที

    if (service === 'gistda-hotspot') {
      if (!GISTDA_API_KEY) return NextResponse.json({ error: 'Missing API Key' }, { status: 500 });
      targetUrl = `https://api.sphere.gistda.or.th/services/info/disaster-recurring?lon=${lon}&lat=${lat}&disaster_type=hotspot&key=${GISTDA_API_KEY}`;
    } 
    else if (service === 'onwr-rain') {
      targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h';
    } 
    else if (service === 'onwr-waterlevel') {
      targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load';
    } 
    // 🛡️ เพิ่ม Proxy สำหรับ Open-Meteo (ป้องกัน Error 429) โดยจำ Cache ไว้ 15 นาที
    else if (service === 'weather-tmd') {
      targetUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weathercode&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FBangkok`;
      cacheTime = 900; 
    }
    else if (service === 'air-quality') {
      targetUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=Asia%2FBangkok`;
      cacheTime = 900; 
    }
    else {
      return NextResponse.json({ error: 'Invalid service type' }, { status: 400 });
    }

        const response = await fetch(targetUrl, {
      next: { revalidate: cacheTime } // สั่ง Vercel Cache เพื่อลดโหลด
    });

    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
