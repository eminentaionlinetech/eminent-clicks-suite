-- =============================================================================
-- Migration: PayChaser Automatic Invoice Reminders (Email, WhatsApp, SMS)
-- Additive, backward-compatible, strictly scoped to PayChaser reminder delivery.
-- Preserves all existing tables, profiles, roles, and receipt workflows.
-- =============================================================================

-- 1. Extend pc_reminders table with delivery status, recipient, tracking and idempotency
ALTER TABLE public.pc_reminders
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'delivered'
    CHECK (status IN ('queued', 'sending', 'delivered', 'failed', 'skipped', 'not_configured')),
  ADD COLUMN IF NOT EXISTS recipient text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS retry_after timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Deduplication index: Prevents duplicate active reminders for same invoice, stage and channel.
-- A failed or not_configured status is NOT in ('queued', 'sending', 'delivered'), so valid retries are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS pc_reminders_active_dedup_idx
  ON public.pc_reminders (invoice_id, stage, channel)
  WHERE status IN ('queued', 'sending', 'delivered');

-- Unique index for idempotency key if supplied
CREATE UNIQUE INDEX IF NOT EXISTS pc_reminders_idempotency_key_idx
  ON public.pc_reminders (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

-- Index for scheduler claiming and retry scans
CREATE INDEX IF NOT EXISTS pc_reminders_status_retry_idx
  ON public.pc_reminders (status, retry_after)
  WHERE status IN ('queued', 'sending', 'failed');

-- 2. Owner-configurable reminder automation settings
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

-- 3. Concurrency-safe atomic claim RPC for the backend scheduler / worker
DROP FUNCTION IF EXISTS public.claim_due_invoice_reminders(int);
CREATE OR REPLACE FUNCTION public.claim_due_invoice_reminders(p_limit int DEFAULT 50)
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
  caller_uid uuid;
  today_date date := CURRENT_DATE;
BEGIN
  caller_uid := auth.uid();

  RETURN QUERY
  WITH candidate_invoices AS (
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
    WHERE (caller_uid IS NULL OR inv.user_id = caller_uid)
      AND inv.status IN ('sent', 'unpaid')
      AND inv.balance_kobo > 0
      AND public.has_tool(inv.user_id, 'paychaser')
  ),
  evaluated_stages AS (
    -- Before due stage
    SELECT c.*, 'before_due'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_before AND today_date = (c.c_due_date - (c.c_days_before || ' days')::interval)::date
    UNION ALL
    -- Due date stage
    SELECT c.*, 'due_date'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_due AND today_date = c.c_due_date
    UNION ALL
    -- Overdue 3 days stage
    SELECT c.*, 'overdue_3'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_ov3 AND today_date = (c.c_due_date + interval '3 days')::date
    UNION ALL
    -- Overdue 7 days stage
    SELECT c.*, 'overdue_7'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_ov7 AND today_date = (c.c_due_date + interval '7 days')::date
    UNION ALL
    -- Overdue 14 days stage
    SELECT c.*, 'overdue_14'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_ov14 AND today_date = (c.c_due_date + interval '14 days')::date
  ),
  eligible_channels AS (
    -- Email channel
    SELECT e.*, 'email'::text AS eval_channel, e.c_email AS eval_recipient
    FROM evaluated_stages e
    WHERE e.c_email_enabled AND length(trim(e.c_email)) > 3 AND position('@' in e.c_email) > 1
    UNION ALL
    -- WhatsApp channel
    SELECT e.*, 'whatsapp'::text AS eval_channel, e.c_phone AS eval_recipient
    FROM evaluated_stages e
    WHERE e.c_whatsapp_enabled AND length(trim(e.c_phone)) >= 7
    UNION ALL
    -- SMS channel
    SELECT e.*, 'sms'::text AS eval_channel, e.c_phone AS eval_recipient
    FROM evaluated_stages e
    WHERE e.c_sms_enabled AND length(trim(e.c_phone)) >= 7
  ),
  to_dispatch AS (
    SELECT
      ec.*
    FROM eligible_channels ec
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pc_reminders r
      WHERE r.invoice_id = ec.c_invoice_id
        AND r.stage = ec.eval_stage
        AND r.channel = ec.eval_channel
        AND r.status IN ('queued', 'sending', 'delivered')
    )
    LIMIT p_limit
  ),
  inserted_claims AS (
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
    FROM to_dispatch td
    ON CONFLICT (invoice_id, stage, channel) WHERE status IN ('queued', 'sending', 'delivered')
    DO NOTHING
    RETURNING
      id AS r_id,
      invoice_id AS r_inv_id,
      user_id AS r_usr_id,
      stage AS r_stage,
      channel AS r_channel,
      recipient AS r_recipient,
      attempt_count AS r_attempts
  )
  SELECT
    ic.r_id AS out_reminder_id,
    ic.r_inv_id AS out_invoice_id,
    ic.r_usr_id AS out_user_id,
    inv.customer AS out_customer_name,
    COALESCE(inv.customer_email, '') AS out_customer_email,
    COALESCE(inv.customer_phone, '') AS out_customer_phone,
    inv.amount_kobo AS out_amount_kobo,
    inv.balance_kobo AS out_balance_kobo,
    inv.due_date AS out_due_date,
    ic.r_stage AS out_stage,
    ic.r_channel AS out_channel,
    COALESCE(s.custom_note, '') AS out_custom_note,
    ic.r_attempts AS out_attempt_count
  FROM inserted_claims ic
  JOIN public.pc_invoices inv ON inv.id = ic.r_inv_id
  LEFT JOIN public.pc_reminder_settings s ON s.user_id = ic.r_usr_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_due_invoice_reminders(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_due_invoice_reminders(int) TO authenticated, service_role;

-- 4. RPC to record provider delivery result or status update
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
BEGIN
  SELECT * INTO rem_row FROM public.pc_reminders WHERE id = p_reminder_id FOR UPDATE;
  IF rem_row.id IS NULL THEN
    RAISE EXCEPTION 'reminder_not_found';
  END IF;

  SELECT * INTO inv_row FROM public.pc_invoices WHERE id = rem_row.invoice_id;

  IF p_status = 'delivered' THEN
    UPDATE public.pc_reminders
    SET
      status = 'delivered',
      provider_message_id = p_provider_message_id,
      error_message = NULL,
      recorded_at = now(),
      updated_at = now()
    WHERE id = p_reminder_id;

    -- Audit log in pc_automation_logs
    INSERT INTO public.pc_automation_logs (
      user_id,
      invoice_id,
      action,
      status,
      details
    ) VALUES (
      rem_row.user_id,
      rem_row.invoice_id,
      'reminder_delivered',
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

  ELSIF p_status = 'failed' THEN
    UPDATE public.pc_reminders
    SET
      status = 'failed',
      attempt_count = rem_row.attempt_count + 1,
      retry_after = now() + interval '2 hours',
      error_message = p_error_message,
      updated_at = now()
    WHERE id = p_reminder_id;

    -- Audit log in pc_automation_logs
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
        'error', p_error_message,
        'attempt', rem_row.attempt_count + 1
      )
    );

  ELSIF p_status = 'not_configured' THEN
    UPDATE public.pc_reminders
    SET
      status = 'not_configured',
      error_message = p_error_message,
      updated_at = now()
    WHERE id = p_reminder_id;

  ELSIF p_status = 'skipped' THEN
    UPDATE public.pc_reminders
    SET
      status = 'skipped',
      error_message = p_error_message,
      updated_at = now()
    WHERE id = p_reminder_id;

  ELSE
    RAISE EXCEPTION 'invalid_status: %', p_status;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_reminder_delivery_result(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_reminder_delivery_result(uuid, text, text, text) TO authenticated, service_role;
