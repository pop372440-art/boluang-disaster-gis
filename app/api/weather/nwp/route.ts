import { getNwpComparison } from '@/lib/weather/nwp-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const comparison = await getNwpComparison();
    return Response.json({
      ok: true,
      location: { name: 'ตำบลบ่อหลวง', latitude: 18.1633, longitude: 98.3744 },
      ...comparison,
      sourcePolicy: {
        data: 'ผล NWP จาก ECMWF และ NOAA/NCEP ส่งผ่าน Open-Meteo Single Runs API',
        windy: 'ใช้เป็นลิงก์ตรวจสอบภายนอกเท่านั้น ไม่ดึงหรือเผยแพร่ข้อมูลดิบจาก Windy',
        tropicalTidbits: 'ใช้เป็นลิงก์ตรวจสอบแผนที่เชิงภาพ ไม่ฝังภาพอัปเดตอัตโนมัติ',
      },
    }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=900, stale-while-revalidate=1800', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    console.error('[weather/nwp] providers unavailable', { error: error instanceof Error ? error.message : String(error) });
    return Response.json({
      ok: false,
      error: 'ผลแบบจำลอง ECMWF/GFS ยังไม่พร้อม ระบบไม่สรุปแนวโน้มจากข้อมูลที่ไม่ครบ',
      consensus: { usable: false, agreement: 'unavailable', label: 'เปรียบเทียบไม่ได้', officialWarningAllowed: false, requiresHumanApproval: true },
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
