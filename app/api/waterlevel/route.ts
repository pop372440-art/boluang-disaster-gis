import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load', {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store' // ให้ดึงข้อมูลใหม่เสมอ ไม่จำของเก่า
    });
    
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch water level data' }, { status: 500 });
  }
}
