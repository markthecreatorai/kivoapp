
-- Feature flags table for beta guardrails & kill switches
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read flags" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Workspace owners can update flags" ON public.feature_flags
  FOR UPDATE TO authenticated USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role = 'OWNER')
  );

-- Seed default kill switches
INSERT INTO public.feature_flags (key, label, description, is_enabled, workspace_id) VALUES
  ('checkout_enabled', 'Checkout', 'Permite processar pagamentos', true, NULL),
  ('campaigns_enabled', 'Campanhas Email', 'Permite envio de campanhas', true, NULL),
  ('fiscal_enabled', 'Emissão Fiscal', 'Permite emissão de NFS-e', true, NULL),
  ('withdrawals_enabled', 'Saques', 'Permite saques de saldo', true, NULL),
  ('beta_max_users', 'Limite Beta', 'Limite máximo de usuários beta', true, NULL)
ON CONFLICT (key) DO NOTHING;

-- Data consistency view
CREATE OR REPLACE VIEW public.data_consistency_check AS
SELECT
  'orders_without_payment' AS check_name,
  COUNT(*)::int AS issue_count
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
WHERE o.status = 'COMPLETED' AND p.id IS NULL

UNION ALL

SELECT
  'payments_without_order',
  COUNT(*)::int
FROM payments p
LEFT JOIN orders o ON o.id = p.order_id
WHERE o.id IS NULL

UNION ALL

SELECT
  'completed_orders_missing_entitlements',
  COUNT(DISTINCT o.id)::int
FROM orders o
LEFT JOIN entitlements e ON e.order_id = o.id
WHERE o.status = 'COMPLETED' AND e.id IS NULL;
