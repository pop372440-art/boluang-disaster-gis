-- Staff LINE is an escalation channel, not a duplicate destination for every
-- alert. Retire only unsent preliminary rows; sent delivery history remains
-- immutable for audit purposes. All candidates remain in Staff Portal.
update public.environment_notification_outbox as outbox
set
  status = 'dead',
  last_error = 'policy: routine staff LINE retired; monitor in Staff Portal',
  next_attempt_at = now()
from public.environment_alert_candidates as candidate
where outbox.candidate_id = candidate.id
  and outbox.audience = 'staff'
  and outbox.notification_kind = 'preliminary'
  and outbox.status in ('pending', 'failed')
  and candidate.level <> 'critical';
