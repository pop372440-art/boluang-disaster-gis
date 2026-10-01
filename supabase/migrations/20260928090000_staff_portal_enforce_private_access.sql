-- Apply only after the server-side incident submission and Staff Portal APIs are deployed.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'boluang_disaster_reports'
  loop
    execute format('drop policy if exists %I on public.boluang_disaster_reports', policy_record.policyname);
  end loop;
end $$;

revoke all on public.boluang_disaster_reports from anon, authenticated;

drop policy if exists "Allow Public Uploads ynu0ly_0" on storage.objects;
drop policy if exists "Allow Public View ynu0ly_0" on storage.objects;

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'disaster_images';

create index if not exists boluang_reports_closure_requested_by_idx
  on public.boluang_disaster_reports (closure_requested_by);
create index if not exists boluang_reports_approved_by_idx
  on public.boluang_disaster_reports (approved_by);
create index if not exists boluang_reports_last_modified_by_idx
  on public.boluang_disaster_reports (last_modified_by);
create index if not exists staff_case_actions_actor_id_idx
  on public.staff_case_actions (actor_id);
create index if not exists staff_audit_log_actor_id_idx
  on public.staff_audit_log (actor_id);
