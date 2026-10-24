-- =============================================================================
-- Migration: PayChaser Automatic Invoice Reminders & Schema Integrity Fix
-- Additive, backward-compatible, strictly scoped to PayChaser.
-- Preserves all existing tables, profiles, roles, and receipt workflows.
-- =============================================================================

-- 1. Ensure pc_invoices has required columns for balances, contacts, and JobFlow links
ALTER TABLE public.pc_invoices
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS source_job_id uuid REFERENCES public.jf_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_quote_id uuid REFERENCES public.jf_quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS balance_kobo bigint;

-- Safe balance backfill: preserve existing data and never assume arbitrary amounts
DO $$
BEGIN
  -- If pc_payments exists, backfill based on actual recorded payments
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pc_payments') THEN
    UPDATE public.pc_invoices inv
    SET balance_kobo = CASE
      WHEN inv.status = 'paid' THEN 0
      ELSE GREATEST(0, inv.amount_kobo - COALESCE((
        SELECT sum(amount_kobo) FROM public.pc_payments p WHERE p.invoice_id = inv.id
      ), 0))
    END
    WHERE inv.balance_kobo IS NULL;
  ELSE
    -- If no payments table exists yet, paid is 0 and unpaid/sent/draft equals amount_kobo
    UPDATE public.pc_invoices inv
    SET balance_kobo = CASE
      WHEN inv.status = 'paid' THEN 0
      ELSE inv.amount_kobo
    END
    WHERE inv.balance_kobo IS NULL;
  END IF;
END $$;

-- Set default and non-null on balance_kobo once backfilled
ALTER TABLE public.pc_invoices
  ALTER COLUMN balance_kobo SET DEFAULT 0,
  ALTER COLUMN balance_kobo SET NOT NULL;

-- Safe unique indexes for JobFlow links: check for duplicate links before index creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pc_invoices
    WHERE source_job_id IS NOT NULL
    GROUP BY source_job_id
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS pc_invoices_source_job_id_uidx
      ON public.pc_invoices (source_job_id)
      WHERE source_job_id IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pc_invoices
    WHERE source_quote_id IS NOT NULL
    GROUP BY source_quote_id
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS pc_invoices_source_quote_id_uidx
      ON public.pc_invoices (source_quote_id)
      WHERE source_quote_id IS NOT NULL;
  END IF;
END $$;

-- 2. Extend pc_reminders table with delivery status, tracking, and bounded retries
ALTER TABLE public.pc_reminders
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS recipient text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS retry_after timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Ensure check constraint on pc_reminders.status
DO $$
BEGIN
  ALTER TABLE public.pc_reminders DROP CONSTRAINT IF EXISTS pc_reminders_status_check;
  ALTER TABLE public.pc_reminders
    ADD CONSTRAINT pc_reminders_status_check
    CHECK (status IN (
      'queued',
      'sending',
      'provider_accepted',
      'delivered',
      'retryable_failure',
      'exhausted',
      'failed',
      'skipped',
      'not_configured',
      'legacy'
    ));
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- Preserve historical reminders accurately: label existing records as legacy so they
-- are clearly identified in UI history and do not pretend to be provider deliveries
UPDATE public.pc_reminders
SET status = 'legacy'
WHERE status IS NULL OR status = 'delivered';

-- Deduplication index: Prevents duplicate active reminders for same invoice, stage and channel.
-- Includes legacy, provider_accepted, delivered, queued, sending.
DROP INDEX IF EXISTS public.pc_reminders_active_dedup_idx;
CREATE UNIQUE INDEX IF NOT EXISTS pc_reminders_active_dedup_idx
  ON public.pc_reminders (invoice_id, stage, channel)
  WHERE status IN ('queued', 'sending', 'provider_accepted', 'delivered', 'legacy');

