import { NextResponse } from 'next/server';

// บังคับไม่ให้ Next.js จำ Cache สำหรับหน้านี้ เพื่อให้ได้สถานะ Real-time เสมอ
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { 
      status: 'ok', 
      service: 'Bo Luang Disaster GIS API',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    },
    { status: 200 }
  );
}
