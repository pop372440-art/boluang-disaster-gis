import { timingSafeEqual } from 'node:crypto';
import { createEnvironmentalCandidate, environmentAdminClient } from '@/lib/environment/server/alert-store';
import { dispatchEnvironmentOutbox } from '@/lib/environment/line-messaging';
import { screenEnvironmentalEvidence } from '@/lib/environment/alert-screening';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.ENVIRONMENT_MONITOR_SECRET || process.env.CRON_SECRET;
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !token) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const summaryUrl = new URL('/api/environment/summary', request.url);
  summaryUrl.searchParams.set('_monitor', String(Date.now()));
  const summaryResponse = await fetch(summaryUrl, { cache: 'no-store', headers: { 'X-Environment-Monitor': '1' } });
  const summary = await summaryResponse.json().catch(() => null);
  if (!summaryResponse.ok || !summary?.sources) {
    return Response.json({ ok: false, error: 'environment summary unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const pm25 = typeof summary.airQuality?.current?.pm2_5 === 'number' ? summary.airQuality.current.pm2_5 : null;
  const hotspotCount = typeof summary.fire?.count === 'number' ? summary.fire.count : null;
  const pm25Quality = String(summary.sources.airQuality?.quality?.state ?? 'unknown');
  const hotspotQuality = String(summary.fire?.quality?.state ?? 'unknown');
  const client = environmentAdminClient();
  const fetchedAt = typeof summary.fetchedAt === 'string' ? summary.fetchedAt : new Date().toISOString();

  const { data: observation, error: observationError } = await client.from('environment_observations').insert({
    observed_at: summary.fire?.acquisitionTime ?? summary.sources.airQuality?.observedAt ?? fetchedAt,
    fetched_at: fetchedAt,
    pm25_ug_m3: pm25,
    pm25_quality: pm25Quality,
    hotspot_count: hotspotCount,
    hotspot_quality: hotspotQuality,
    satellite_types: summary.fire?.satelliteTypes ?? [],
    source_payload: {
      fire: { count: hotspotCount, quality: summary.fire?.quality, acquisitionTime: summary.fire?.acquisitionTime, satelliteTypes: summary.fire?.satelliteTypes },
      air: { pm25, quality: summary.sources.airQuality?.quality, observedAt: summary.sources.airQuality?.observedAt },
    },
  }).select('id').single();
  if (observationError) throw observationError;

  const screening = screenEnvironmentalEvidence({ pm25, pm25Quality, hotspotCount, hotspotQuality });
  let candidate = null;
  if (screening.eligible && screening.level) {
    candidate = await createEnvironmentalCandidate({
      sourceKind: hotspotQuality === 'fresh' && (hotspotCount ?? 0) > 0 ? 'satellite' : 'model',
      level: screening.level,
      reason: screening.reasons.join(' · '),
      evidence: {
        pm25, pm25Quality, hotspotCount, hotspotQuality,
        satelliteTypes: summary.fire?.satelliteTypes ?? [],
        hotspots: Array.isArray(summary.fire?.hotspots) ? summary.fire.hotspots.slice(0, 5).map((hotspot: Record<string, unknown>) => ({
          latitude: hotspot.latitude,
          longitude: hotspot.longitude,
          distanceKm: hotspot.distanceKm,
          satellite: hotspot.satellite,
          acquiredAt: hotspot.acquiredAt,
        })) : [],
      },
      observationId: observation.id,
      occurredAt: summary.fire?.acquisitionTime ?? summary.sources.airQuality?.observedAt ?? fetchedAt,
    }, client);
  }

  const delivery = await dispatchEnvironmentOutbox(client);
  return Response.json({
    ok: true,
    observationId: observation.id,
    candidate: candidate ? { id: candidate.candidate.id, created: candidate.created } : null,
    screening,
    delivery,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
