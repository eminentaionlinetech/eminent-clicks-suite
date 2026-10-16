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

-- 2. Backfill balance_kobo for existing invoices
UPDATE public.pc_invoices
SET balance_kobo = CASE
  WHEN status = 'paid' THEN 0
  ELSE amount_kobo
END
WHERE balance_kobo IS NULL;

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
  notes text NOT NULL DEFAULT '',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pc_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pc_payments' AND policyname = 'pc_payments_owner_all'
  ) THEN
    CREATE POLICY pc_payments_owner_all ON public.pc_payments
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 6. Trigger to automatically keep invoice balance and status in sync with customer payments
CREATE OR REPLACE FUNCTION public.recalculate_single_invoice_balance(target_inv_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv_amount bigint;
  total_paid bigint;
  new_balance bigint;
BEGIN
  SELECT amount_kobo INTO inv_amount
  FROM public.pc_invoices
  WHERE id = target_inv_id;

  IF inv_amount IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount_kobo), 0) INTO total_paid
  FROM public.pc_payments
  WHERE invoice_id = target_inv_id;

  new_balance := GREATEST(0, inv_amount - total_paid);

  UPDATE public.pc_invoices
  SET
    balance_kobo = new_balance,
    status = CASE
      WHEN new_balance = 0 THEN 'paid'
      WHEN total_paid > 0 THEN 'unpaid'
      ELSE status
    END,
    paid_at = CASE
      WHEN new_balance = 0 THEN COALESCE(paid_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = target_inv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_invoice_payment_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- 7. Automation logs table for auditability and delivery records
CREATE TABLE IF NOT EXISTS public.pc_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.pc_invoices(id) ON DELETE CASCADE,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pc_automation_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pc_automation_logs' AND policyname = 'pc_automation_logs_owner_all'
  ) THEN
    CREATE POLICY pc_automation_logs_owner_all ON public.pc_automation_logs
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 8. RPC: Convert Job to Invoice (Idempotent, Entitlement-Protected)
CREATE OR REPLACE FUNCTION public.convert_job_to_invoice(
  _job_id uuid,
  _amount_kobo bigint,
  _due_date date DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF NOT public.has_tool('paychaser') THEN
    RAISE EXCEPTION 'tool_not_unlocked';
  END IF;

  SELECT * INTO target_job
  FROM public.jf_jobs
  WHERE id = _job_id AND user_id = current_user_id;

  IF target_job IS NULL THEN
    RAISE EXCEPTION 'job_not_found';
  END IF;

  -- Check if already converted
  SELECT id INTO existing_invoice_id
  FROM public.pc_invoices
  WHERE user_id = current_user_id AND source_job_id = _job_id;

  IF existing_invoice_id IS NOT NULL THEN
    RETURN existing_invoice_id;
  END IF;

  -- Generate invoice number
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

-- 9. RPC: Convert Quote to Invoice (Idempotent, Entitlement-Protected)
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
  _quote_id uuid,
  _due_date date DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF NOT public.has_tool('paychaser') THEN
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

  -- Check if already converted
  SELECT id INTO existing_invoice_id
  FROM public.pc_invoices
  WHERE user_id = current_user_id AND source_quote_id = _quote_id;

  IF existing_invoice_id IS NOT NULL THEN
    RETURN existing_invoice_id;
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
    WHERE user_id = current_user_id AND source_quote_id = _quote_id;
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
