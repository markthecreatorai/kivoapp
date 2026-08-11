-- ============================================================
-- 1. SCHEMA FIXES (idempotent, non-destructive)
-- ============================================================

-- 1.1 referral_commissions.payment_id uuid -> text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='referral_commissions'
      AND column_name='payment_id' AND data_type='uuid'
  ) THEN
    ALTER TABLE public.referral_commissions
      ALTER COLUMN payment_id TYPE text USING payment_id::text;
  END IF;
END $$;

-- 1.2 affiliate tracking session (needed to bind an order to a valid attribution)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS affiliate_session_id text;
ALTER TABLE public.checkout_sessions ADD COLUMN IF NOT EXISTS affiliate_session_id text;

-- 1.3 FK orders.affiliate_link_id -> affiliate_links(id) (defensive)
DO $$
DECLARE v_orphans bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_affiliate_link_id_fkey'
  ) THEN
    SELECT count(*) INTO v_orphans
    FROM public.orders o
    WHERE o.affiliate_link_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.affiliate_links al WHERE al.id = o.affiliate_link_id);

    IF v_orphans > 0 THEN
      RAISE EXCEPTION 'Abortando: % pedidos apontam para affiliate_links inexistentes. Corrija manualmente antes de criar a FK.', v_orphans;
    END IF;

    ALTER TABLE public.orders
      ADD CONSTRAINT orders_affiliate_link_id_fkey
      FOREIGN KEY (affiliate_link_id) REFERENCES public.affiliate_links(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 1.4 Unique partial indexes (abort on duplicates, never merge/delete)
DO $$
DECLARE v_dup bigint;
BEGIN
  SELECT count(*) INTO v_dup FROM (
    SELECT order_id FROM public.split_entries
    WHERE order_id IS NOT NULL GROUP BY order_id HAVING count(*) > 1
  ) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'Abortando: % pedidos com split_entries duplicados. Resolva manualmente.', v_dup;
  END IF;

  SELECT count(*) INTO v_dup FROM (
    SELECT order_id, type FROM public.wallet_ledger
    WHERE order_id IS NOT NULL GROUP BY order_id, type HAVING count(*) > 1
  ) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'Abortando: % combinações (order_id,type) duplicadas em wallet_ledger. Resolva manualmente.', v_dup;
  END IF;

  SELECT count(*) INTO v_dup FROM (
    SELECT payment_id, coalesce(event_type,'') et FROM public.referral_commissions
    WHERE payment_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1
  ) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'Abortando: % comissões de indicação duplicadas por pagamento/evento. Resolva manualmente.', v_dup;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_split_entries_order
  ON public.split_entries (order_id) WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_ledger_order_type
  ON public.wallet_ledger (order_id, type) WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_referral_commissions_payment_event
  ON public.referral_commissions (payment_id, coalesce(event_type,''))
  WHERE payment_id IS NOT NULL;

-- attribution idempotency per link+session
CREATE UNIQUE INDEX IF NOT EXISTS ux_affiliate_attributions_link_session
  ON public.affiliate_attributions (affiliate_link_id, session_id)
  WHERE session_id IS NOT NULL;

-- one locked referral attribution per referred user
CREATE UNIQUE INDEX IF NOT EXISTS ux_referral_attributions_referred_user
  ON public.referral_attributions (referred_user_id)
  WHERE referred_user_id IS NOT NULL;

-- 1.5 Sanity checks (NOT VALID: never break existing rows)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='affiliate_programs_commission_percent_range') THEN
    ALTER TABLE public.affiliate_programs
      ADD CONSTRAINT affiliate_programs_commission_percent_range
      CHECK (default_commission_percent >= 0 AND default_commission_percent <= 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='commissions_amount_non_negative') THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_amount_non_negative CHECK (amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='split_entries_fees_non_negative') THEN
    ALTER TABLE public.split_entries
      ADD CONSTRAINT split_entries_fees_non_negative
      CHECK (gross_amount >= 0 AND gateway_fee >= 0 AND platform_fee >= 0 AND affiliate_fee >= 0) NOT VALID;
  END IF;
