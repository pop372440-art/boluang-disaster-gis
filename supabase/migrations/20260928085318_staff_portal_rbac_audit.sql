create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$
begin
  create type public.staff_role as enum ('viewer', 'operator', 'approver', 'admin');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.staff_role not null default 'viewer',
  active boolean not null default true,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_profiles enable row level security;
revoke all on public.staff_profiles from anon, authenticated;

with ranked_users as (
  select id, row_number() over (order by created_at, id) as sequence
  from auth.users
)
insert into public.staff_profiles (user_id, role)
select id, case when sequence = 1 then 'admin'::public.staff_role else 'operator'::public.staff_role end
from ranked_users
on conflict (user_id) do nothing;

create or replace function private.create_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff_profiles (user_id, role)
  values (new.id, 'viewer'::public.staff_role)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_staff_profile() from public, anon, authenticated;

drop trigger if exists create_staff_profile_after_signup on auth.users;
create trigger create_staff_profile_after_signup
after insert on auth.users
for each row execute function private.create_staff_profile();

create table if not exists public.staff_case_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.boluang_disaster_reports(id) on delete restrict,
  action_kind text not null check (action_kind in ('field_action', 'closure_request', 'closure_approval', 'closure_rejection')),
  details text not null check (char_length(details) between 3 and 4000),
  image_paths text[] not null default '{}',
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_role public.staff_role not null,
  ip_hash text,
  session_hash text,
  created_at timestamptz not null default now()
);

create index if not exists staff_case_actions_report_created_idx
  on public.staff_case_actions (report_id, created_at desc);
alter table public.staff_case_actions enable row level security;
revoke all on public.staff_case_actions from anon, authenticated;

create table if not exists public.staff_audit_log (
  id bigint generated always as identity primary key,
  report_id uuid references public.boluang_disaster_reports(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role public.staff_role,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  ip_hash text,
  session_hash text,
  created_at timestamptz not null default now()
);

create index if not exists staff_audit_log_report_created_idx
  on public.staff_audit_log (report_id, created_at desc);
alter table public.staff_audit_log enable row level security;
revoke all on public.staff_audit_log from anon, authenticated;

alter table public.boluang_disaster_reports
  add column if not exists workflow_state text not null default 'received',
  add column if not exists closure_requested_at timestamptz,
  add column if not exists closure_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approval_note text,
  add column if not exists last_modified_at timestamptz,
  add column if not exists last_modified_by uuid references auth.users(id) on delete set null,
  add column if not exists last_modified_role public.staff_role,
  add column if not exists last_ip_hash text,
  add column if not exists last_session_hash text;

update public.boluang_disaster_reports
set workflow_state = case
  when status = 'ดำเนินการเสร็จแล้ว' then 'closed'
  when status = 'กำลังดำเนินการ' then 'in_progress'
  else 'received'
end
where workflow_state = 'received';

alter table public.boluang_disaster_reports
  drop constraint if exists boluang_disaster_reports_workflow_state_check;
alter table public.boluang_disaster_reports
  add constraint boluang_disaster_reports_workflow_state_check
  check (workflow_state in ('received', 'in_progress', 'pending_approval', 'closed'));

create or replace function private.audit_disaster_report_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff_audit_log (
    report_id, actor_id, actor_role, action, old_data, new_data, ip_hash, session_hash
  ) values (
    new.id,
    new.last_modified_by,
    new.last_modified_role,
    case
      when new.workflow_state = 'closed' and old.workflow_state is distinct from 'closed' then 'closure_approved'
      when new.workflow_state = 'pending_approval' and old.workflow_state is distinct from 'pending_approval' then 'closure_requested'
      when old.workflow_state = 'pending_approval' and new.workflow_state = 'in_progress' then 'closure_rejected'
      else 'report_updated'
    end,
    to_jsonb(old) - array['last_ip_hash', 'last_session_hash'],
    to_jsonb(new) - array['last_ip_hash', 'last_session_hash'],
    new.last_ip_hash,
    new.last_session_hash
  );
  return new;
end;
$$;

revoke all on function private.audit_disaster_report_update() from public, anon, authenticated;

drop trigger if exists audit_disaster_report_update on public.boluang_disaster_reports;
create trigger audit_disaster_report_update
after update on public.boluang_disaster_reports
for each row
when (old is distinct from new)
execute function private.audit_disaster_report_update();
