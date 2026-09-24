import { parseThaiWaterRainPayload, THAIWATER_RAIN_URL } from './parser.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['GET', 'POST'].includes(request.method)) return response({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return response({ error: 'server_configuration_missing' }, 500);

  const apiHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
  const rest = (path: string, init: RequestInit = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...apiHeaders, ...(init.headers ?? {}) },
  });

  if (request.method === 'GET') {
    const stationFilter = 'station_id=eq.thaiwater%3A1254';
    const [observationsResponse, earliestResponse, countResponse, ingestionResponse] = await Promise.all([
      rest(`radar_gauge_observations?${stationFilter}&select=station_id,observed_at,rain_mm,interval_minutes,quality_flag,source,station_name,agency_name,fetched_at,source_url,geometry,metadata&order=observed_at.desc&limit=20`),
      rest(`radar_gauge_observations?${stationFilter}&select=observed_at&order=observed_at.asc&limit=1`),
      rest(`radar_gauge_observations?${stationFilter}&select=id&limit=1`, { headers: { Prefer: 'count=exact' } }),
      rest('radar_gauge_ingestion_runs?source=eq.thaiwater%3Arain_24h&select=status,completed_at&order=started_at.desc&limit=1'),
    ]);
    if (![observationsResponse, earliestResponse, countResponse, ingestionResponse].every((item) => item.ok)) {
      return response({ error: 'gauge_status_unavailable' }, 502);
    }

    const observations = await observationsResponse.json() as Array<Record<string, unknown>>;
    const earliest = await earliestResponse.json() as Array<{ observed_at?: string }>;
    const ingestionRuns = await ingestionResponse.json() as Array<{ status?: string; completed_at?: string }>;
    const latestByInterval = new Map<number, Record<string, unknown>>();
    for (const item of observations) {
      const interval = Number(item.interval_minutes);
      if (!latestByInterval.has(interval)) latestByInterval.set(interval, item);
    }
    const latest = latestByInterval.get(60) ?? latestByInterval.get(1440);
    if (!latest) return response({ error: 'no_verified_gauge_observations' }, 404);
    const geometry = latest.geometry as { coordinates?: unknown[] } | null;
    const metadata = latest.metadata as Record<string, unknown> | null;
    const countHeader = countResponse.headers.get('content-range') ?? '0-0/0';
    const observationCount = Number(countHeader.split('/')[1] ?? 0);
    const latestRun = ingestionRuns[0];

    return response({
      status: 'ok',
      validation: {
        stage: 'collecting_real_observations',
        validated: false,
        observationCount: Number.isFinite(observationCount) ? observationCount : 0,
        coverageStartedAt: earliest[0]?.observed_at ?? null,
        fieldEventCount: 0,
      },
      station: {
        id: latest.station_id,
        code: metadata?.station_code ?? null,
        name: latest.station_name,
        agencyName: latest.agency_name,
        latitude: Array.isArray(geometry?.coordinates) ? geometry?.coordinates?.[1] : null,
        longitude: Array.isArray(geometry?.coordinates) ? geometry?.coordinates?.[0] : null,
        observedAt: latest.observed_at,
        fetchedAt: latest.fetched_at,
        qualityFlag: latest.quality_flag,
        source: latest.source,
        sourceUrl: latest.source_url,
      },
      measurements: {
        rain1hMm: latestByInterval.get(60)?.rain_mm ?? null,
        rain24hMm: latestByInterval.get(1440)?.rain_mm ?? null,
      },
      ingestion: {
        status: latestRun?.status ?? 'unknown',
        completedAt: latestRun?.completed_at ?? null,
      },
    });
  }

  const recentSince = new Date(Date.now() - 10 * 60_000).toISOString();
  const recent = await rest(
    `radar_gauge_ingestion_runs?source=eq.thaiwater:rain_24h&started_at=gte.${encodeURIComponent(recentSince)}&select=id,status&limit=1`,
  );
  if (!recent.ok) return response({ error: 'ingestion_guard_unavailable' }, 502);
  if ((await recent.json()).length > 0) return response({ status: 'skipped', reason: 'recent_run_exists' }, 202);

  const startedAt = new Date().toISOString();
  const runCreate = await rest('radar_gauge_ingestion_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ source: 'thaiwater:rain_24h', status: 'running', started_at: startedAt }),
  });
  if (!runCreate.ok) return response({ error: 'cannot_create_ingestion_run' }, 502);
  const [run] = await runCreate.json();

  try {
    const sourceResponse = await fetch(THAIWATER_RAIN_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'BoLuang-Disaster-GIS/1.0' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!sourceResponse.ok) throw new Error(`ThaiWater HTTP ${sourceResponse.status}`);
    const raw = await sourceResponse.text();
    const payloadHash = await sha256(raw);
    const parsed = parseThaiWaterRainPayload(JSON.parse(raw), new Date());
    const observations = parsed.observations.map((item) => ({ ...item, raw_hash: payloadHash }));

    const write = await rest(
      'radar_gauge_observations?on_conflict=station_id,observed_at,interval_minutes',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(observations),
      },
    );
    if (!write.ok) throw new Error(`Supabase observation upsert failed: ${write.status}`);
    const written = await write.json();

    await rest(`radar_gauge_ingestion_runs?id=eq.${run.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'succeeded',
        completed_at: new Date().toISOString(),
        fetched_count: parsed.sourceCount,
        accepted_count: 1,
        written_count: written.length,
        rejected_count: parsed.sourceCount - 1,
        source_observed_max: parsed.station.observedAt,
        payload_hash: payloadHash,
        metadata: { station: parsed.station, intervals: observations.map((item) => item.interval_minutes) },
      }),
    });

    return response({
      status: 'succeeded',
      source: 'ThaiWater',
      station: parsed.station,
      observations: observations.map(({ interval_minutes, rain_mm, quality_flag, observed_at }) => ({
        interval_minutes,
        rain_mm,
        quality_flag,
        observed_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown ingestion error';
    await rest(`radar_gauge_ingestion_runs?id=eq.${run.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed', completed_at: new Date().toISOString(), error_message: message }),
    });
    return response({ status: 'failed', error: message }, 502);
  }
});
