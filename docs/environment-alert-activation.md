# Environmental monitor and LINE activation gate

This feature is decision support. A candidate is not a public warning until an `approver` or `admin` with MFA approves it in Staff Portal.

## Required secrets

Set different values for Preview and Production. Never expose these with `NEXT_PUBLIC_`:

- `ENVIRONMENT_MONITOR_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_GROUP_REGISTRATION_TOKEN`
- optional fallback `LINE_ALERT_STAFF_GROUP_ID`
- optional fallback `LINE_ALERT_PUBLIC_GROUP_ID`

The LINE webhook URL is `/api/line/webhook`. It verifies the exact raw request body with HMAC-SHA256 before parsing. Enable “Allow bot to join group chats” in LINE Developers.

Register a group by sending one signed webhook message inside that group:

`ลงทะเบียนกลุ่ม เจ้าหน้าที่ <LINE_GROUP_REGISTRATION_TOKEN>`

or:

`ลงทะเบียนกลุ่ม สาธารณะ <LINE_GROUP_REGISTRATION_TOKEN>`

Rotate the registration token after group setup.

## Scheduling

After the production deployment contains `/api/cron/environment-monitor`, schedule an authenticated GET every 15 minutes. Use Supabase Cron with Vault or Vercel Cron on a plan that supports this cadence. Send:

`Authorization: Bearer <ENVIRONMENT_MONITOR_SECRET>`

Do not schedule a Preview URL as the production monitor. Confirm each run writes `environment_observations`, creates no candidate from stale/expired data, and records LINE delivery results.

## Historical validation gate

Export verified observations and confirmed incidents as a JSON array matching `HistoricalEnvironmentalRow`, then run:

`npm run backtest:environment -- path/to/verified-history.json`

The command only scores 1 January–31 May 2026 (พ.ศ. 2569) and fails when that period has no real records. Synthetic fixtures validate code only; they are not evidence that the warning thresholds are accurate. Complete a staff drill before 1 January 2027 (พ.ศ. 2570).
