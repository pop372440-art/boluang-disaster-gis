-- Version matches the migration recorded by the confirmed Supabase project.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

alter table public.radar_gauge_observations
  add column if not exists source_record_id text,
  add column if not exists station_name text,
  add column if not exists agency_code text,
  add column if not exists agency_name text,
  add column if not exists fetched_at timestamptz not null default now(),
  add column if not exists source_url text,
  add column if not exists raw_hash text,
  add column if not exists distance_km numeric check (distance_km >= 0),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.radar_gauge_observations
  add constraint radar_gauge_real_source_only
  check (source !~* '(mock|simulat|virtual|fake|test|demo)');

create index if not exists radar_gauges_source_time_idx
  on public.radar_gauge_observations (source, observed_at desc);

create table if not exists public.radar_gauge_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source !~* '(mock|simulat|virtual|fake|test|demo)'),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  fetched_count integer not null default 0 check (fetched_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  written_count integer not null default 0 check (written_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  source_observed_max timestamptz,
  payload_hash text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists radar_gauge_runs_source_started_idx
  on public.radar_gauge_ingestion_runs (source, started_at desc);

alter table public.radar_gauge_ingestion_runs enable row level security;
revoke all on table public.radar_gauge_ingestion_runs from anon, authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'radar_project_url')
     or not exists (select 1 from vault.secrets where name = 'radar_publishable_key') then
    raise exception 'Required radar Edge Function secrets are missing from Supabase Vault';
  end if;
end;
$$;

select cron.schedule(
  'ingest-thaiwater-rain-hourly',
  '7 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'radar_project_url')
        || '/functions/v1/ingest-thaiwater-rain',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'radar_publishable_key'
        )
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 30000
    );
  $job$
);
