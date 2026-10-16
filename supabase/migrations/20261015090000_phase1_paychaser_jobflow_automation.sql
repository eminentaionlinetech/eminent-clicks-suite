-- =============================================================================
-- Migration: Phase 1 — PayChaser Invoice Enhancements & JobFlow Automation
-- Preserves all existing tables, profiles, roles, and receipt approval workflows.
-- Additive and backward-compatible.
-- =============================================================================

-- 1. Add balance and source link columns to pc_invoices
ALTER TABLE public.pc_invoices
  ADD COLUMN IF NOT EXISTS balance_kobo bigint,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS source_job_id uuid REFERENCES public.jf_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_quote_id uuid REFERENCES public.jf_quotes(id) ON DELETE SET NULL;

-- 2. Safe backfill for existing invoices (handles paid, cancelled, unpaid, draft, sent)
UPDATE public.pc_invoices inv
SET balance_kobo = CASE
  WHEN inv.status = 'paid' THEN 0
  WHEN inv.status = 'cancelled' THEN 0
  ELSE GREATEST(0, inv.amount_kobo - COALESCE(
    (SELECT SUM(p.amount_kobo) FROM public.pc_payments p WHERE p.invoice_id = inv.id AND p.user_id = inv.user_id),
    0
  ))
END
WHERE inv.balance_kobo IS NULL;

-- 3. Set default for future inserts
ALTER TABLE public.pc_invoices
  ALTER COLUMN balance_kobo SET DEFAULT 0;

-- 4. Enforce idempotency: prevent duplicate invoices for the same job or quote
CREATE UNIQUE INDEX IF NOT EXISTS pc_invoices_user_source_job_idx
  ON public.pc_invoices (user_id, source_job_id)
  WHERE source_job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pc_invoices_user_source_quote_idx
  ON public.pc_invoices (user_id, source_quote_id)
  WHERE source_quote_id IS NOT NULL;

-- 5. Customer Payments ledger (for tracking partial/full invoice payments)
-- Note: Completely separate from Eminent Clicks tool subscription receipts (payment_submissions)
CREATE TABLE IF NOT EXISTS public.pc_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.pc_invoices(id) ON DELETE CASCADE,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  reference text NOT NULL DEFAULT '',
  idempotency_key text,
  notes text NOT NULL DEFAULT '',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for payment queries and cross-user join performance
CREATE INDEX IF NOT EXISTS pc_payments_invoice_user_idx
  ON public.pc_payments (invoice_id, user_id);

-- Enforce duplicate payment prevention when reference is provided
CREATE UNIQUE INDEX IF NOT EXISTS pc_payments_invoice_reference_idx
  ON public.pc_payments (invoice_id, reference)
  WHERE reference <> '';

-- Enforce idempotency protection per invoice when idempotency_key is provided
CREATE UNIQUE INDEX IF NOT EXISTS pc_payments_idempotency_key_idx
  ON public.pc_payments (invoice_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

ALTER TABLE public.pc_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pc_payments' AND policyname = 'pc_payments_owner_all'
  ) THEN
    CREATE POLICY pc_payments_owner_all ON public.pc_payments
      FOR ALL TO authenticated
      USING (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.pc_invoices inv
          WHERE inv.id = pc_payments.invoice_id AND inv.user_id = auth.uid()
        )
      )
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.pc_invoices inv
          WHERE inv.id = invoice_id AND inv.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 6. Trigger to reject overpayments and serialize concurrent payment attempts
CREATE OR REPLACE FUNCTION public.validate_payment_not_overpaid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inv_amount bigint;
  inv_user_id uuid;
  other_payments bigint;
  max_allowed bigint;
BEGIN
  -- Lock the target invoice row to serialize concurrent payment operations
  SELECT amount_kobo, user_id INTO inv_amount, inv_user_id
  FROM public.pc_invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF inv_amount IS NULL THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  IF inv_user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'cross_user_payment_forbidden';
  END IF;

  IF NEW.amount_kobo <= 0 THEN
    RAISE EXCEPTION 'payment_amount_must_be_positive';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(SUM(amount_kobo), 0) INTO other_payments
    FROM public.pc_payments
    WHERE invoice_id = NEW.invoice_id AND id <> OLD.id AND user_id = NEW.user_id;
  ELSE
    SELECT COALESCE(SUM(amount_kobo), 0) INTO other_payments
    FROM public.pc_payments
    WHERE invoice_id = NEW.invoice_id AND user_id = NEW.user_id;
  END IF;

  max_allowed := inv_amount - other_payments;

  IF NEW.amount_kobo > max_allowed THEN
    RAISE EXCEPTION 'overpayment_rejected: amount (%) exceeds outstanding balance (%)',
      NEW.amount_kobo, max_allowed;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_not_overpaid ON public.pc_payments;
CREATE TRIGGER trg_validate_payment_not_overpaid
BEFORE INSERT OR UPDATE ON public.pc_payments
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_not_overpaid();

