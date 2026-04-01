
-- Validation trigger for community pricing integrity
CREATE OR REPLACE FUNCTION public.fn_validate_community_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- price_cents must be >= 0
  IF NEW.price_cents < 0 THEN
    RAISE EXCEPTION 'price_cents must be >= 0';
  END IF;

  -- PAID_SUBSCRIPTION rules
  IF NEW.access_type = 'PAID_SUBSCRIPTION' THEN
    IF NEW.price_cents <= 0 THEN
      RAISE EXCEPTION 'PAID_SUBSCRIPTION requires price_cents > 0';
    END IF;
    IF NEW.billing_period NOT IN ('monthly', 'quarterly', 'yearly', 'one_time') THEN
      RAISE EXCEPTION 'PAID_SUBSCRIPTION requires billing_period in (monthly, quarterly, yearly, one_time)';
    END IF;
  END IF;

  -- OPEN rules
  IF NEW.access_type = 'OPEN' THEN
    IF NEW.price_cents != 0 THEN
      RAISE EXCEPTION 'OPEN access_type requires price_cents = 0';
    END IF;
  END IF;

  -- FREE_WITH_PRODUCT rules
  IF NEW.access_type = 'FREE_WITH_PRODUCT' THEN
    IF NEW.linked_product_id IS NULL THEN
      RAISE EXCEPTION 'FREE_WITH_PRODUCT requires linked_product_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_validate_community_pricing ON public.communities;
CREATE TRIGGER trg_validate_community_pricing
  BEFORE INSERT OR UPDATE ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_community_pricing();

-- RPC function to set pricing model atomically
CREATE OR REPLACE FUNCTION public.set_community_pricing_model(
  p_community_id uuid,
  p_model text,
  p_price_cents integer DEFAULT NULL,
  p_billing_period text DEFAULT NULL,
  p_linked_product_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  -- Check permissions: must be OWNER or ADMIN
  SELECT role INTO v_role
  FROM community_members
  WHERE community_id = p_community_id AND user_id = v_user_id AND status = 'ACTIVE'
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Permission denied: must be OWNER or ADMIN';
  END IF;

  -- Apply model mapping
  CASE p_model
    WHEN 'free' THEN
      UPDATE communities SET
        access_type = 'OPEN',
        price_cents = 0,
        billing_period = 'monthly',
        linked_product_id = NULL,
        updated_at = now()
      WHERE id = p_community_id;

    WHEN 'subscription' THEN
      IF COALESCE(p_price_cents, 0) <= 0 THEN
        RAISE EXCEPTION 'subscription requires price_cents > 0';
      END IF;
      IF COALESCE(p_billing_period, 'monthly') NOT IN ('monthly', 'quarterly', 'yearly') THEN
        RAISE EXCEPTION 'subscription billing_period must be monthly, quarterly, or yearly';
      END IF;
      UPDATE communities SET
        access_type = 'PAID_SUBSCRIPTION',
        price_cents = p_price_cents,
        billing_period = COALESCE(p_billing_period, 'monthly'),
        linked_product_id = NULL,
        updated_at = now()
      WHERE id = p_community_id;

    WHEN 'one_time' THEN
      IF COALESCE(p_price_cents, 0) <= 0 THEN
        RAISE EXCEPTION 'one_time requires price_cents > 0';
      END IF;
      UPDATE communities SET
        access_type = 'PAID_SUBSCRIPTION',
        price_cents = p_price_cents,
        billing_period = 'one_time',
        linked_product_id = NULL,
        updated_at = now()
      WHERE id = p_community_id;

    WHEN 'freemium' THEN
      IF p_linked_product_id IS NULL THEN
        RAISE EXCEPTION 'freemium requires linked_product_id';
      END IF;
      UPDATE communities SET
        access_type = 'FREE_WITH_PRODUCT',
        price_cents = 0,
        billing_period = 'monthly',
        linked_product_id = p_linked_product_id,
        updated_at = now()
      WHERE id = p_community_id;

    WHEN 'tiers' THEN
      IF p_linked_product_id IS NULL THEN
        RAISE EXCEPTION 'tiers requires linked_product_id';
      END IF;
      UPDATE communities SET
        access_type = 'FREE_WITH_PRODUCT',
        price_cents = 0,
        billing_period = 'monthly',
        linked_product_id = p_linked_product_id,
        updated_at = now()
      WHERE id = p_community_id;

    ELSE
      RAISE EXCEPTION 'Invalid pricing model: %', p_model;
  END CASE;
END;
$$;
