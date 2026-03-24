
-- Split rules per product/workspace
CREATE TABLE public.split_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  platform_percent numeric(5,2) NOT NULL DEFAULT 10.00,
  creator_percent numeric(5,2) NOT NULL DEFAULT 90.00,
  affiliate_percent numeric(5,2) NOT NULL DEFAULT 0.00,
  hold_days integer NOT NULL DEFAULT 14,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Split entries (one per sale component)
CREATE TABLE public.split_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  split_rule_id uuid REFERENCES public.split_rules(id),
  gross_amount integer NOT NULL,
  gateway_fee integer NOT NULL DEFAULT 0,
  platform_fee integer NOT NULL DEFAULT 0,
  affiliate_fee integer NOT NULL DEFAULT 0,
  creator_net integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz,
  settled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Payout requests
CREATE TABLE public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  requested_by uuid NOT NULL,
  amount integer NOT NULL,
  fee integer NOT NULL DEFAULT 0,
  net_amount integer NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  processed_at timestamptz,
  failed_reason text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_split_rules_workspace ON public.split_rules(workspace_id);
CREATE INDEX idx_split_rules_product ON public.split_rules(product_id);
CREATE UNIQUE INDEX idx_split_rules_default ON public.split_rules(workspace_id) WHERE is_default = true;
CREATE INDEX idx_split_entries_workspace ON public.split_entries(workspace_id);
CREATE INDEX idx_split_entries_order ON public.split_entries(order_id);
CREATE INDEX idx_split_entries_status ON public.split_entries(status);
CREATE INDEX idx_payout_requests_workspace ON public.payout_requests(workspace_id);

-- RLS
ALTER TABLE public.split_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for split_rules
CREATE POLICY "Workspace members can view split rules" ON public.split_rules
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Workspace owners can manage split rules" ON public.split_rules
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role = 'OWNER')
  );

-- RLS policies for split_entries
CREATE POLICY "Workspace members can view split entries" ON public.split_entries
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

-- RLS policies for payout_requests
CREATE POLICY "Workspace members can view payout requests" ON public.payout_requests
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Workspace owners can create payout requests" ON public.payout_requests
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role = 'OWNER')
  );

-- Function to get split rule for a product/workspace (falls back to default)
CREATE OR REPLACE FUNCTION public.get_split_rule(p_workspace_id uuid, p_product_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  platform_percent numeric,
  creator_percent numeric,
  affiliate_percent numeric,
  hold_days integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sr.id, sr.platform_percent, sr.creator_percent, sr.affiliate_percent, sr.hold_days
  FROM split_rules sr
  WHERE sr.workspace_id = p_workspace_id
    AND (sr.product_id = p_product_id OR (sr.product_id IS NULL AND sr.is_default = true))
  ORDER BY sr.product_id NULLS LAST
  LIMIT 1;
$$;

-- Function to get creator balance from split_entries
CREATE OR REPLACE FUNCTION public.get_creator_balance(p_workspace_id uuid)
RETURNS TABLE(
  total_gross bigint,
  total_fees bigint,
  total_net bigint,
  available_balance bigint,
  pending_balance bigint,
  total_payouts bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(se.gross_amount), 0)::bigint AS total_gross,
    COALESCE(SUM(se.gateway_fee + se.platform_fee + se.affiliate_fee), 0)::bigint AS total_fees,
    COALESCE(SUM(se.creator_net), 0)::bigint AS total_net,
    COALESCE(SUM(CASE WHEN se.status = 'available' OR (se.status = 'pending' AND se.available_at <= now()) THEN se.creator_net ELSE 0 END), 0)::bigint
      - COALESCE((SELECT SUM(pr.amount) FROM payout_requests pr WHERE pr.workspace_id = p_workspace_id AND pr.status IN ('requested','processing')), 0)::bigint
      AS available_balance,
    COALESCE(SUM(CASE WHEN se.status = 'pending' AND se.available_at > now() THEN se.creator_net ELSE 0 END), 0)::bigint AS pending_balance,
    COALESCE((SELECT SUM(pr.net_amount) FROM payout_requests pr WHERE pr.workspace_id = p_workspace_id AND pr.status = 'paid'), 0)::bigint AS total_payouts
  FROM split_entries se
  WHERE se.workspace_id = p_workspace_id AND se.status != 'refunded';
$$;
