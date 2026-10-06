ALTER TABLE public.pc_invoices ADD COLUMN IF NOT EXISTS customer_email TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pc_invoices TO authenticated;
GRANT ALL ON public.pc_invoices TO service_role;