END $$;

-- ============================================================
-- 2. AFFILIATE LINK CODE: single generation path
-- ============================================================
DROP TRIGGER IF EXISTS tr_generate_affiliate_code ON public.affiliate_links;
DROP FUNCTION IF EXISTS public.generate_affiliate_code();

-- ============================================================
-- 3. AFFILIATES: no self-approval
-- ============================================================
DROP POLICY IF EXISTS "Affiliates can update own record" ON public.affiliates;

CREATE POLICY "Affiliates can update own profile fields"
  ON public.affiliates FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fn_affiliates_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / internal writes bypass the guard
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- workspace owners/admins may manage lifecycle columns
  IF public.is_workspace_admin(OLD.workspace_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.commission_percent IS DISTINCT FROM OLD.commission_percent
  THEN
    RAISE EXCEPTION 'Você não pode alterar status, aprovação, comissão ou vínculo do afiliado';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_affiliates_guard_privileged ON public.affiliates;
CREATE TRIGGER trg_affiliates_guard_privileged
  BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION public.fn_affiliates_guard_privileged_columns();

-- ============================================================
-- 4. SECURITY DEFINER privileges hardening
-- ============================================================
REVOKE ALL ON FUNCTION public.get_wallet_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.calculate_payout_risk(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_payout_risk(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_split_rule(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_split_rule(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_split_rule(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_split_rule(uuid, uuid, text) TO service_role;

-- ============================================================
-- 5. AFFILIATE CLICK + ATTRIBUTION (race-safe, idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_affiliate_click(
  p_code text,
  p_session_id text,
  p_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.affiliate_links;
  v_aff public.affiliates;
  v_prog public.affiliate_programs;
  v_days integer := 30;
  v_expires timestamptz;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 OR length(p_code) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code inválido');
  END IF;

  SELECT * INTO v_link FROM public.affiliate_links WHERE code = lower(trim(p_code));
  IF v_link.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Código não encontrado');
  END IF;

  SELECT * INTO v_aff FROM public.affiliates WHERE id = v_link.affiliate_id;
  IF v_aff.id IS NULL OR upper(coalesce(v_aff.status,'')) <> 'APPROVED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Afiliado não aprovado');
  END IF;

  SELECT * INTO v_prog FROM public.affiliate_programs WHERE workspace_id = v_aff.workspace_id;
  IF v_prog.id IS NULL OR coalesce(v_prog.is_enabled, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Programa de afiliados desativado');
  END IF;

  IF p_product_id IS NOT NULL AND v_link.product_id IS NOT NULL AND v_link.product_id <> p_product_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Link não vale para este produto');
  END IF;

  v_days := coalesce(v_prog.cookie_duration_days, 30);
  v_expires := now() + (v_days || ' days')::interval;

  UPDATE public.affiliate_links
     SET click_count = coalesce(click_count, 0) + 1
   WHERE id = v_link.id;

  IF p_session_id IS NOT NULL AND length(p_session_id) > 0 THEN
    INSERT INTO public.affiliate_attributions (affiliate_link_id, session_id, expires_at)
    VALUES (v_link.id, left(p_session_id, 100), v_expires)
    ON CONFLICT (affiliate_link_id, session_id) WHERE session_id IS NOT NULL
    DO UPDATE SET expires_at = GREATEST(public.affiliate_attributions.expires_at, EXCLUDED.expires_at);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'affiliate_link_id', v_link.id,
    'expires_at', v_expires,
    'workspace_id', v_aff.workspace_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_affiliate_click(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_affiliate_click(text, text, uuid) TO service_role;

-- ============================================================
-- 6. SINGLE SOURCE OF TRUTH: order commission processing
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_affiliate_for_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_link_id uuid;
  v_session text;
  v_link public.affiliate_links;
  v_aff public.affiliates;
  v_prog public.affiliate_programs;
  v_percent numeric;
  v_attr_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  v_link_id := v_order.affiliate_link_id;
  v_session := v_order.affiliate_session_id;

  IF v_order.checkout_session_id IS NOT NULL THEN
    SELECT coalesce(v_link_id, cs.affiliate_link_id), coalesce(v_session, cs.affiliate_session_id)
      INTO v_link_id, v_session
      FROM public.checkout_sessions cs WHERE cs.id = v_order.checkout_session_id;
  END IF;

  IF v_link_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_affiliate_link');
  END IF;

  SELECT * INTO v_link FROM public.affiliate_links WHERE id = v_link_id;
  IF v_link.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'link_not_found');
  END IF;

  SELECT * INTO v_aff FROM public.affiliates WHERE id = v_link.affiliate_id;
  IF v_aff.id IS NULL OR upper(coalesce(v_aff.status,'')) <> 'APPROVED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'affiliate_not_approved');
  END IF;

  IF v_aff.workspace_id IS DISTINCT FROM v_order.workspace_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cross_workspace');
  END IF;

  SELECT * INTO v_prog FROM public.affiliate_programs WHERE workspace_id = v_aff.workspace_id;
  IF v_prog.id IS NULL OR coalesce(v_prog.is_enabled, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'program_disabled');
  END IF;

  IF v_link.product_id IS NOT NULL AND v_order.product_id IS NOT NULL
     AND v_link.product_id <> v_order.product_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_mismatch');
  END IF;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_attribution_session');
  END IF;

  SELECT id INTO v_attr_id
    FROM public.affiliate_attributions
   WHERE affiliate_link_id = v_link.id
     AND session_id = v_session
     AND (expires_at IS NULL OR expires_at > now())
   LIMIT 1;

  IF v_attr_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attribution_invalid_or_expired');
  END IF;

  -- product override (commission_rules) then program default
  SELECT cr.percent INTO v_percent
    FROM public.commission_rules cr
   WHERE cr.workspace_id = v_aff.workspace_id
     AND cr.product_id = v_order.product_id
   LIMIT 1;

  v_percent := coalesce(v_percent, v_prog.default_commission_percent, 0);
  IF v_percent < 0 OR v_percent > 100 THEN v_percent := 0; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'affiliate_link_id', v_link.id,
    'affiliate_id', v_aff.id,
    'attribution_id', v_attr_id,
    'session_id', v_session,
    'commission_percent', v_percent,
    'hold_days', coalesce(v_prog.hold_days, 14)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_affiliate_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_affiliate_for_order(uuid) TO service_role;

-- Amount units: orders.total_amount / commissions.amount are BRL (numeric);
-- split_entries.* and wallet_ledger.amount are cents (integer).
CREATE OR REPLACE FUNCTION public.process_order_commission(
  p_order_id uuid,
  p_gateway_fee_cents integer DEFAULT NULL,
  p_settle boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_aff jsonb;
  v_rule record;
  v_gross_cents integer;
  v_gateway_cents integer;
  v_net_cents integer;
  v_platform_percent numeric := 8;
  v_platform_cents integer;
  v_commission_brl numeric := 0;
  v_affiliate_cents integer := 0;
  v_creator_cents integer;
  v_hold_days integer := 14;
  v_available timestamptz;
  v_existing public.split_entries;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_order.status <> 'COMPLETED' OR v_order.paid_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_paid');
  END IF;

  -- Commission base = orders.total_amount (already net of coupon/pix discounts)
  v_gross_cents := round(coalesce(v_order.total_amount, 0) * 100)::integer;
  IF v_gross_cents <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'zero_amount');
  END IF;

  SELECT * INTO v_existing FROM public.split_entries WHERE order_id = v_order.id;

  SELECT * INTO v_rule FROM public.get_split_rule(
    v_order.workspace_id, v_order.product_id, v_order.payment_method
  );
  v_platform_percent := coalesce(v_rule.platform_percent, 8);
  v_hold_days := coalesce(v_rule.hold_days, 14);

  v_gateway_cents := coalesce(p_gateway_fee_cents, v_existing.gateway_fee, round(v_gross_cents * 3.49 / 100)::integer);
  v_net_cents := v_gross_cents - v_gateway_cents;
  v_platform_cents := round(v_net_cents * v_platform_percent / 100)::integer;

  v_aff := public.resolve_affiliate_for_order(v_order.id);
  IF (v_aff->>'ok')::boolean THEN
    v_commission_brl := round(coalesce(v_order.total_amount,0) * (v_aff->>'commission_percent')::numeric / 100, 2);
    v_affiliate_cents := round(v_commission_brl * 100)::integer;
  END IF;

  v_creator_cents := v_net_cents - v_platform_cents - v_affiliate_cents;
  IF v_creator_cents < 0 THEN
    v_affiliate_cents := GREATEST(v_net_cents - v_platform_cents, 0);
    v_commission_brl := round(v_affiliate_cents::numeric / 100, 2);
    v_creator_cents := v_net_cents - v_platform_cents - v_affiliate_cents;
  END IF;

  v_available := v_order.paid_at + (v_hold_days || ' days')::interval;

  INSERT INTO public.split_entries (
    workspace_id, order_id, split_rule_id, gross_amount, gateway_fee,
    platform_fee, affiliate_fee, creator_net, status, available_at, settled_at
  ) VALUES (
    v_order.workspace_id, v_order.id, v_rule.id, v_gross_cents, v_gateway_cents,
    v_platform_cents, v_affiliate_cents, v_creator_cents,
    CASE WHEN p_settle THEN 'settled' ELSE 'pending' END,
    CASE WHEN p_settle THEN v_available ELSE NULL END,
    CASE WHEN p_settle THEN now() ELSE NULL END
  )
  ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO UPDATE
    SET gross_amount = EXCLUDED.gross_amount,
        gateway_fee = EXCLUDED.gateway_fee,
        platform_fee = EXCLUDED.platform_fee,
        affiliate_fee = EXCLUDED.affiliate_fee,
        creator_net = EXCLUDED.creator_net,
        status = CASE WHEN public.split_entries.status IN ('refunded','reversed')
                      THEN public.split_entries.status ELSE EXCLUDED.status END,
        available_at = COALESCE(public.split_entries.available_at, EXCLUDED.available_at),
        settled_at = COALESCE(public.split_entries.settled_at, EXCLUDED.settled_at)
    WHERE public.split_entries.status NOT IN ('settled','refunded','reversed');

  IF p_settle THEN
    INSERT INTO public.wallet_ledger (
      workspace_id, order_id, type, amount, status, available_at, description
    ) VALUES (
      v_order.workspace_id, v_order.id, 'sale', v_creator_cents, 'pending', v_available,
      'Venda #' || left(v_order.id::text, 8)
    )
    ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING;
  END IF;

  IF (v_aff->>'ok')::boolean AND v_affiliate_cents > 0 THEN
    INSERT INTO public.commissions (affiliate_id, order_id, amount, status, hold_until)
    VALUES (
      (v_aff->>'affiliate_id')::uuid, v_order.id, v_commission_brl, 'PENDING',
      v_order.paid_at + ((v_aff->>'hold_days')::integer || ' days')::interval
    )
    ON CONFLICT (order_id, affiliate_id) DO NOTHING;

    UPDATE public.affiliate_attributions
       SET converted_at = coalesce(converted_at, now())
     WHERE id = (v_aff->>'attribution_id')::uuid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'gross_cents', v_gross_cents,
    'gateway_fee_cents', v_gateway_cents,
    'platform_fee_cents', v_platform_cents,
    'affiliate_fee_cents', v_affiliate_cents,
    'commission_brl', v_commission_brl,
    'creator_net_cents', v_creator_cents,
    'affiliate', v_aff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_order_commission(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_commission(uuid, integer, boolean) TO service_role;

-- refund/chargeback: cancel unpaid affiliate commission (idempotent)
CREATE OR REPLACE FUNCTION public.cancel_order_commission(p_order_id uuid, p_reason text DEFAULT 'refund')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.commissions
     SET status = 'CANCELLED', updated_at = now()
   WHERE order_id = p_order_id
     AND status IN ('PENDING','APPROVED');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'cancelled', v_count, 'reason', p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order_commission(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_commission(uuid, text) TO service_role;

-- ============================================================
-- 7. REFERRALS (subscription indications)
-- ============================================================
CREATE OR REPLACE FUNCTION public.attach_referral_attribution(
  p_referral_code text,
  p_referred_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.referral_profiles;
  v_existing public.referral_attributions;
BEGIN
  IF p_referred_user_id IS NULL OR p_referral_code IS NULL OR length(trim(p_referral_code)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT * INTO v_existing FROM public.referral_attributions
   WHERE referred_user_id = p_referred_user_id FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    -- first valid attribution is locked; never swapped
    RETURN jsonb_build_object('ok', true, 'locked', true, 'attribution_id', v_existing.id);
  END IF;

  SELECT * INTO v_profile FROM public.referral_profiles
   WHERE lower(referral_code) = lower(trim(p_referral_code));
  IF v_profile.id IS NULL OR lower(coalesce(v_profile.status,'')) <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'referrer_inactive');
  END IF;
  IF v_profile.user_id = p_referred_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  INSERT INTO public.referral_attributions (
    referrer_user_id, referred_user_id, referral_code, referral_status
  ) VALUES (
    v_profile.user_id, p_referred_user_id, v_profile.referral_code, 'pending'
  )
  ON CONFLICT (referred_user_id) WHERE referred_user_id IS NOT NULL DO NOTHING;

  SELECT * INTO v_existing FROM public.referral_attributions WHERE referred_user_id = p_referred_user_id;
  RETURN jsonb_build_object('ok', true, 'locked', false, 'attribution_id', v_existing.id);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_referral_attribution(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_referral_attribution(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_subscription_referral_commission(
  p_referred_user_id uuid,
  p_payment_id text,
  p_amount numeric,
  p_event_type text DEFAULT 'subscription_payment',
  p_subscription_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attr public.referral_attributions;
  v_rate numeric := 0.20;
  v_amount numeric;
  v_id uuid;
BEGIN
  IF p_payment_id IS NULL OR length(trim(p_payment_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_id_required');
  END IF;
  IF coalesce(p_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT * INTO v_attr FROM public.referral_attributions
   WHERE referred_user_id = p_referred_user_id
     AND lower(coalesce(referral_status,'')) IN ('pending','converted','active')
   FOR UPDATE;

  IF v_attr.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_attribution');
  END IF;

  v_amount := round(p_amount * v_rate, 2);

  INSERT INTO public.referral_commissions (
    attribution_id, referrer_user_id, payment_id, event_type,
    commission_amount, commission_rate, base_amount, status, available_at
  ) VALUES (
    v_attr.id, v_attr.referrer_user_id, p_payment_id, p_event_type,
    v_amount, v_rate, p_amount, 'pending', now() + interval '30 days'
  )
  ON CONFLICT (payment_id, coalesce(event_type,'')) WHERE payment_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  UPDATE public.referral_attributions
     SET referral_status = 'converted',
         first_paid_at = coalesce(first_paid_at, now()),
         first_paid_subscription_at = coalesce(first_paid_subscription_at, now())
   WHERE id = v_attr.id;

  RETURN jsonb_build_object('ok', true, 'commission_id', v_id, 'duplicate', v_id IS NULL, 'amount', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.record_subscription_referral_commission(uuid, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_subscription_referral_commission(uuid, text, numeric, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_referral_commissions_for_payment(p_payment_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.referral_commissions
     SET status = 'cancelled'
   WHERE payment_id = p_payment_id
     AND lower(coalesce(status,'')) IN ('pending','available');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'cancelled', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_referral_commissions_for_payment(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_referral_commissions_for_payment(text) TO service_role;

-- ============================================================
-- 8. RELEASE + PAYOUT PREPARATION (idempotent, no external transfer)
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_due_commissions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_aff integer; v_ref integer;
BEGIN
  UPDATE public.commissions c
     SET status = 'APPROVED', updated_at = now()
   WHERE c.status = 'PENDING'
     AND c.hold_until IS NOT NULL AND c.hold_until <= now()
     AND NOT EXISTS (
       SELECT 1 FROM public.refunds r WHERE r.order_id = c.order_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.chargeback_cases cb WHERE cb.order_id = c.order_id
     );
  GET DIAGNOSTICS v_aff = ROW_COUNT;

  UPDATE public.referral_commissions rc
     SET status = 'available'
   WHERE lower(coalesce(rc.status,'')) = 'pending'
     AND rc.available_at IS NOT NULL AND rc.available_at <= now();
  GET DIAGNOSTICS v_ref = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'commissions_approved', v_aff, 'referral_available', v_ref);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_due_commissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_due_commissions() TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_affiliate_payouts(p_workspace_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_payout_id uuid;
  v_min numeric;
  v_created integer := 0;
BEGIN
  FOR r IN
    SELECT c.affiliate_id, a.workspace_id, sum(c.amount) AS total
      FROM public.commissions c
      JOIN public.affiliates a ON a.id = c.affiliate_id
     WHERE c.status = 'APPROVED'
       AND (p_workspace_id IS NULL OR a.workspace_id = p_workspace_id)
       AND NOT EXISTS (SELECT 1 FROM public.payout_items pi WHERE pi.commission_id = c.id)
     GROUP BY c.affiliate_id, a.workspace_id
  LOOP
    SELECT coalesce(ap.min_payout_amount, 0) INTO v_min
      FROM public.affiliate_programs ap WHERE ap.workspace_id = r.workspace_id;

    CONTINUE WHEN r.total < coalesce(v_min, 0);

    INSERT INTO public.payouts (workspace_id, affiliate_id, amount, status)
    VALUES (r.workspace_id, r.affiliate_id, r.total, 'PENDING')
    RETURNING id INTO v_payout_id;

    INSERT INTO public.payout_items (payout_id, commission_id, amount)
    SELECT v_payout_id, c.id, c.amount
      FROM public.commissions c
     WHERE c.affiliate_id = r.affiliate_id
       AND c.status = 'APPROVED'
       AND NOT EXISTS (SELECT 1 FROM public.payout_items pi WHERE pi.commission_id = c.id);

    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'payouts_prepared', v_created, 'external_transfer_enabled', false);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_affiliate_payouts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_affiliate_payouts(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_referral_payouts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; v_payout_id uuid; v_created integer := 0;
BEGIN
  FOR r IN
    SELECT rc.referrer_user_id, sum(rc.commission_amount) AS total
      FROM public.referral_commissions rc
     WHERE lower(coalesce(rc.status,'')) = 'available'
       AND rc.payout_id IS NULL
     GROUP BY rc.referrer_user_id
  LOOP
    INSERT INTO public.referral_payouts (referrer_user_id, amount, status)
    VALUES (r.referrer_user_id, r.total, 'pending')
    RETURNING id INTO v_payout_id;

    UPDATE public.referral_commissions
       SET payout_id = v_payout_id
     WHERE referrer_user_id = r.referrer_user_id
       AND lower(coalesce(status,'')) = 'available'
       AND payout_id IS NULL;

    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'referral_payouts_prepared', v_created, 'external_transfer_enabled', false);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_referral_payouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_referral_payouts() TO service_role;