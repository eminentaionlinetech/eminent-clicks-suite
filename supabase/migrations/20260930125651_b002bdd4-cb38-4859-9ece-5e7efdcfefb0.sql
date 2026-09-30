
-- ===== Utilities =====
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ===== Roles =====
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ===== Profiles =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  notify_payments boolean NOT NULL DEFAULT true,
  notify_reminders boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, whatsapp)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.email,''), COALESCE(NEW.raw_user_meta_data->>'whatsapp',''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== Tools catalogue (configuration, the single source of prices) =====
CREATE TABLE public.tools (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN',
  billing_period_days integer, -- NULL = one-time activation, no expiry
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.tools TO anon, authenticated;
GRANT ALL ON public.tools TO service_role;
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tools readable" ON public.tools FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.tools (id, name, price_kobo, sort_order) VALUES
 ('subtrack','SubTrack',500000,1),('jobflow','JobFlow',1000000,2),('paychaser','PayChaser',1000000,3),
 ('reportsnap','ReportSnap',1000000,4),('claimdesk','ClaimDesk',1000000,5);

-- ===== Payments =====
CREATE TYPE public.payment_status AS ENUM ('pending','approved','rejected');
CREATE TABLE public.payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  whatsapp text NOT NULL,
  tool_id text NOT NULL REFERENCES public.tools(id),
  amount_kobo bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  tracking_code text NOT NULL UNIQUE,
  receipt_path text NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_pending_per_tool ON public.payment_submissions(user_id, tool_id) WHERE status = 'pending';
CREATE INDEX payment_status_idx ON public.payment_submissions(status, submitted_at DESC);
GRANT SELECT ON public.payment_submissions TO authenticated;
GRANT ALL ON public.payment_submissions TO service_role;
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin read payments" ON public.payment_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER payments_updated BEFORE UPDATE ON public.payment_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Entitlements =====
CREATE TABLE public.tool_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_id text NOT NULL REFERENCES public.tools(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  payment_id uuid REFERENCES public.payment_submissions(id),
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tool_id)
);
GRANT SELECT ON public.tool_entitlements TO authenticated;
GRANT ALL ON public.tool_entitlements TO service_role;
ALTER TABLE public.tool_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin read entitlements" ON public.tool_entitlements FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ent_updated BEFORE UPDATE ON public.tool_entitlements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.has_tool(_user_id uuid, _tool text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tool_entitlements WHERE user_id = _user_id AND tool_id = _tool
    AND status = 'active' AND (expires_at IS NULL OR expires_at > now()))
$$;

