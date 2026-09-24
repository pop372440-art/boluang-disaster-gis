-- Review and apply only to the Supabase project belonging to this GIS app.
create extension if not exists pgcrypto;

create table if not exists public.radar_forecast_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  model text,
  model_run_at timestamptz,
  fetched_at timestamptz not null,
  freshness text not null check (freshness in ('fresh', 'stale', 'expired', 'unknown')),
  payload_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.radar_village_snapshots (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.radar_forecast_runs(id) on delete cascade,
  village_id text not null,
  observed_at timestamptz not null,
  rain_1h_mm numeric,
  rain_3h_mm numeric,
  rain_24h_mm numeric,
  api_7d_mm numeric,
  risk_index numeric,
  risk_level text not null,
  confidence text not null,
  sample_count integer not null check (sample_count > 0),
  sample_coverage numeric not null check (sample_coverage between 0 and 1),
  details jsonb not null default '{}'::jsonb,
  unique (run_id, village_id)
);

create table if not exists public.radar_alert_states (
  village_id text primary key,
  current_level text not null,
  started_at timestamptz not null,
  changed_at timestamptz not null,
  pending_target text,
  pending_cycles integer not null default 0,
  notification_status text not null,
  suppression_reason text,
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.radar_alert_events (
  id uuid primary key default gen_random_uuid(),
  village_id text not null,
  from_level text,
  to_level text not null,
  decision text not null check (decision in ('proposed', 'approved', 'rejected', 'suppressed', 'cleared')),
  reason text,
  actor_id uuid references auth.users(id),
  snapshot_id bigint references public.radar_village_snapshots(id),
  created_at timestamptz not null default now()
);

create table if not exists public.radar_gauge_observations (
  id bigint generated always as identity primary key,
  station_id text not null,
  observed_at timestamptz not null,
  rain_mm numeric not null check (rain_mm >= 0),
  interval_minutes integer not null check (interval_minutes > 0),
  quality_flag text not null default 'unchecked',
  source text not null,
  geometry jsonb,
  unique (station_id, observed_at, interval_minutes)
);

create index if not exists radar_snapshots_village_time_idx
  on public.radar_village_snapshots (village_id, observed_at desc);
create index if not exists radar_alert_events_village_time_idx
  on public.radar_alert_events (village_id, created_at desc);
create index if not exists radar_alert_events_actor_idx
  on public.radar_alert_events (actor_id);
create index if not exists radar_alert_events_snapshot_idx
  on public.radar_alert_events (snapshot_id);
create index if not exists radar_gauges_station_time_idx
  on public.radar_gauge_observations (station_id, observed_at desc);

alter table public.radar_forecast_runs enable row level security;
alter table public.radar_village_snapshots enable row level security;
alter table public.radar_alert_states enable row level security;
alter table public.radar_alert_events enable row level security;
alter table public.radar_gauge_observations enable row level security;

create policy "public can read forecast run provenance"
  on public.radar_forecast_runs for select to anon, authenticated using (true);
create policy "public can read village snapshots"
  on public.radar_village_snapshots for select to anon, authenticated using (true);
create policy "authenticated operators can read alert state"
  on public.radar_alert_states for select to authenticated using (true);
create policy "authenticated operators can read alert audit events"
  on public.radar_alert_events for select to authenticated using (true);

-- Keep API privileges explicit. RLS remains the row-level enforcement layer,
-- while grants prevent clients from attempting operations they never need.
revoke all on table
  public.radar_forecast_runs,
  public.radar_village_snapshots,
  public.radar_alert_states,
  public.radar_alert_events,
  public.radar_gauge_observations
from anon, authenticated;

grant select on table
  public.radar_forecast_runs,
  public.radar_village_snapshots
to anon, authenticated;

grant select on table
  public.radar_alert_states,
  public.radar_alert_events
to authenticated;

-- Writes intentionally have no client policy. A reviewed server-side ingestion
-- worker uses the service role; never expose that key to the browser.