-- Unique index for idempotency key if supplied
CREATE UNIQUE INDEX IF NOT EXISTS pc_reminders_idempotency_key_idx
  ON public.pc_reminders (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

-- Index for scheduler claiming and retry scans
CREATE INDEX IF NOT EXISTS pc_reminders_status_retry_idx
  ON public.pc_reminders (status, retry_after)
  WHERE status IN ('queued', 'sending', 'retryable_failure');

-- 3. Owner-configurable reminder automation settings
CREATE TABLE IF NOT EXISTS public.pc_reminder_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  sms_enabled boolean NOT NULL DEFAULT false,
  remind_before_due boolean NOT NULL DEFAULT true,
  days_before_due integer NOT NULL DEFAULT 3 CHECK (days_before_due >= 1 AND days_before_due <= 30),
  remind_on_due_date boolean NOT NULL DEFAULT true,
  remind_overdue_3 boolean NOT NULL DEFAULT true,
  remind_overdue_7 boolean NOT NULL DEFAULT true,
  remind_overdue_14 boolean NOT NULL DEFAULT true,
  custom_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.pc_reminder_settings TO authenticated;
GRANT ALL ON public.pc_reminder_settings TO service_role;

ALTER TABLE public.pc_reminder_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pc_reminder_settings' AND policyname = 'pc_reminder_settings_owner_select') THEN
    CREATE POLICY pc_reminder_settings_owner_select ON public.pc_reminder_settings
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id AND public.has_tool(auth.uid(), 'paychaser'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pc_reminder_settings' AND policyname = 'pc_reminder_settings_owner_insert') THEN
    CREATE POLICY pc_reminder_settings_owner_insert ON public.pc_reminder_settings
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id AND public.has_tool(auth.uid(), 'paychaser'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pc_reminder_settings' AND policyname = 'pc_reminder_settings_owner_update') THEN
    CREATE POLICY pc_reminder_settings_owner_update ON public.pc_reminder_settings
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id AND public.has_tool(auth.uid(), 'paychaser'))
      WITH CHECK (auth.uid() = user_id AND public.has_tool(auth.uid(), 'paychaser'));
  END IF;
END $$;

-- 4. Automation logs table for audit trail
CREATE TABLE IF NOT EXISTS public.pc_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.pc_invoices(id) ON DELETE CASCADE,
  action text NOT NULL,
  status text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pc_automation_logs_user_idx ON public.pc_automation_logs(user_id, created_at DESC);
GRANT SELECT ON public.pc_automation_logs TO authenticated;
GRANT ALL ON public.pc_automation_logs TO service_role;

ALTER TABLE public.pc_automation_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pc_automation_logs' AND policyname = 'pc_automation_logs_owner_select') THEN
    CREATE POLICY pc_automation_logs_owner_select ON public.pc_automation_logs
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Concurrency-safe atomic claim RPC for backend worker
DROP FUNCTION IF EXISTS public.claim_due_invoice_reminders(int);
DROP FUNCTION IF EXISTS public.claim_due_invoice_reminders(int, uuid);

CREATE OR REPLACE FUNCTION public.claim_due_invoice_reminders(
  p_limit int DEFAULT 50,
  p_target_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_reminder_id uuid,
  out_invoice_id uuid,
  out_user_id uuid,
  out_customer_name text,
  out_customer_email text,
  out_customer_phone text,
  out_amount_kobo bigint,
  out_balance_kobo bigint,
  out_due_date date,
  out_stage text,
  out_channel text,
  out_custom_note text,
  out_attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  today_date date := CURRENT_DATE;
BEGIN
  -- Step 1: Recover stranded rows in 'sending' status for > 15 minutes
  UPDATE public.pc_reminders r
  SET
    status = CASE WHEN r.attempt_count >= 3 THEN 'exhausted' ELSE 'retryable_failure' END,
    retry_after = CASE WHEN r.attempt_count >= 3 THEN NULL ELSE now() + interval '1 hour' END,
    error_message = 'Execution timed out before completion.',
    updated_at = now()
  WHERE r.status = 'sending'
    AND r.last_attempt_at < (now() - interval '15 minutes')
    AND (p_target_user_id IS NULL OR r.user_id = p_target_user_id);

  -- Step 2: Return claimed tasks (both eligible retries and new milestone triggers)
  RETURN QUERY
  WITH
  -- 2A. Retry tasks: existing rows that failed and are ready for retry
  eligible_retries AS (
    SELECT
      r.id AS ret_id,
      r.invoice_id AS ret_invoice_id,
      r.user_id AS ret_user_id,
      r.stage AS ret_stage,
      r.channel AS ret_channel,
      r.recipient AS ret_recipient,
      r.attempt_count AS ret_attempt_count
    FROM public.pc_reminders r
    JOIN public.pc_invoices inv ON inv.id = r.invoice_id
    WHERE r.status = 'retryable_failure'
      AND r.retry_after <= now()
      AND r.attempt_count < 3
      AND inv.status IN ('sent', 'unpaid')
      AND inv.balance_kobo > 0
      AND (p_target_user_id IS NULL OR r.user_id = p_target_user_id)
      AND public.has_tool(r.user_id, 'paychaser')
    LIMIT p_limit
    FOR UPDATE OF r SKIP LOCKED
  ),
  claimed_retries AS (
    UPDATE public.pc_reminders r
    SET
      status = 'sending',
      attempt_count = r.attempt_count + 1,
      last_attempt_at = now(),
      updated_at = now()
    FROM eligible_retries er
    WHERE r.id = er.ret_id
    RETURNING
      r.id AS claimed_id,
      r.invoice_id AS claimed_invoice_id,
      r.user_id AS claimed_user_id,
      r.stage AS claimed_stage,
      r.channel AS claimed_channel,
      r.recipient AS claimed_recipient,
      r.attempt_count AS claimed_attempts
  ),

  -- 2B. New milestone candidates
  candidate_invoices AS (
    SELECT
      inv.id AS c_invoice_id,
      inv.user_id AS c_user_id,
      inv.customer AS c_customer,
      COALESCE(inv.customer_email, '') AS c_email,
      COALESCE(inv.customer_phone, '') AS c_phone,
      inv.amount_kobo AS c_amount,
      inv.balance_kobo AS c_balance,
      inv.due_date AS c_due_date,
      s.days_before_due AS c_days_before,
      s.custom_note AS c_note,
      s.email_enabled AS c_email_enabled,
      s.whatsapp_enabled AS c_whatsapp_enabled,
      s.sms_enabled AS c_sms_enabled,
      s.remind_before_due AS c_remind_before,
      s.remind_on_due_date AS c_remind_due,
      s.remind_overdue_3 AS c_remind_ov3,
      s.remind_overdue_7 AS c_remind_ov7,
      s.remind_overdue_14 AS c_remind_ov14
    FROM public.pc_invoices inv
    JOIN public.pc_reminder_settings s ON s.user_id = inv.user_id
    WHERE (p_target_user_id IS NULL OR inv.user_id = p_target_user_id)
      AND inv.status IN ('sent', 'unpaid')
      AND inv.balance_kobo > 0
      AND public.has_tool(inv.user_id, 'paychaser')
  ),
  evaluated_stages AS (
    SELECT c.*, 'before_due'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_before AND today_date = (c.c_due_date - (c.c_days_before || ' days')::interval)::date
    UNION ALL
    SELECT c.*, 'due_date'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_due AND today_date = c.c_due_date
    UNION ALL
    SELECT c.*, 'overdue_3'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_ov3 AND today_date = (c.c_due_date + interval '3 days')::date
    UNION ALL
    SELECT c.*, 'overdue_7'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_ov7 AND today_date = (c.c_due_date + interval '7 days')::date
    UNION ALL
    SELECT c.*, 'overdue_14'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_ov14 AND today_date = (c.c_due_date + interval '14 days')::date
  ),
  eligible_channels AS (
    -- Email channel (active)
    SELECT e.*, 'email'::text AS eval_channel, e.c_email AS eval_recipient
    FROM evaluated_stages e
    WHERE e.c_email_enabled AND length(trim(e.c_email)) > 3 AND position('@' in e.c_email) > 1
    UNION ALL
    -- WhatsApp channel (when enabled)
    SELECT e.*, 'whatsapp'::text AS eval_channel, e.c_phone AS eval_recipient
    FROM evaluated_stages e
    WHERE e.c_whatsapp_enabled AND length(trim(e.c_phone)) >= 7
    UNION ALL
    -- SMS channel (when enabled)
    SELECT e.*, 'sms'::text AS eval_channel, e.c_phone AS eval_recipient
    FROM evaluated_stages e
    WHERE e.c_sms_enabled AND length(trim(e.c_phone)) >= 7
  ),
  to_dispatch_new AS (
    SELECT ec.*
    FROM eligible_channels ec
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pc_reminders r
      WHERE r.invoice_id = ec.c_invoice_id
        AND r.stage = ec.eval_stage
        AND r.channel = ec.eval_channel
        AND r.status IN ('queued', 'sending', 'provider_accepted', 'delivered', 'retryable_failure', 'exhausted', 'legacy')
    )
    LIMIT GREATEST(0, p_limit - (SELECT count(*)::int FROM claimed_retries))
  ),
  claimed_new AS (
    INSERT INTO public.pc_reminders (
      user_id,
      invoice_id,
      stage,
      channel,
      recipient,
      status,
      note,
      attempt_count,
      last_attempt_at
    )
    SELECT
      td.c_user_id,
      td.c_invoice_id,
      td.eval_stage,
      td.eval_channel,
      td.eval_recipient,
      'sending',
      COALESCE(td.c_note, ''),
      1,
      now()
    FROM to_dispatch_new td
    ON CONFLICT (invoice_id, stage, channel) WHERE status IN ('queued', 'sending', 'provider_accepted', 'delivered', 'legacy')
    DO NOTHING
    RETURNING
      id AS claimed_id,
      invoice_id AS claimed_invoice_id,
      user_id AS claimed_user_id,
      stage AS claimed_stage,
      channel AS claimed_channel,
      recipient AS claimed_recipient,
      attempt_count AS claimed_attempts
  ),
  all_claimed AS (
    SELECT * FROM claimed_retries
    UNION ALL
    SELECT * FROM claimed_new
  )
  SELECT
    ac.claimed_id AS out_reminder_id,
    ac.claimed_invoice_id AS out_invoice_id,
    ac.claimed_user_id AS out_user_id,
    inv.customer AS out_customer_name,
    COALESCE(inv.customer_email, '') AS out_customer_email,
    COALESCE(inv.customer_phone, '') AS out_customer_phone,
    inv.amount_kobo AS out_amount_kobo,
    inv.balance_kobo AS out_balance_kobo,
    inv.due_date AS out_due_date,
    ac.claimed_stage AS out_stage,
    ac.claimed_channel AS out_channel,
    COALESCE(s.custom_note, '') AS out_custom_note,
    ac.claimed_attempts AS out_attempt_count
  FROM all_claimed ac
  JOIN public.pc_invoices inv ON inv.id = ac.claimed_invoice_id
  LEFT JOIN public.pc_reminder_settings s ON s.user_id = ac.claimed_user_id;
END;
$$;

-- Security: Revoke execute from unauthenticated or regular authenticated users;
-- only the service-role worker can claim reminder batches.
REVOKE EXECUTE ON FUNCTION public.claim_due_invoice_reminders(int, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_invoice_reminders(int, uuid) TO service_role;

-- 6. RPC to record provider delivery result or status update
DROP FUNCTION IF EXISTS public.record_reminder_delivery_result(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.record_reminder_delivery_result(
  p_reminder_id uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rem_row record;
  inv_row record;
  new_status text;
  next_retry timestamptz;
BEGIN
  SELECT * INTO rem_row FROM public.pc_reminders WHERE id = p_reminder_id FOR UPDATE;
  IF rem_row.id IS NULL THEN
    RAISE EXCEPTION 'reminder_not_found';
  END IF;

  SELECT * INTO inv_row FROM public.pc_invoices WHERE id = rem_row.invoice_id;

  IF p_status = 'provider_accepted' THEN
    UPDATE public.pc_reminders
    SET
      status = 'provider_accepted',
      provider_message_id = p_provider_message_id,
      error_message = NULL,
      retry_after = NULL,
      updated_at = now()
    WHERE id = p_reminder_id;

    -- Audit log in pc_automation_logs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pc_automation_logs') THEN
      INSERT INTO public.pc_automation_logs (
        user_id,
        invoice_id,
        action,
        status,
        details
      ) VALUES (
        rem_row.user_id,
        rem_row.invoice_id,
        'reminder_provider_accepted',
        'success',
        jsonb_build_object(
          'reminder_id', p_reminder_id,
          'stage', rem_row.stage,
          'channel', rem_row.channel,
          'recipient', rem_row.recipient,
          'provider_message_id', p_provider_message_id,
          'customer', inv_row.customer
        )
      );
    END IF;

  ELSIF p_status = 'delivered' THEN
    UPDATE public.pc_reminders
    SET
      status = 'delivered',
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      error_message = NULL,
      retry_after = NULL,
      updated_at = now()
    WHERE id = p_reminder_id;

  ELSIF p_status = 'failed' THEN
    IF rem_row.attempt_count >= 3 THEN
      new_status := 'exhausted';
      next_retry := NULL;
    ELSE
      new_status := 'retryable_failure';
      next_retry := now() + (rem_row.attempt_count * interval '2 hours');
    END IF;

    UPDATE public.pc_reminders
    SET
      status = new_status,
      retry_after = next_retry,
      error_message = p_error_message,
      updated_at = now()
    WHERE id = p_reminder_id;

    -- Audit log in pc_automation_logs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pc_automation_logs') THEN
      INSERT INTO public.pc_automation_logs (
        user_id,
        invoice_id,
        action,
        status,
        details
      ) VALUES (
        rem_row.user_id,
        rem_row.invoice_id,
        'reminder_failed',
        'error',
        jsonb_build_object(
          'reminder_id', p_reminder_id,
          'stage', rem_row.stage,
          'channel', rem_row.channel,
          'attempt_count', rem_row.attempt_count,
          'final_status', new_status,
          'error', p_error_message
        )
      );
    END IF;

  ELSIF p_status = 'not_configured' THEN
    UPDATE public.pc_reminders
    SET
      status = 'not_configured',
      error_message = p_error_message,
      retry_after = NULL,
      updated_at = now()
    WHERE id = p_reminder_id;

  ELSIF p_status = 'skipped' THEN
    UPDATE public.pc_reminders
    SET
      status = 'skipped',
      error_message = p_error_message,
      retry_after = NULL,
      updated_at = now()
    WHERE id = p_reminder_id;

  ELSE
    RAISE EXCEPTION 'invalid_status: %', p_status;
  END IF;
END;
$$;

-- Security: Revoke execute from unauthenticated or regular authenticated users;
-- only the service-role worker can update delivery records.
REVOKE EXECUTE ON FUNCTION public.record_reminder_delivery_result(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_reminder_delivery_result(uuid, text, text, text) TO service_role;
