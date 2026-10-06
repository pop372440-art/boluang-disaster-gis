alter table public.environment_notification_outbox
  add column if not exists notification_kind text not null default 'preliminary'
  check (notification_kind in ('preliminary', 'official_confirmed', 'official_rejected'));

alter table public.environment_notification_outbox
  drop constraint if exists environment_notification_outbox_candidate_id_audience_key;

create unique index if not exists environment_outbox_candidate_audience_kind_uidx
  on public.environment_notification_outbox (candidate_id, audience, notification_kind);

update public.environment_notification_outbox
set payload = payload || jsonb_build_object('notificationKind', notification_kind)
where not (payload ? 'notificationKind');

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
  notification_kind text;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision';
  end if;
  if char_length(trim(p_note)) < 3 then
    raise exception 'review note too short';
  end if;
  next_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;
  notification_kind := case when p_decision = 'approve' then 'official_confirmed' else 'official_rejected' end;

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

  insert into public.environment_notification_outbox (
    candidate_id, audience, notification_kind, status, retry_key, payload
  ) values (
    p_candidate_id, 'public', notification_kind, 'pending', gen_random_uuid(),
    jsonb_build_object('candidateId', p_candidate_id, 'notificationKind', notification_kind)
  )
  on conflict (candidate_id, audience, notification_kind) do nothing;

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

revoke all on function public.review_environment_alert_candidate(uuid, text, text, uuid, public.staff_role, text, text)
from public, anon, authenticated;
grant execute on function public.review_environment_alert_candidate(uuid, text, text, uuid, public.staff_role, text, text)
to service_role;
