import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const service = searchParams.get('service');
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  // ดึง API Key จากฝั่ง Server (ปลอดภัย)
  const GISTDA_API_KEY = process.env.GISTDA_API_KEY || '';

  try {
    let targetUrl = '';

    // สร้าง Proxy แบบแยกตาม Service
    if (service === 'gistda-hotspot') {
      if (!GISTDA_API_KEY) {
        return NextResponse.json({ error: 'Missing GISTDA API Key' }, { status: 500 });
      }
      targetUrl = `https://api.sphere.gistda.or.th/services/info/disaster-recurring?lon=${lon}&lat=${lat}&disaster_type=hotspot&key=${GISTDA_API_KEY}`;
    
    } else if (service === 'onwr-rain') {
      targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h';
      
    } else if (service === 'onwr-waterlevel') {
      targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load';
      
    } else {
      return NextResponse.json({ error: 'Invalid service type' }, { status: 400 });
    }

    // ดึงข้อมูลจากเซิร์ฟเวอร์ปลายทาง
    const response = await fetch(targetUrl, {
      next: { revalidate: 300 } // สั่งให้ Next.js จำ Cache ไว้ 5 นาที ลดภาระ Server
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from ${service}: ${response.status}`);
    }

    const data = await response.json();

    // ส่งข้อมูลกลับไปให้ Frontend
    return NextResponse.json(data);

  } catch (error: any) {
    console.error(`Proxy Error [${service}]:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
