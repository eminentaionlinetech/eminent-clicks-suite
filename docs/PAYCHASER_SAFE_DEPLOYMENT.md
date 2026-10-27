# Eminent Clicks: PayChaser Safe Deployment Runbook

Target Supabase Project: `aqnnjcjemhdablsbxlah`  
Branch: `feature/automated-invoice-reminders-jobflow`  
Target Email Sender: `Eminent Clicks <notifications@eminentclick.com.ng>`

---

## Safety Guarantees
1. **Zero Data Mutation During Diagnostics:** Preflight and smoke checks are strictly read-only.
2. **No Hardcoded Secrets:** Credentials (`RESEND_API_KEY`, `CRON_SECRET`, service-role keys) are managed exclusively through secure environment secrets and never committed to Git.
3. **Preservation of Existing Data:** Invoices, payments, user authentication, and unrelated suite modules are preserved.

---

## Deployment Procedure (Stage-by-Stage)

### Stage 1: Read-Only Preflight
From your local environment connected to project `aqnnjcjemhdablsbxlah`:
```bash
git checkout feature/automated-invoice-reminders-jobflow
git pull origin feature/automated-invoice-reminders-jobflow
chmod +x scripts/paychaser-preflight.sh scripts/paychaser-smoke-test.sh
./scripts/paychaser-preflight.sh
```
The script validates branch, configuration, CLI authentication, and runs `supabase db push --dry-run --linked` without executing SQL.

### Stage 2: Database Migration
Once verified against live migration history:
```bash
supabase db push --linked
```
This applies `supabase/migrations/20261017100000_paychaser_automatic_reminders.sql`.

### Stage 3: Edge Function & Secrets Configuration
Set project secrets in Supabase:
```bash
supabase secrets set RESEND_API_KEY="<your_resend_api_key>"
supabase secrets set RESEND_FROM_EMAIL="Eminent Clicks <notifications@eminentclick.com.ng>"
supabase secrets set CRON_SECRET="<generate_secure_random_cron_secret>"
```
Deploy the function:
```bash
supabase functions deploy process-invoice-reminders --no-verify-jwt
```

### Stage 4: Non-Mutating Smoke Check
Run the smoke check using a short-lived test user session token:
```bash
USER_JWT="<test_user_jwt>" ./scripts/paychaser-smoke-test.sh
```
This confirms function runtime, RPC compatibility, and Resend domain verification without sending emails or mutating invoices.

### Stage 5: Scheduler Configuration
Configure scheduled invocations using Supabase Vault and `pg_cron` / `pg_net` to call `process-invoice-reminders` with `CRON_SECRET`.
