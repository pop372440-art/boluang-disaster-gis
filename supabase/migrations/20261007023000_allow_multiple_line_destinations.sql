-- A single audience can contain several LINE groups (for example the public
-- wildfire group and the public warning network). Keep each LINE target unique
-- while allowing every active group in an audience to receive an alert.
alter table public.line_group_destinations
  drop constraint if exists line_group_destinations_audience_key;

create index if not exists line_group_destinations_active_audience_idx
  on public.line_group_destinations (audience, active)
  where active = true;
