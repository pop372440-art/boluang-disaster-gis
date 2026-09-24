import { NextResponse } from 'next/server';
import { readLatestVillageSnapshots } from '@/lib/radar/server/radar-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshots = await readLatestVillageSnapshots();
    if (!snapshots) return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่าที่เก็บ snapshot' }, { status: 503 });
    return NextResponse.json({ snapshots }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('radar snapshot read failed', error);
    return NextResponse.json({ error: 'อ่าน snapshot ไม่สำเร็จ' }, { status: 502 });
  }
}
