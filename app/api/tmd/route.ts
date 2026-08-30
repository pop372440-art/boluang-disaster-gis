import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('https://data.tmd.go.th/api/WeatherToday/V1/?type=json', {
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!res.ok) {
      return NextResponse.json({ status: 'ERROR', data: null }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json({ status: 'LIVE', data: data }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ status: 'ERROR', data: null }, { status: 200 });
  }
}
