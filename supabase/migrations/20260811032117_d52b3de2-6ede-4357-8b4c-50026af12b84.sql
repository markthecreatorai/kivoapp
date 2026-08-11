REVOKE ALL ON FUNCTION public.calculate_payout_risk(uuid) FROM authenticated;

-- ── resolve_affiliate_for_order: commission_rules has no workspace_id; supports fixed_amount
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
  v_fixed numeric;
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

  SELECT cr.percent, cr.fixed_amount INTO v_percent, v_fixed
    FROM public.commission_rules cr
   WHERE cr.product_id = v_order.product_id
     AND coalesce(cr.is_active, true) = true
   LIMIT 1;

  IF v_fixed IS NULL THEN
    v_percent := coalesce(v_percent, v_prog.default_commission_percent, 0);
    IF v_percent < 0 OR v_percent > 100 THEN v_percent := 0; END IF;
  ELSE
    v_percent := 0;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'affiliate_link_id', v_link.id,
    'affiliate_id', v_aff.id,
    'attribution_id', v_attr_id,
    'session_id', v_session,
    'commission_percent', v_percent,
    'fixed_amount', v_fixed,
    'hold_days', coalesce(v_prog.hold_days, 14)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_affiliate_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_affiliate_for_order(uuid) TO service_role;

