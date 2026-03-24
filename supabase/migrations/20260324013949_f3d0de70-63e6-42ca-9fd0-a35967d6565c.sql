
-- Fiscal settings per workspace
CREATE TABLE public.fiscal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_name text,
  document text, -- CPF or CNPJ
  municipal_registration text,
  tax_regime text DEFAULT 'simples_nacional',
  address_street text,
  address_number text,
  address_city text,
  address_state text,
  address_zip text,
  default_tax_rate numeric DEFAULT 5.0, -- percentage
  nfse_provider text CHECK (nfse_provider IN ('enotas', 'focusnfe') OR nfse_provider IS NULL),
  is_auto_emission boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_manage_fiscal_settings" ON public.fiscal_settings
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- Fiscal invoices (NFS-e records)
CREATE TABLE public.fiscal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  provider text, -- enotas, focusnfe
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'failed', 'canceled')),
  invoice_number text,
  verification_code text,
  pdf_url text,
  xml_url text,
  service_amount integer NOT NULL DEFAULT 0, -- cents
  tax_amount integer NOT NULL DEFAULT 0, -- cents
  issued_at timestamptz,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  external_id text, -- provider reference
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);

CREATE INDEX idx_fiscal_invoices_workspace ON public.fiscal_invoices(workspace_id);
CREATE INDEX idx_fiscal_invoices_status ON public.fiscal_invoices(workspace_id, status);

ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_fiscal_invoices" ON public.fiscal_invoices
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "workspace_members_insert_fiscal_invoices" ON public.fiscal_invoices
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "workspace_members_update_fiscal_invoices" ON public.fiscal_invoices
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
