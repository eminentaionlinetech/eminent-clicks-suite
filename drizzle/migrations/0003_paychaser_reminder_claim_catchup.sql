-- Upgrade PayChaser reminder claiming:
-- 1. Catch-up windows: a stage becomes eligible from its trigger day onward (not only the exact day),
--    so a missed scheduler run still sends the reminder instead of skipping it forever.
-- 2. Bounded retries: a stage/channel stops retrying after 5 failed delivery attempts.
-- 3. Richer task payload: invoice number and the owner's business name (profiles.full_name)
--    for professional reminder messages. Existing out_* columns are unchanged.

DROP FUNCTION IF EXISTS public.claim_due_invoice_reminders(integer);

CREATE FUNCTION public.claim_due_invoice_reminders(p_limit integer DEFAULT 50)
RETURNS TABLE(
  out_reminder_id uuid,
  out_invoice_id uuid,
  out_user_id uuid,
  out_customer_name text,
  out_customer_email text,
  out_customer_phone text,
  out_amount_kobo bigint,
  out_balance_kobo bigint,
  out_due_date date,
  out_invoice_number text,
  out_business_name text,
  out_stage text,
  out_channel text,
  out_custom_note text,
  out_attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      inv.invoice_number AS c_invoice_number,
      COALESCE(p.full_name, '') AS c_business_name,
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
    LEFT JOIN public.profiles p ON p.id = inv.user_id
    WHERE (caller_uid IS NULL OR inv.user_id = caller_uid)
      AND inv.status IN ('sent', 'unpaid')
      AND inv.balance_kobo > 0
      AND public.has_tool(inv.user_id, 'paychaser')
  ),
  evaluated_stages AS (
    -- Before-due window: from (due - days_before) until the day before the due date
    SELECT c.*, 'before_due'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_before
      AND today_date >= (c.c_due_date - (c.c_days_before || ' days')::interval)::date
      AND today_date < c.c_due_date
    UNION ALL
    -- Due date stage
    SELECT c.*, 'due_date'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_due AND today_date = c.c_due_date
    UNION ALL
    -- Overdue stages: eligible from the trigger day onward (catch-up)
    SELECT c.*, 'overdue_3'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_ov3 AND today_date >= (c.c_due_date + interval '3 days')::date
    UNION ALL
    SELECT c.*, 'overdue_7'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_ov7 AND today_date >= (c.c_due_date + interval '7 days')::date
    UNION ALL
    SELECT c.*, 'overdue_14'::text AS eval_stage
    FROM candidate_invoices c
    WHERE c.c_remind_ov14 AND today_date >= (c.c_due_date + interval '14 days')::date
  ),
  eligible_channels AS (
    SELECT e.*, 'email'::text AS eval_channel, e.c_email AS eval_recipient
    FROM evaluated_stages e
    WHERE e.c_email_enabled AND length(trim(e.c_email)) > 3 AND position('@' in e.c_email) > 1
    UNION ALL
    SELECT e.*, 'whatsapp'::text AS eval_channel, e.c_phone AS eval_recipient
    FROM evaluated_stages e
    WHERE e.c_whatsapp_enabled AND length(trim(e.c_phone)) >= 7
    UNION ALL
    SELECT e.*, 'sms'::text AS eval_channel, e.c_phone AS eval_recipient
    FROM evaluated_stages e
    WHERE e.c_sms_enabled AND length(trim(e.c_phone)) >= 7
  ),
  to_dispatch AS (
    SELECT ec.*
    FROM eligible_channels ec
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pc_reminders r
      WHERE r.invoice_id = ec.c_invoice_id
        AND r.stage = ec.eval_stage
        AND r.channel = ec.eval_channel
        AND r.status IN ('queued', 'sending', 'delivered')
    )
      AND (
        SELECT count(*) FROM public.pc_reminders r2
        WHERE r2.invoice_id = ec.c_invoice_id
          AND r2.stage = ec.eval_stage
          AND r2.channel = ec.eval_channel
          AND r2.status = 'failed'
      ) < 5
    LIMIT p_limit
  ),
  inserted_claims AS (
    INSERT INTO public.pc_reminders (
      user_id, invoice_id, stage, channel, recipient, status, note, attempt_count, last_attempt_at
    )
    SELECT
      td.c_user_id, td.c_invoice_id, td.eval_stage, td.eval_channel,
      td.eval_recipient, 'sending', COALESCE(td.c_note, ''), 1, now()
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
    inv.invoice_number AS out_invoice_number,
    COALESCE(p.full_name, '') AS out_business_name,
    ic.r_stage AS out_stage,
    ic.r_channel AS out_channel,
    COALESCE(s.custom_note, '') AS out_custom_note,
    ic.r_attempts AS out_attempt_count
  FROM inserted_claims ic
  JOIN public.pc_invoices inv ON inv.id = ic.r_inv_id
  LEFT JOIN public.profiles p ON p.id = ic.r_usr_id
  LEFT JOIN public.pc_reminder_settings s ON s.user_id = ic.r_usr_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_due_invoice_reminders(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.claim_due_invoice_reminders(integer) IS 'Claims due PayChaser reminder tasks (catch-up windows, duplicate-safe, max 5 failed attempts per stage/channel). When called with a user JWT only that user''s invoices are evaluated; with the service role all users are evaluated.';