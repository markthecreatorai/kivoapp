
-- 1. Create fiscal_invoice_events table
CREATE TABLE public.fiscal_invoice_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.fiscal_invoices(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fiscal_invoice_events_invoice ON public.fiscal_invoice_events(invoice_id);

ALTER TABLE public.fiscal_invoice_events ENABLE ROW LEVEL SECURITY;

-- RLS: only workspace admin/owner can read events (via invoice -> workspace)
CREATE POLICY "workspace_admin_read_fiscal_events"
  ON public.fiscal_invoice_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fiscal_invoices fi
      JOIN workspace_members wm ON wm.workspace_id = fi.workspace_id
      WHERE fi.id = fiscal_invoice_events.invoice_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('OWNER','ADMIN')
    )
  );

-- 2. Tighten fiscal_settings RLS to admin/owner only
DROP POLICY IF EXISTS "workspace_members_manage_fiscal_settings" ON public.fiscal_settings;

CREATE POLICY "workspace_admin_manage_fiscal_settings"
  ON public.fiscal_settings FOR ALL TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('OWNER','ADMIN')
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('OWNER','ADMIN')
    )
  );

-- 3. Tighten fiscal_invoices RLS to admin/owner only
DROP POLICY IF EXISTS "workspace_members_read_fiscal_invoices" ON public.fiscal_invoices;
DROP POLICY IF EXISTS "workspace_members_insert_fiscal_invoices" ON public.fiscal_invoices;
DROP POLICY IF EXISTS "workspace_members_update_fiscal_invoices" ON public.fiscal_invoices;

CREATE POLICY "workspace_admin_read_fiscal_invoices"
  ON public.fiscal_invoices FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('OWNER','ADMIN')
    )
  );

CREATE POLICY "workspace_admin_insert_fiscal_invoices"
  ON public.fiscal_invoices FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('OWNER','ADMIN')
    )
  );

CREATE POLICY "workspace_admin_update_fiscal_invoices"
  ON public.fiscal_invoices FOR UPDATE TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('OWNER','ADMIN')
    )
  );
