-- ============================================================
-- BLOCO 1 — Comissões: consistência, idempotência e segurança
-- Migration idempotente. NÃO faz backfill financeiro.
-- ============================================================

-- ------------------------------------------------------------
-- 1. referral_commissions.payment_id uuid -> text
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referral_commissions'
      AND column_name = 'payment_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.referral_commissions
      ALTER COLUMN payment_id TYPE text USING payment_id::text;
    RAISE NOTICE 'referral_commissions.payment_id convertido para text';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Checagens defensivas + índices únicos parciais
--    ABORTA se houver duplicatas. Nunca apaga/mescla dados.
-- ------------------------------------------------------------
DO $$
DECLARE v_dups text;
BEGIN
  SELECT string_agg(order_id::text, ', ') INTO v_dups
  FROM (
    SELECT order_id FROM public.split_entries
    WHERE order_id IS NOT NULL GROUP BY order_id HAVING count(*) > 1
  ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: split_entries possui order_id duplicados (%). Resolva manualmente antes de aplicar esta migration.', v_dups;
  END IF;
END $$;

DO $$
DECLARE v_dups text;
BEGIN
  SELECT string_agg(order_id::text || '/' || type, ', ') INTO v_dups
  FROM (
    SELECT order_id, type FROM public.wallet_ledger
    WHERE order_id IS NOT NULL GROUP BY order_id, type HAVING count(*) > 1
  ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: wallet_ledger possui (order_id,type) duplicados (%). Resolva manualmente antes de aplicar esta migration.', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_split_entries_order
  ON public.split_entries (order_id) WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_ledger_order_type
  ON public.wallet_ledger (order_id, type) WHERE order_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. FK orders.affiliate_link_id -> affiliate_links(id)
--    ABORTA se existirem órfãos.
-- ------------------------------------------------------------
DO $$
DECLARE v_orphans bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_affiliate_link_id_fkey'
  ) THEN
    SELECT count(*) INTO v_orphans
    FROM public.orders o
    WHERE o.affiliate_link_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.affiliate_links al WHERE al.id = o.affiliate_link_id);

    IF v_orphans > 0 THEN
      RAISE EXCEPTION 'ABORTADO: % pedido(s) referenciam affiliate_link_id inexistente. Nenhum pedido foi alterado.', v_orphans;
    END IF;

    ALTER TABLE public.orders
      ADD CONSTRAINT orders_affiliate_link_id_fkey
      FOREIGN KEY (affiliate_link_id) REFERENCES public.affiliate_links(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. Unicidade parcial referral_commissions(payment_id,event_type)
--    ABORTA se houver duplicatas legítimas conflitantes.
-- ------------------------------------------------------------
DO $$
DECLARE v_dups text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'ux_referral_commissions_payment_event'
  ) THEN
    SELECT string_agg(payment_id || '/' || coalesce(event_type, '-'), ', ') INTO v_dups
    FROM (
      SELECT payment_id, event_type FROM public.referral_commissions
      WHERE payment_id IS NOT NULL GROUP BY payment_id, event_type HAVING count(*) > 1
    ) d;

    IF v_dups IS NOT NULL THEN
      RAISE EXCEPTION 'ABORTADO: referral_commissions possui (payment_id,event_type) duplicados (%).', v_dups;
    END IF;

    CREATE UNIQUE INDEX ux_referral_commissions_payment_event
      ON public.referral_commissions (payment_id, event_type) WHERE payment_id IS NOT NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. get_wallet_balance / calculate_payout_risk
--    search_path fixo, sem anon/public, membership validada.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_workspace_id uuid)
RETURNS TABLE (available_balance bigint, pending_balance bigint, total_balance bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role (chamadas internas) não tem auth.uid(); usuários precisam de membership
  IF auth.uid() IS NOT NULL AND NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado ao workspace';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN wl.status IN ('available', 'settled') THEN wl.amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN wl.status = 'pending' THEN wl.amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN wl.status IN ('available', 'settled', 'pending') THEN wl.amount ELSE 0 END), 0)::bigint
  FROM public.wallet_ledger wl
  WHERE wl.workspace_id = p_workspace_id;
END $$;

REVOKE ALL ON FUNCTION public.get_wallet_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.calculate_payout_risk(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_payout_risk(uuid) TO service_role;

-- ------------------------------------------------------------
-- 6. Afiliado: remove UPDATE direto inseguro + RPC de perfil
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Affiliates can update own profile fields" ON public.affiliates;
DROP POLICY IF EXISTS "Affiliates can update own record" ON public.affiliates;
DROP POLICY IF EXISTS "affiliates_update_own" ON public.affiliates;

-- Owners/admins continuam gerenciando campos administrativos
DROP POLICY IF EXISTS "Workspace owners can manage affiliates" ON public.affiliates;
CREATE POLICY "Workspace owners can manage affiliates"
ON public.affiliates FOR ALL TO authenticated
USING (
  workspace_id IN (
    SELECT wm.workspace_id FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid() AND wm.role IN ('OWNER', 'ADMIN')
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT wm.workspace_id FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid() AND wm.role IN ('OWNER', 'ADMIN')
  )
);

CREATE OR REPLACE FUNCTION public.update_my_affiliate_profile(
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_pix_key text DEFAULT NULL,
  p_bank_account jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Somente dados pessoais/pagamento. status, approved_at, workspace_id e
  -- user_id nunca são tocados aqui.
  UPDATE public.affiliates a
  SET name         = COALESCE(NULLIF(trim(p_name), ''), a.name),
      phone        = COALESCE(p_phone, a.phone),
      pix_key      = COALESCE(p_pix_key, a.pix_key),
      bank_account = COALESCE(p_bank_account, a.bank_account),
      updated_at   = now()
  WHERE a.user_id = auth.uid()
  RETURNING a.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Cadastro de afiliado não encontrado para este usuário';
  END IF;

  RETURN jsonb_build_object('ok', true, 'affiliate_id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.update_my_affiliate_profile(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_affiliate_profile(text, text, text, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- 7. Um único trigger de geração de affiliate_links.code
-- ------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tg.tgname FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    WHERE c.relname = 'affiliate_links' AND NOT tg.tgisinternal
      AND tg.tgname <> 'trg_affiliate_link_code'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.affiliate_links', t.tgname);
    RAISE NOTICE 'Trigger redundante removido: %', t.tgname;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 8. Nomes canônicos (wrappers internos, service_role only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_and_record_affiliate_click(
  p_code text,
  p_session_id text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.register_affiliate_click(p_code, p_session_id, p_product_id) $$;

REVOKE ALL ON FUNCTION public.validate_and_record_affiliate_click(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_record_affiliate_click(text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.process_order_financials(
  p_order_id uuid,
  p_gateway_fee_cents integer DEFAULT 0,
  p_settle boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.process_order_commission(p_order_id, p_gateway_fee_cents, p_settle) $$;

REVOKE ALL ON FUNCTION public.process_order_financials(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_financials(uuid, integer, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.release_matured_commissions()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.approve_due_commissions() $$;

REVOKE ALL ON FUNCTION public.release_matured_commissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_matured_commissions() TO service_role;

REVOKE ALL ON FUNCTION public.prepare_affiliate_payouts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_affiliate_payouts(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.process_order_commission(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_commission(uuid, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.register_affiliate_click(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_affiliate_click(text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.approve_due_commissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_due_commissions() TO service_role;