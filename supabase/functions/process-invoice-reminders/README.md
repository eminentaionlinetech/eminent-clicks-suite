# PayChaser automatic invoice reminders

This Edge Function processes reminders for PayChaser invoices only. It uses backend-only secrets and requires a `Bearer` token matching `CRON_SECRET`.

## Required Supabase secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (generate and store securely; never commit)

Email (Resend):
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (verified sender)

WhatsApp Business Cloud API:
- `META_WHATSAPP_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_TEMPLATE_NAME` (approved template)
- `META_WHATSAPP_LANGUAGE_CODE` (optional; defaults to `en`)

SMS (Termii):
- `TERMII_API_KEY`
- `TERMII_SENDER_ID` (approved sender)

Missing provider credentials are recorded as `not_configured`; queued claims are not reported as delivered.

## Scheduler

No schedule is installed by this function. Configure Supabase Cron (`pg_cron`/`pg_net`) in the target staging project to POST to the Edge Function once per hour. Include `Authorization: Bearer <CRON_SECRET>`. Run against a staging Supabase project first, and do not use production credentials until separately approved.