-- 7. Trigger to synchronize invoice balance and status
CREATE OR REPLACE FUNCTION public.recalculate_single_invoice_balance(target_inv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inv_amount bigint;
  inv_user_id uuid;
  inv_current_status text;
  total_paid bigint;
  new_balance bigint;
BEGIN
  SELECT amount_kobo, user_id, status INTO inv_amount, inv_user_id, inv_current_status
  FROM public.pc_invoices
  WHERE id = target_inv_id
  FOR UPDATE;

  IF inv_amount IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount_kobo), 0) INTO total_paid
  FROM public.pc_payments
  WHERE invoice_id = target_inv_id AND user_id = inv_user_id;

  new_balance := GREATEST(0, inv_amount - total_paid);

  UPDATE public.pc_invoices
  SET
    balance_kobo = new_balance,
    status = CASE
      WHEN new_balance = 0 THEN 'paid'
      WHEN inv_current_status = 'paid' AND new_balance > 0 THEN 'unpaid'
      ELSE inv_current_status
    END,
    paid_at = CASE
      WHEN new_balance = 0 THEN COALESCE(paid_at, now())
      WHEN inv_current_status = 'paid' AND new_balance > 0 THEN NULL
      ELSE paid_at
    END,
    updated_at = now()
  WHERE id = target_inv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_invoice_payment_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
    PERFORM public.recalculate_single_invoice_balance(OLD.invoice_id);
    PERFORM public.recalculate_single_invoice_balance(NEW.invoice_id);
  ELSE
    PERFORM public.recalculate_single_invoice_balance(COALESCE(NEW.invoice_id, OLD.invoice_id));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_payment_balance ON public.pc_payments;
CREATE TRIGGER trg_sync_invoice_payment_balance
AFTER INSERT OR UPDATE OR DELETE ON public.pc_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_payment_balance();

-- 8. Automation logs table for auditability and delivery records
CREATE TABLE IF NOT EXISTS public.pc_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.pc_invoices(id) ON DELETE CASCADE,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pc_automation_logs_user_idx
  ON public.pc_automation_logs (user_id, created_at DESC);

ALTER TABLE public.pc_automation_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS pc_automation_logs_owner_all ON public.pc_automation_logs;
  DROP POLICY IF EXISTS pc_automation_logs_owner_select ON public.pc_automation_logs;
  DROP POLICY IF EXISTS pc_automation_logs_owner_insert ON public.pc_automation_logs;

  CREATE POLICY pc_automation_logs_owner_select ON public.pc_automation_logs
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

  CREATE POLICY pc_automation_logs_owner_insert ON public.pc_automation_logs
    FOR INSERT TO authenticated
    WITH CHECK (
      auth.uid() = user_id
      AND (
        invoice_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.pc_invoices inv
          WHERE inv.id = invoice_id AND inv.user_id = auth.uid()
        )
      )
    );
END $$;

REVOKE UPDATE, DELETE ON public.pc_automation_logs FROM authenticated;

-- 9. RPC: Convert Job to Invoice (Idempotent, Entitlement-Protected, Safe Search Path)
CREATE OR REPLACE FUNCTION public.convert_job_to_invoice(
  _job_id uuid,
  _amount_kobo bigint,
  _due_date date DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  target_job record;
  existing_invoice_id uuid;
  new_invoice_id uuid;
  _invoice_number text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.has_tool(current_user_id, 'paychaser') THEN
    RAISE EXCEPTION 'tool_not_unlocked';
  END IF;

  IF _amount_kobo <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;

  SELECT * INTO target_job
  FROM public.jf_jobs
  WHERE id = _job_id AND user_id = current_user_id;

  IF target_job IS NULL THEN
    RAISE EXCEPTION 'job_not_found';
  END IF;

  -- 1. Check if this job has already been invoiced directly
  SELECT id INTO existing_invoice_id
  FROM public.pc_invoices
  WHERE user_id = current_user_id AND source_job_id = _job_id;

  IF existing_invoice_id IS NOT NULL THEN
    RETURN existing_invoice_id;
  END IF;

  -- 2. Check if this job has an approved quote that has already been converted to an invoice
  SELECT inv.id INTO existing_invoice_id
  FROM public.pc_invoices inv
  JOIN public.jf_quotes q ON inv.source_quote_id = q.id
  WHERE inv.user_id = current_user_id AND q.job_id = _job_id
  LIMIT 1;

  IF existing_invoice_id IS NOT NULL THEN
    UPDATE public.pc_invoices
    SET source_job_id = _job_id, updated_at = now()
    WHERE id = existing_invoice_id AND source_job_id IS NULL;

    UPDATE public.jf_jobs
    SET status = 'invoiced', updated_at = now()
    WHERE id = _job_id AND user_id = current_user_id AND status <> 'invoiced';

    RETURN existing_invoice_id;
  END IF;

  _invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 4);

  BEGIN
    INSERT INTO public.pc_invoices (
      user_id,
      customer,
      customer_email,
      customer_phone,
      invoice_number,
      amount_kobo,
      balance_kobo,
      issue_date,
      due_date,
      description,
      notes,
      status,
      source_job_id
    ) VALUES (
      current_user_id,
      target_job.client_name,
      NULLIF(target_job.client_email, ''),
      COALESCE(target_job.client_phone, ''),
      _invoice_number,
      _amount_kobo,
      _amount_kobo,
      CURRENT_DATE,
      COALESCE(_due_date, CURRENT_DATE + INTERVAL '7 days'),
      target_job.title || CASE WHEN target_job.location <> '' THEN ' — ' || target_job.location ELSE '' END,
      COALESCE(NULLIF(_notes, ''), target_job.notes),
      'unpaid',
      _job_id
    )
    RETURNING id INTO new_invoice_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO new_invoice_id
    FROM public.pc_invoices
    WHERE user_id = current_user_id AND source_job_id = _job_id;
  END;

  UPDATE public.jf_jobs
  SET status = 'invoiced', updated_at = now()
  WHERE id = _job_id AND user_id = current_user_id AND status <> 'invoiced';

  INSERT INTO public.pc_automation_logs (user_id, invoice_id, action, details)
  VALUES (
    current_user_id,
    new_invoice_id,
    'convert_job_to_invoice',
    jsonb_build_object('job_id', _job_id, 'amount_kobo', _amount_kobo, 'invoice_number', _invoice_number)
  );

  RETURN new_invoice_id;
