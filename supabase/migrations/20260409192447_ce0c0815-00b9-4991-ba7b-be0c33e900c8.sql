
-- 1. New columns on workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_account_id text,
  ADD COLUMN IF NOT EXISTS asaas_wallet_id text,
  ADD COLUMN IF NOT EXISTS payment_setup_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- 2. Transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id),
  asaas_payment_id text,
  
  -- amounts in cents
  gross_amount integer NOT NULL DEFAULT 0,
  gateway_fee integer NOT NULL DEFAULT 0,
  platform_fee integer NOT NULL DEFAULT 0,
  affiliate_fee integer NOT NULL DEFAULT 0,
  net_amount integer NOT NULL DEFAULT 0,
  
  -- payment details
  payment_method text, -- pix, credit_card, boleto
  installments integer DEFAULT 1,
  installment_value integer,
  
  -- PIX specific
  pix_qr_code text,
  pix_qr_code_url text,
  pix_expiration_date timestamptz,
  
  -- Boleto specific
  boleto_url text,
  boleto_barcode text,
  boleto_due_date date,
  
  -- status & dates
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  
  -- metadata
  customer_email text,
  customer_name text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_workspace ON public.transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order ON public.transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_asaas ON public.transactions(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_available ON public.transactions(available_at) WHERE status = 'confirmed';

-- 3. Security reserves table
CREATE TABLE IF NOT EXISTS public.security_reserves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reserve_percent numeric(5,2) NOT NULL DEFAULT 10.00,
  status text NOT NULL DEFAULT 'held',
  release_at timestamptz NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reserves_workspace ON public.security_reserves(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reserves_status ON public.security_reserves(status) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_reserves_release ON public.security_reserves(release_at) WHERE status = 'held';

-- 4. Fee config table
CREATE TABLE IF NOT EXISTS public.fee_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_type text NOT NULL UNIQUE,
  pix_percent numeric(5,2) NOT NULL DEFAULT 0.99,
  credit_card_percent numeric(5,2) NOT NULL DEFAULT 4.99,
  boleto_fixed_cents integer NOT NULL DEFAULT 299,
  platform_percent numeric(5,2) NOT NULL DEFAULT 4.99,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed fee config
INSERT INTO public.fee_config (plan_type, pix_percent, credit_card_percent, boleto_fixed_cents, platform_percent, description)
VALUES
  ('creator', 0.99, 4.99, 299, 4.99, 'Plano Creator — R$49,90/mês'),
  ('creator_pro', 0.79, 3.49, 199, 2.99, 'Plano Creator Pro — R$129,90/mês')
ON CONFLICT (plan_type) DO NOTHING;

-- 5. RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_reserves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_config ENABLE ROW LEVEL SECURITY;

-- transactions: workspace members can view
CREATE POLICY "Workspace members can view transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

-- transactions: workspace admins can insert/update
CREATE POLICY "Workspace admins can insert transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "Workspace admins can update transactions"
  ON public.transactions FOR UPDATE
  TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id));

-- security_reserves: workspace members can view
CREATE POLICY "Workspace members can view reserves"
  ON public.security_reserves FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

-- security_reserves: workspace admins can insert/update
CREATE POLICY "Workspace admins can insert reserves"
  ON public.security_reserves FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "Workspace admins can update reserves"
  ON public.security_reserves FOR UPDATE
  TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id));

-- fee_config: anyone authenticated can read (needed at checkout)
CREATE POLICY "Anyone can read fee config"
  ON public.fee_config FOR SELECT
  TO authenticated
  USING (true);

-- fee_config: only platform admin can modify
CREATE POLICY "Only platform admin can modify fee config"
  ON public.fee_config FOR ALL
  TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

-- 6. Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_security_reserves_updated_at
  BEFORE UPDATE ON public.security_reserves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fee_config_updated_at
  BEFORE UPDATE ON public.fee_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
