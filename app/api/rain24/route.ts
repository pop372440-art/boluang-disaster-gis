import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        // 🎭 ชุดพรางตัว
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://thaiwater.net/'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`ThaiWater API ถูกบล็อก (Status: ${response.status})`);
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('API Rain24 Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