-- ===== Notifications & Audit =====
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notif_user_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notif read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notif update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own notif delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ===== Payment RPCs (server-side, price enforced) =====
CREATE OR REPLACE FUNCTION public.submit_payment(_tool_id text, _email text, _whatsapp text, _receipt_path text)
RETURNS public.payment_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); t public.tools; code text; rec public.payment_submissions; tries int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO t FROM public.tools WHERE id = _tool_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_tool'; END IF;
  IF _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF length(regexp_replace(_whatsapp,'\D','','g')) < 10 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  IF split_part(_receipt_path,'/',1) <> uid::text THEN RAISE EXCEPTION 'invalid_receipt_path'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='receipts' AND name=_receipt_path) THEN RAISE EXCEPTION 'receipt_missing'; END IF;
  IF public.has_tool(uid, _tool_id) THEN RAISE EXCEPTION 'already_active'; END IF;
  IF EXISTS (SELECT 1 FROM public.payment_submissions WHERE user_id=uid AND tool_id=_tool_id AND status='pending') THEN RAISE EXCEPTION 'already_pending'; END IF;
  LOOP
    tries := tries + 1;
    code := 'EC-NGN-' || lpad((floor(random()*10000))::int::text,4,'0') || '-' || lpad((floor(random()*10000))::int::text,4,'0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.payment_submissions WHERE tracking_code = code);
    IF tries > 20 THEN RAISE EXCEPTION 'tracking_code_failed'; END IF;
  END LOOP;
  INSERT INTO public.payment_submissions (user_id,email,whatsapp,tool_id,amount_kobo,currency,tracking_code,receipt_path)
  VALUES (uid, trim(_email), trim(_whatsapp), t.id, t.price_kobo, t.currency, code, _receipt_path) RETURNING * INTO rec;
  INSERT INTO public.notifications (user_id,kind,title,body,link) VALUES
    (uid,'payment_submitted','Payment submitted — awaiting verification', t.name || ' · ' || code, '/billing');
  INSERT INTO public.audit_logs (actor_id,action,target_type,target_id,metadata) VALUES
    (uid,'payment.submitted','payment',rec.id::text, jsonb_build_object('tool',t.id,'amount_kobo',t.price_kobo,'tracking_code',code));
  RETURN rec;
END; $$;

CREATE OR REPLACE FUNCTION public.approve_payment(_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); p public.payment_submissions; t public.tools; exp timestamptz;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO p FROM public.payment_submissions WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p.status = 'approved' THEN RETURN jsonb_build_object('result','already_approved'); END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  SELECT * INTO t FROM public.tools WHERE id = p.tool_id;
  IF p.amount_kobo <> t.price_kobo THEN RAISE EXCEPTION 'amount_mismatch'; END IF;
  exp := CASE WHEN t.billing_period_days IS NULL THEN NULL ELSE now() + make_interval(days => t.billing_period_days) END;
  UPDATE public.payment_submissions SET status='approved', reviewed_at=now(), reviewed_by=uid, rejection_reason=NULL WHERE id=p.id;
  INSERT INTO public.tool_entitlements (user_id,tool_id,status,payment_id,activated_at,expires_at)
  VALUES (p.user_id,p.tool_id,'active',p.id,now(),exp)
  ON CONFLICT (user_id,tool_id) DO UPDATE SET status='active', payment_id=EXCLUDED.payment_id, activated_at=now(), expires_at=EXCLUDED.expires_at;
  INSERT INTO public.notifications (user_id,kind,title,body,link) VALUES
    (p.user_id,'payment_approved','Payment approved — your tool is now unlocked','Your ' || t.name || ' access is now active.','/' || t.id);
  INSERT INTO public.audit_logs (actor_id,action,target_type,target_id,metadata) VALUES
    (uid,'payment.approved','payment',p.id::text,jsonb_build_object('tool',p.tool_id,'user',p.user_id,'tracking_code',p.tracking_code)),
    (uid,'tool.activated','entitlement',p.user_id::text || ':' || p.tool_id,jsonb_build_object('payment',p.id));
  RETURN jsonb_build_object('result','approved');
END; $$;

CREATE OR REPLACE FUNCTION public.reject_payment(_payment_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); p public.payment_submissions; t public.tools;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF coalesce(length(trim(_reason)),0) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO p FROM public.payment_submissions WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p.status = 'rejected' THEN RETURN jsonb_build_object('result','already_rejected'); END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  SELECT * INTO t FROM public.tools WHERE id = p.tool_id;
  UPDATE public.payment_submissions SET status='rejected', reviewed_at=now(), reviewed_by=uid, rejection_reason=trim(_reason) WHERE id=p.id;
  INSERT INTO public.notifications (user_id,kind,title,body,link) VALUES
    (p.user_id,'payment_rejected','Your payment submission was not approved', t.name || ': ' || trim(_reason),'/billing');
  INSERT INTO public.audit_logs (actor_id,action,target_type,target_id,metadata) VALUES
    (uid,'payment.rejected','payment',p.id::text,jsonb_build_object('tool',p.tool_id,'user',p.user_id,'reason',trim(_reason)));
  RETURN jsonb_build_object('result','rejected');
END; $$;

REVOKE EXECUTE ON FUNCTION public.submit_payment(text,text,text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_payment(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_payment(uuid,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_payment(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payment(uuid,text) TO authenticated;

-- ===== Tool data tables (access requires active entitlement) =====
-- SubTrack
CREATE TABLE public.st_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL, provider text NOT NULL DEFAULT '',
  cost_kobo bigint NOT NULL CHECK (cost_kobo >= 0),
  frequency text NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
  renewal_date date, trial_end_date date,
  category text NOT NULL DEFAULT 'Other', notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- JobFlow
CREATE TABLE public.jf_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name text NOT NULL, client_phone text NOT NULL DEFAULT '', client_email text NOT NULL DEFAULT '',
  title text NOT NULL, description text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '',
  job_date date, status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','quoted','scheduled','in_progress','completed','invoiced')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jf_job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jf_jobs(id) ON DELETE CASCADE,
  body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jf_job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jf_jobs(id) ON DELETE CASCADE,
  path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jf_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jf_jobs(id) ON DELETE SET NULL,
  client_name text NOT NULL, description text NOT NULL DEFAULT '',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb, total_kobo bigint NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','approved','declined')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- PayChaser
CREATE TABLE public.pc_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  customer text NOT NULL, invoice_number text NOT NULL,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  issue_date date NOT NULL, due_date date NOT NULL,
  description text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','unpaid','paid')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, invoice_number)
);
CREATE TABLE public.pc_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.pc_invoices(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('before_due','due_date','overdue_3','overdue_7','overdue_14')),
  channel text NOT NULL DEFAULT 'manual', note text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- ReportSnap
CREATE TABLE public.rs_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('sale','expense')),
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  occurred_on date NOT NULL, category text NOT NULL DEFAULT 'General',
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rs_tx_idx ON public.rs_transactions(user_id, occurred_on);
-- ClaimDesk
CREATE TABLE public.cd_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  claimant text NOT NULL DEFAULT '', insurer text NOT NULL DEFAULT '', claim_number text NOT NULL,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0), paid_kobo bigint NOT NULL DEFAULT 0 CHECK (paid_kobo >= 0),
  submitted_on date NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','in_review','info_needed','approved','denied','paid')),
  description text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
  follow_up_on date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cd_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.cd_claims(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('created','status','note','document','follow_up')),
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cd_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.cd_claims(id) ON DELETE CASCADE,
  path text NOT NULL, file_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('st_subscriptions','subtrack'),('jf_jobs','jobflow'),('jf_job_notes','jobflow'),('jf_job_photos','jobflow'),('jf_quotes','jobflow'),
    ('pc_invoices','paychaser'),('pc_reminders','paychaser'),('rs_transactions','reportsnap'),
    ('cd_claims','claimdesk'),('cd_events','claimdesk'),('cd_documents','claimdesk')) AS v(tbl, tool)
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tbl);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('CREATE POLICY "owner with access" ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid() AND public.has_tool(auth.uid(), %L)) WITH CHECK (user_id = auth.uid() AND public.has_tool(auth.uid(), %L))', r.tbl, r.tool, r.tool);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', r.tbl || '_updated', r.tbl);
    EXECUTE format('CREATE INDEX %I ON public.%I(user_id)', r.tbl || '_user_idx', r.tbl);
  END LOOP;
END $$;

-- ===== Realtime =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tool_entitlements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
