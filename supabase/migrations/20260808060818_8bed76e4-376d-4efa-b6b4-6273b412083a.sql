ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS applies_to_product_ids uuid[] NULL;

COMMENT ON COLUMN public.coupons.applies_to_product_ids IS
  'NULL or empty = applies to every product of the workspace. Otherwise restricted to these product ids.';

CREATE OR REPLACE FUNCTION public.redeem_coupon(
  p_coupon_id uuid,
  p_order_id uuid,
  p_customer_email text,
  p_discount numeric,
  p_order_amount numeric,
  p_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons;
  v_email text := lower(trim(p_customer_email));
  v_global_uses integer;
  v_customer_uses integer;
BEGIN
  SELECT * INTO v_coupon FROM public.coupons WHERE id = p_coupon_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupom não encontrado');
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupom inativo');
  END IF;

  IF v_coupon.valid_from > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupom ainda não está válido');
  END IF;

  IF v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupom expirado');
  END IF;

  IF p_product_id IS NOT NULL
     AND v_coupon.applies_to_product_ids IS NOT NULL
     AND array_length(v_coupon.applies_to_product_ids, 1) > 0
     AND NOT (p_product_id = ANY (v_coupon.applies_to_product_ids)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupom não válido para este produto');
  END IF;

  IF v_coupon.min_order_amount IS NOT NULL AND p_order_amount < v_coupon.min_order_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Valor mínimo do pedido não atingido');
  END IF;

  SELECT count(*) INTO v_global_uses FROM public.coupon_usages WHERE coupon_id = p_coupon_id;

  IF v_coupon.max_uses IS NOT NULL
     AND greatest(v_coupon.current_uses, v_global_uses) >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupom atingiu o limite de usos');
  END IF;

  SELECT count(*) INTO v_customer_uses
  FROM public.coupon_usages
  WHERE coupon_id = p_coupon_id AND lower(customer_email) = v_email;

  IF v_customer_uses >= v_coupon.max_uses_per_customer THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Você já usou este cupom');
  END IF;

  INSERT INTO public.coupon_usages (coupon_id, order_id, customer_email, discount_amount)
  VALUES (p_coupon_id, p_order_id, v_email, p_discount)
  ON CONFLICT DO NOTHING;

  UPDATE public.coupons
  SET current_uses = current_uses + 1,
      updated_at = now()
  WHERE id = p_coupon_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;