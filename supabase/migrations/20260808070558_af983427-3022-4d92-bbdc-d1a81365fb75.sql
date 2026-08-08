-- =========================================================
-- 1. GRANTS: revoga acesso amplo e concede o mínimo necessário
-- =========================================================
REVOKE ALL ON public.bank_accounts, public.wallet_ledger, public.split_entries,
  public.payout_requests, public.payouts, public.reserve_entries,
  public.security_reserves, public.fee_config FROM anon, authenticated;

GRANT ALL ON public.bank_accounts, public.wallet_ledger, public.split_entries,
  public.payout_requests, public.payouts, public.reserve_entries,
  public.security_reserves, public.fee_config TO service_role;

-- produtor gerencia contas bancárias
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
-- somente leitura nas demais
GRANT SELECT ON public.wallet_ledger TO authenticated;
GRANT SELECT ON public.split_entries TO authenticated;
GRANT SELECT ON public.reserve_entries TO authenticated;
GRANT SELECT ON public.security_reserves TO authenticated;
GRANT SELECT ON public.payout_requests TO authenticated;
GRANT SELECT ON public.payouts TO authenticated;
-- fee_config: nenhum acesso ao cliente

-- =========================================================
-- 2. RLS habilitado em todas
-- =========================================================
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserve_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_reserves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_config ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 3. bank_accounts
-- =========================================================
DROP POLICY IF EXISTS workspace_members_manage_bank_accounts ON public.bank_accounts;
CREATE POLICY bank_accounts_select_own_workspace ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY bank_accounts_insert_own_workspace ON public.bank_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));
CREATE POLICY bank_accounts_update_own_workspace ON public.bank_accounts
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));
CREATE POLICY bank_accounts_delete_own_workspace ON public.bank_accounts
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id));

-- =========================================================
-- 4. wallet_ledger (somente leitura)
-- =========================================================
DROP POLICY IF EXISTS service_insert_ledger ON public.wallet_ledger;
DROP POLICY IF EXISTS workspace_members_read_ledger ON public.wallet_ledger;
CREATE POLICY wallet_ledger_select_own_workspace ON public.wallet_ledger
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id) OR public.is_admin_user(auth.uid()));

-- =========================================================
-- 5. split_entries (somente leitura)
-- =========================================================
DROP POLICY IF EXISTS "Workspace members can view split entries" ON public.split_entries;
CREATE POLICY split_entries_select_own_workspace ON public.split_entries
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id) OR public.is_admin_user(auth.uid()));

-- =========================================================
-- 6. reserve_entries (somente leitura)
-- =========================================================
DROP POLICY IF EXISTS admin_all_reserve_entries ON public.reserve_entries;
DROP POLICY IF EXISTS workspace_read_reserves ON public.reserve_entries;
CREATE POLICY reserve_entries_select_own_workspace ON public.reserve_entries
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id) OR public.is_admin_user(auth.uid()));

-- =========================================================
-- 7. security_reserves (somente leitura)
-- =========================================================
DROP POLICY IF EXISTS "Workspace admins can insert reserves" ON public.security_reserves;
DROP POLICY IF EXISTS "Workspace admins can update reserves" ON public.security_reserves;
DROP POLICY IF EXISTS "Workspace members can view reserves" ON public.security_reserves;
CREATE POLICY security_reserves_select_own_workspace ON public.security_reserves
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id) OR public.is_admin_user(auth.uid()));

-- =========================================================
-- 8. payout_requests (leitura; insert apenas via edge function/service role)
-- =========================================================
DROP POLICY IF EXISTS "Workspace owners can create payout requests" ON public.payout_requests;
DROP POLICY IF EXISTS "Workspace members can view payout requests" ON public.payout_requests;
CREATE POLICY payout_requests_select_own_workspace ON public.payout_requests
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id) OR public.is_admin_user(auth.uid()));

-- =========================================================
-- 9. payouts (somente leitura)
-- =========================================================
DROP POLICY IF EXISTS "Workspace owners can manage payouts" ON public.payouts;
DROP POLICY IF EXISTS "Affiliates can view own payouts" ON public.payouts;
CREATE POLICY payouts_select_own ON public.payouts
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id)
    OR affiliate_id IN (SELECT a.id FROM public.affiliates a WHERE a.user_id = auth.uid())
    OR public.is_admin_user(auth.uid())
  );

-- =========================================================
-- 10. fee_config: nenhum acesso do cliente
-- =========================================================
DROP POLICY IF EXISTS "Anyone can read fee config" ON public.fee_config;
DROP POLICY IF EXISTS "Only platform admin can modify fee config" ON public.fee_config;

-- Função segura para exibir apenas as taxas de vitrine do plano
CREATE OR REPLACE FUNCTION public.get_plan_fee_summary(p_plan text)
RETURNS TABLE (
  plan_type text,
  credit_card_percent numeric,
  pix_percent numeric,
  platform_percent numeric,
  boleto_fixed_cents integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.plan_type, f.credit_card_percent, f.pix_percent, f.platform_percent, f.boleto_fixed_cents
  FROM public.fee_config f
  WHERE f.plan_type = p_plan
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_plan_fee_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_plan_fee_summary(text) TO authenticated, service_role;