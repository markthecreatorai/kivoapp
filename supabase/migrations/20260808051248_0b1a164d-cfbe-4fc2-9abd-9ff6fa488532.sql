-- Idempotency: one usage row per coupon per order
ALTER TABLE public.coupon_usages
  DROP CONSTRAINT IF EXISTS coupon_usages_coupon_order_unique;
ALTER TABLE public.coupon_usages
  ADD CONSTRAINT coupon_usages_coupon_order_unique UNIQUE (coupon_id, order_id);

-- Atomic redemption: locks the coupon row, re-checks limits, records usage and increments counter
CREATE OR REPLACE FUNCTION public.redeem_coupon(
  p_coupon_id uuid,
  p_order_id uuid,
  p_customer_email text,
  p_discount numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons;
  v_used integer;
  v_inserted integer;
BEGIN
  SELECT * INTO v_coupon FROM public.coupons WHERE id = p_coupon_id FOR UPDATE;
  IF NOT FOUND OR v_coupon.is_active = false THEN
    RETURN false;
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.current_uses >= v_coupon.max_uses THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_used
  FROM public.coupon_usages
  WHERE coupon_id = p_coupon_id
    AND customer_email = lower(p_customer_email)
    AND order_id <> p_order_id;

  IF v_used >= v_coupon.max_uses_per_customer THEN
    RETURN false;
  END IF;

  INSERT INTO public.coupon_usages (coupon_id, order_id, customer_email, discount_amount)
  VALUES (p_coupon_id, p_order_id, lower(p_customer_email), COALESCE(p_discount, 0))
  ON CONFLICT (coupon_id, order_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    -- already redeemed for this order (retry / duplicate webhook)
    RETURN true;
  END IF;

  UPDATE public.coupons
     SET current_uses = current_uses + 1,
         updated_at = now()
   WHERE id = p_coupon_id;

  RETURN true;
END;
$$;

-- Release a redemption when the order/payment fails
CREATE OR REPLACE FUNCTION public.release_coupon(
  p_coupon_id uuid,
  p_order_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.coupon_usages
   WHERE coupon_id = p_coupon_id AND order_id = p_order_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    UPDATE public.coupons
       SET current_uses = GREATEST(current_uses - v_deleted, 0),
           updated_at = now()
     WHERE id = p_coupon_id;
  END IF;

  RETURN v_deleted > 0;
END;
$$;

-- Server-only: never callable from the browser
REVOKE ALL ON FUNCTION public.redeem_coupon(uuid, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_coupon(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(uuid, uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_coupon(uuid, uuid) TO service_role;