END;
$$;

-- 10. RPC: Convert Quote to Invoice (Idempotent, Entitlement-Protected, Safe Search Path)
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
  _quote_id uuid,
  _due_date date DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  target_quote record;
  existing_invoice_id uuid;
  new_invoice_id uuid;
  _invoice_number text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.has_tool(current_user_id, 'paychaser') THEN
    RAISE EXCEPTION 'tool_not_unlocked';
  END IF;

  SELECT * INTO target_quote
  FROM public.jf_quotes
  WHERE id = _quote_id AND user_id = current_user_id;

  IF target_quote IS NULL THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  IF target_quote.total_kobo <= 0 THEN
    RAISE EXCEPTION 'quote_total_must_be_positive';
  END IF;

  -- 1. Check if this quote has already been converted
  SELECT id INTO existing_invoice_id
  FROM public.pc_invoices
  WHERE user_id = current_user_id AND source_quote_id = _quote_id;

  IF existing_invoice_id IS NOT NULL THEN
    RETURN existing_invoice_id;
  END IF;

  -- 2. If this quote is linked to a job that was already invoiced, link to that invoice instead of duplicating
  IF target_quote.job_id IS NOT NULL THEN
    SELECT id INTO existing_invoice_id
    FROM public.pc_invoices
    WHERE user_id = current_user_id AND source_job_id = target_quote.job_id;

    IF existing_invoice_id IS NOT NULL THEN
      UPDATE public.pc_invoices
      SET source_quote_id = _quote_id, updated_at = now()
      WHERE id = existing_invoice_id AND source_quote_id IS NULL;

      UPDATE public.jf_quotes
      SET status = 'approved', updated_at = now()
      WHERE id = _quote_id AND user_id = current_user_id;

      RETURN existing_invoice_id;
    END IF;
  END IF;

  _invoice_number := 'INV-Q-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 4);

  BEGIN
    INSERT INTO public.pc_invoices (
      user_id,
      customer,
      invoice_number,
      amount_kobo,
      balance_kobo,
      issue_date,
      due_date,
      description,
      notes,
      status,
      source_quote_id,
      source_job_id
    ) VALUES (
      current_user_id,
      target_quote.client_name,
      _invoice_number,
      target_quote.total_kobo,
      target_quote.total_kobo,
      CURRENT_DATE,
      COALESCE(_due_date, CURRENT_DATE + INTERVAL '7 days'),
      COALESCE(NULLIF(target_quote.description, ''), 'Invoice from Quote #' || _invoice_number),
      COALESCE(NULLIF(_notes, ''), target_quote.notes),
      'unpaid',
      _quote_id,
      target_quote.job_id
    )
    RETURNING id INTO new_invoice_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO new_invoice_id
    FROM public.pc_invoices
    WHERE user_id = current_user_id AND (source_quote_id = _quote_id OR (target_quote.job_id IS NOT NULL AND source_job_id = target_quote.job_id));
  END;

  UPDATE public.jf_quotes
  SET status = 'approved', updated_at = now()
  WHERE id = _quote_id AND user_id = current_user_id;

  IF target_quote.job_id IS NOT NULL THEN
    UPDATE public.jf_jobs
    SET status = 'invoiced', updated_at = now()
    WHERE id = target_quote.job_id AND user_id = current_user_id AND status <> 'invoiced';
  END IF;

  INSERT INTO public.pc_automation_logs (user_id, invoice_id, action, details)
  VALUES (
    current_user_id,
    new_invoice_id,
    'convert_quote_to_invoice',
    jsonb_build_object('quote_id', _quote_id, 'amount_kobo', target_quote.total_kobo, 'invoice_number', _invoice_number)
  );

  RETURN new_invoice_id;
END;
$$;

-- 11. Restrict execution grants on RPCs
REVOKE EXECUTE ON FUNCTION public.convert_job_to_invoice(uuid, bigint, date, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.convert_job_to_invoice(uuid, bigint, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, date, text) TO authenticated;
