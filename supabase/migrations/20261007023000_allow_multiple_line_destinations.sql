-- A single audience can contain several LINE groups (for example the public
-- wildfire group and the public warning network). Keep each LINE target unique
-- while allowing every active group in an audience to receive an alert.
alter table public.line_group_destinations
  drop constraint if exists line_group_destinations_audience_key;

alter table public.line_group_destinations
  add column if not exists routing_scope text not null default 'general';

alter table public.line_group_destinations
  drop constraint if exists line_group_destinations_routing_scope_check;

alter table public.line_group_destinations
  add constraint line_group_destinations_routing_scope_check
  check (routing_scope in ('all', 'wildfire', 'general'));

-- The currently registered public destination is the existing Singh Fire
-- group. Staff always receives every operational alert.
update public.line_group_destinations
set routing_scope = case when audience = 'staff' then 'all' else 'wildfire' end;

create index if not exists line_group_destinations_active_audience_idx
  on public.line_group_destinations (audience, routing_scope, active)
  where active = true;
