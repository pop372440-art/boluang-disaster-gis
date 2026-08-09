import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h', {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    });
    
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch rain data' }, { status: 500 });
  }
}
