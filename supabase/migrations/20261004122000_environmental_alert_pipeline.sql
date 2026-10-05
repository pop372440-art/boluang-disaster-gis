create extension if not exists pgcrypto;

create table if not exists public.environment_observations (
  id uuid primary key default gen_random_uuid(),
  observed_at timestamptz not null,
  fetched_at timestamptz not null,
  pm25_ug_m3 numeric check (pm25_ug_m3 is null or pm25_ug_m3 >= 0),
  pm25_quality text not null check (pm25_quality in ('fresh', 'stale', 'expired', 'invalid_schema', 'unknown')),
  hotspot_count integer check (hotspot_count is null or hotspot_count >= 0),
  hotspot_quality text not null check (hotspot_quality in ('fresh', 'stale', 'expired', 'invalid_schema', 'unknown')),
  satellite_types text[] not null default '{}',
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.environment_alert_candidates (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('satellite', 'model', 'citizen_report')),
  level text not null check (level in ('watch', 'warning', 'critical')),
  status text not null check (status in ('proposed', 'approved', 'rejected', 'cancelled')),
  reason text not null check (char_length(reason) between 3 and 2000),
  evidence jsonb not null default '{}'::jsonb,
  village_name text,
  risk_type text,
  report_id uuid references public.boluang_disaster_reports(id) on delete set null,
  observation_id uuid references public.environment_observations(id) on delete set null,
  dedupe_key text not null unique,
  occurred_at timestamptz not null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.line_group_destinations (
  id uuid primary key default gen_random_uuid(),
  line_target_id text not null unique,
  target_type text not null check (target_type in ('group', 'room', 'user')),
  audience text not null unique check (audience in ('staff', 'public')),
  display_name text,
  active boolean not null default true,
  registered_at timestamptz not null default now(),
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.environment_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.environment_alert_candidates(id) on delete cascade,
  audience text not null check (audience in ('staff', 'public')),
  status text not null check (status in ('pending', 'processing', 'sent', 'failed', 'dead')),
  payload jsonb not null default '{}'::jsonb,
  retry_key uuid not null unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, audience)
);

create table if not exists public.environment_notification_deliveries (
  id bigint generated always as identity primary key,
  outbox_id uuid not null references public.environment_notification_outbox(id) on delete cascade,
  line_target_id text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_status integer,
  provider_response text,
  created_at timestamptz not null default now()
);

alter table public.staff_audit_log
  add column if not exists alert_candidate_id uuid references public.environment_alert_candidates(id) on delete set null;

create or replace function public.review_environment_alert_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_note text,
  p_actor_id uuid,
  p_actor_role public.staff_role,
  p_ip_hash text,
  p_session_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  previous_row public.environment_alert_candidates%rowtype;
  reviewed_row public.environment_alert_candidates%rowtype;
  next_status text;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision';
  end if;
  if char_length(trim(p_note)) < 3 then
    raise exception 'review note too short';
  end if;
  next_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;

  select * into previous_row from public.environment_alert_candidates
  where id = p_candidate_id for update;
  if not found then raise exception 'candidate not found'; end if;
  if previous_row.status <> 'proposed' then raise exception 'candidate already reviewed'; end if;

  update public.environment_alert_candidates set
    status = next_status,
    reviewed_at = now(),
    reviewed_by = p_actor_id,
    review_note = trim(p_note),
    updated_at = now()
  where id = p_candidate_id
  returning * into reviewed_row;

  if next_status = 'approved' then
    insert into public.environment_notification_outbox (candidate_id, audience, status, retry_key, payload)
    values (p_candidate_id, 'public', 'pending', gen_random_uuid(), jsonb_build_object('candidateId', p_candidate_id))
    on conflict (candidate_id, audience) do nothing;
  end if;

  insert into public.staff_audit_log (
    alert_candidate_id, actor_id, actor_role, action, old_data, new_data, ip_hash, session_hash
  ) values (
    p_candidate_id, p_actor_id, p_actor_role,
    case when next_status = 'approved' then 'environment_alert_approved' else 'environment_alert_rejected' end,
    to_jsonb(previous_row), to_jsonb(reviewed_row), p_ip_hash, p_session_hash
  );

  return jsonb_build_object('id', reviewed_row.id, 'status', reviewed_row.status);
end;
$$;

revoke all on function public.review_environment_alert_candidate(uuid, text, text, uuid, public.staff_role, text, text) from public, anon, authenticated;
grant execute on function public.review_environment_alert_candidate(uuid, text, text, uuid, public.staff_role, text, text) to service_role;

create index if not exists environment_observations_time_idx on public.environment_observations (observed_at desc);
create index if not exists environment_candidates_status_time_idx on public.environment_alert_candidates (status, created_at desc);
create index if not exists environment_candidates_report_idx on public.environment_alert_candidates (report_id) where report_id is not null;
create index if not exists environment_outbox_due_idx on public.environment_notification_outbox (status, next_attempt_at) where status in ('pending', 'failed');
create index if not exists environment_deliveries_outbox_idx on public.environment_notification_deliveries (outbox_id, created_at desc);
create index if not exists staff_audit_alert_candidate_idx on public.staff_audit_log (alert_candidate_id) where alert_candidate_id is not null;

alter table public.environment_observations enable row level security;
alter table public.environment_alert_candidates enable row level security;
alter table public.line_group_destinations enable row level security;
alter table public.environment_notification_outbox enable row level security;
alter table public.environment_notification_deliveries enable row level security;

revoke all on table
  public.environment_observations,
  public.environment_alert_candidates,
  public.line_group_destinations,
  public.environment_notification_outbox,
  public.environment_notification_deliveries
from anon, authenticated;

-- No client-side write policies are intentional. The service role writes observations,
-- candidates and outbox rows; staff access is mediated by MFA/RBAC-protected API routes.