-- ── process_order_commission: honour fixed_amount
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

  -- Commission base = orders.total_amount (ALREADY net of coupon/pix discount).
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
  v_net_cents := GREATEST(v_gross_cents - v_gateway_cents, 0);
  v_platform_cents := round(v_net_cents * v_platform_percent / 100)::integer;

  v_aff := public.resolve_affiliate_for_order(v_order.id);
  IF (v_aff->>'ok')::boolean THEN
    IF (v_aff->>'fixed_amount') IS NOT NULL THEN
      v_commission_brl := round((v_aff->>'fixed_amount')::numeric, 2);
    ELSE
      v_commission_brl := round(coalesce(v_order.total_amount,0) * (v_aff->>'commission_percent')::numeric / 100, 2);
    END IF;
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
        status = EXCLUDED.status,
        available_at = COALESCE(public.split_entries.available_at, EXCLUDED.available_at),
        settled_at = COALESCE(public.split_entries.settled_at, EXCLUDED.settled_at)
    WHERE public.split_entries.status NOT IN ('settled','refunded','reversed');

  -- re-read the authoritative split (may have been settled by a concurrent call)
  SELECT * INTO v_existing FROM public.split_entries WHERE order_id = v_order.id;
  v_creator_cents := coalesce(v_existing.creator_net, v_creator_cents);
  v_affiliate_cents := coalesce(v_existing.affiliate_fee, v_affiliate_cents);

  IF p_settle AND v_creator_cents > 0 THEN
    INSERT INTO public.wallet_ledger (
      workspace_id, order_id, type, amount, status, available_at, description
    ) VALUES (
      v_order.workspace_id, v_order.id, 'sale', v_creator_cents, 'pending',
      coalesce(v_existing.available_at, v_available),
      'Venda #' || left(v_order.id::text, 8)
    )
    ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING;
  END IF;

  IF (v_aff->>'ok')::boolean AND v_affiliate_cents > 0 THEN
    INSERT INTO public.commissions (affiliate_id, order_id, amount, status, hold_until)
    VALUES (
      (v_aff->>'affiliate_id')::uuid, v_order.id, round(v_affiliate_cents::numeric / 100, 2), 'PENDING',
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
    'gateway_fee_cents', coalesce(v_existing.gateway_fee, v_gateway_cents),
    'platform_fee_cents', coalesce(v_existing.platform_fee, v_platform_cents),
    'affiliate_fee_cents', v_affiliate_cents,
    'commission_brl', round(v_affiliate_cents::numeric / 100, 2),
    'creator_net_cents', v_creator_cents,
    'affiliate', v_aff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_order_commission(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_commission(uuid, integer, boolean) TO service_role;

-- ── referral attribution: real columns / statuses
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
    referrer_user_id, referred_user_id, referral_code,
    referral_status, attribution_status, lock_status, signed_up_at
  ) VALUES (
    v_profile.user_id, p_referred_user_id, v_profile.referral_code,
    'pending_subscription', 'pending', 'locked', now()
  )
  ON CONFLICT (referred_user_id) WHERE referred_user_id IS NOT NULL DO NOTHING;

  SELECT * INTO v_existing FROM public.referral_attributions WHERE referred_user_id = p_referred_user_id;
  RETURN jsonb_build_object('ok', true, 'locked', false, 'attribution_id', v_existing.id);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_referral_attribution(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_referral_attribution(text, uuid) TO service_role;

-- ── referral commission: real columns, idempotent by payment/event
CREATE OR REPLACE FUNCTION public.record_subscription_referral_commission(
  p_referred_user_id uuid,
  p_payment_id text,
  p_amount numeric,
  p_event_type text DEFAULT 'recurring_payment',
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
  v_first boolean;
  v_event text;
BEGIN
  IF p_payment_id IS NULL OR length(trim(p_payment_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_id_required');
  END IF;
  IF coalesce(p_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT * INTO v_attr FROM public.referral_attributions
   WHERE referred_user_id = p_referred_user_id
     AND lower(coalesce(referral_status,'')) IN ('pending_subscription','active')
   FOR UPDATE;

  IF v_attr.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_attribution');
  END IF;

  v_first := lower(coalesce(v_attr.referral_status,'')) = 'pending_subscription';
  v_event := coalesce(nullif(p_event_type, ''), CASE WHEN v_first THEN 'first_payment' ELSE 'recurring_payment' END);
  v_amount := round(p_amount * v_rate, 2);

  INSERT INTO public.referral_commissions (
    referrer_user_id, referred_user_id, subscription_id, payment_id, event_type,
    commission_rate, gross_base_amount, commission_amount, currency, status, available_at
  ) VALUES (
    v_attr.referrer_user_id, p_referred_user_id, p_subscription_id, p_payment_id, v_event,
    v_rate, p_amount, v_amount, 'BRL', 'pending', now() + interval '30 days'
  )
  ON CONFLICT (payment_id, coalesce(event_type,'')) WHERE payment_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  UPDATE public.referral_attributions
     SET referral_status = 'active',
         attribution_status = 'converted',
         subscription_id = coalesce(p_subscription_id, subscription_id),
         payment_provider_event_id = coalesce(payment_provider_event_id, p_payment_id),
         first_paid_at = coalesce(first_paid_at, now()),
         first_paid_subscription_at = coalesce(first_paid_subscription_at, now())
   WHERE id = v_attr.id;

  RETURN jsonb_build_object(
    'ok', true, 'commission_id', v_id, 'duplicate', v_id IS NULL,
    'amount', v_amount, 'first_payment', v_first,
    'referrer_user_id', v_attr.referrer_user_id, 'attribution_id', v_attr.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_subscription_referral_commission(uuid, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_subscription_referral_commission(uuid, text, numeric, text, uuid) TO service_role;

-- ── payout preparation: real columns
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

    INSERT INTO public.payouts (workspace_id, affiliate_id, total_amount, status)
    VALUES (r.workspace_id, r.affiliate_id, r.total, 'PENDING')
    RETURNING id INTO v_payout_id;

    INSERT INTO public.payout_items (payout_id, affiliate_id, commission_id, amount)
    SELECT v_payout_id, c.affiliate_id, c.id, c.amount
      FROM public.commissions c
     WHERE c.affiliate_id = r.affiliate_id
       AND c.status = 'APPROVED'
       AND NOT EXISTS (SELECT 1 FROM public.payout_items pi WHERE pi.commission_id = c.id);

    v_created := v_created + 1;
  END LOOP;

  -- commissions stay APPROVED until the provider confirms the transfer
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
    SELECT rc.referrer_user_id, sum(rc.commission_amount) AS total, count(*) AS items
      FROM public.referral_commissions rc
     WHERE lower(coalesce(rc.status,'')) = 'available'
       AND rc.payout_id IS NULL
     GROUP BY rc.referrer_user_id
  LOOP
    INSERT INTO public.referral_payouts (referrer_user_id, total_amount, items_count, payout_status)
    VALUES (r.referrer_user_id, r.total, r.items, 'pending')
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