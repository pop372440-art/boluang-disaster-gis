import { NextRequest, NextResponse } from 'next/server';
import { parseAreaSearch } from '@/lib/gis/area-context';
import { localStationEvidence, stationRows } from '@/lib/gis/evidence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function load(type: 'rain' | 'water') {
  const endpoint = type === 'rain' ? 'rain_24h' : 'waterlevel_load';
  // Raw national rain responses exceed Next's data-cache size limit.
  // Keep them server-side and send only the selected radius to the browser.
  const response = await fetch(`https://api-v3.thaiwater.net/api/v1/thaiwater30/public/${endpoint}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('station source unavailable');
  const payload: unknown = await response.json();
  if (stationRows(payload) === null) throw new Error('invalid station schema');
  return payload;
}
export async function GET(request: NextRequest) {
  const area = parseAreaSearch(request.nextUrl.search);
  if (!area) return NextResponse.json({ error: 'กรุณาระบุพิกัดที่ถูกต้อง' }, { status: 400 });
  const [rain, water] = await Promise.allSettled([load('rain'), load('water')]);
  const encode = (result: PromiseSettledResult<unknown>, type: 'rain' | 'water') => result.status === 'fulfilled'
    ? { data: localStationEvidence(result.value, type, area, Date.now()).map(station => ({
      station: { tele_station_lat: station.lat, tele_station_long: station.lng, tele_station_name: { th: station.name } },
      ...(type === 'rain' ? { rain_24h: station.value, rainfall_datetime: station.freshness.observedAt } : { water_level: station.value, waterlevel_datetime: station.freshness.observedAt }),
    })) } : null;
  return NextResponse.json({ rain: encode(rain, 'rain'), water: encode(water, 'water'), radiusKm: 50,
    partial: rain.status === 'rejected' || water.status === 'rejected', source: 'ThaiWater / สทนช.', fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
