
-- 1. Relax the trigger to allow FREE_WITH_PRODUCT without linked_product_id when tiers exist
CREATE OR REPLACE FUNCTION public.fn_validate_community_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.price_cents < 0 THEN
    RAISE EXCEPTION 'price_cents must be >= 0';
  END IF;

  IF NEW.access_type = 'PAID_SUBSCRIPTION' THEN
    IF NEW.price_cents <= 0 THEN
      RAISE EXCEPTION 'PAID_SUBSCRIPTION requires price_cents > 0';
    END IF;
    IF NEW.billing_period NOT IN ('monthly', 'quarterly', 'yearly', 'one_time') THEN
      RAISE EXCEPTION 'PAID_SUBSCRIPTION requires billing_period in (monthly, quarterly, yearly, one_time)';
    END IF;
  END IF;

  IF NEW.access_type = 'OPEN' THEN
    IF NEW.price_cents != 0 THEN
      RAISE EXCEPTION 'OPEN access_type requires price_cents = 0';
    END IF;
  END IF;

  IF NEW.access_type = 'FREE_WITH_PRODUCT' THEN
    IF NEW.linked_product_id IS NULL THEN
      -- Allow if community has active tiers (new tier system)
      IF NOT EXISTS (
        SELECT 1 FROM community_tiers
        WHERE community_id = NEW.id AND is_active = true
      ) THEN
        RAISE EXCEPTION 'FREE_WITH_PRODUCT requires linked_product_id';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Fix set_community_pricing_model_v2 backward-compat for tiers and freemium
CREATE OR REPLACE FUNCTION public.set_community_pricing_model_v2(p_community_id uuid, p_model text, p_tiers jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_tier jsonb;
  v_tier_count int;
  v_free_count int := 0;
  v_paid_count int := 0;
  v_first_paid jsonb;
  v_new_tier_id uuid;
  v_benefit jsonb;
  v_result_ids uuid[] := '{}';
  v_sort int := 0;
  v_linked_product uuid;
BEGIN
  -- 1. Permission check
  SELECT role INTO v_role
  FROM community_members
  WHERE community_id = p_community_id AND user_id = v_user_id AND status = 'ACTIVE'
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Permission denied: must be OWNER or ADMIN';
  END IF;

  -- 2. Parse tiers
  v_tier_count := jsonb_array_length(p_tiers);

  FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers)
  LOOP
    IF (v_tier->>'is_free')::boolean THEN
      v_free_count := v_free_count + 1;
    ELSE
      v_paid_count := v_paid_count + 1;
      IF v_first_paid IS NULL THEN v_first_paid := v_tier; END IF;
    END IF;
  END LOOP;

  -- 3. Validate per model
  CASE p_model
    WHEN 'free' THEN
      IF v_tier_count != 1 OR v_free_count != 1 THEN
        RAISE EXCEPTION 'free model requires exactly 1 free tier';
      END IF;

    WHEN 'subscription' THEN
      IF v_paid_count != 1 OR v_free_count != 0 THEN
        RAISE EXCEPTION 'subscription model requires exactly 1 paid tier, no free tiers';
      END IF;
      IF v_first_paid->>'billing_period' NOT IN ('monthly', 'yearly') THEN
        RAISE EXCEPTION 'subscription tier must be monthly or yearly';
      END IF;

    WHEN 'one_time' THEN
      IF v_paid_count != 1 OR v_free_count != 0 THEN
        RAISE EXCEPTION 'one_time model requires exactly 1 paid tier';
      END IF;
      IF v_first_paid->>'billing_period' != 'one_time' THEN
        RAISE EXCEPTION 'one_time tier must have billing_period=one_time';
      END IF;

    WHEN 'freemium' THEN
      IF v_free_count != 1 THEN
        RAISE EXCEPTION 'freemium model requires exactly 1 free tier';
      END IF;
      IF v_paid_count < 1 OR v_paid_count > 2 THEN
        RAISE EXCEPTION 'freemium model requires 1-2 paid tiers';
      END IF;

    WHEN 'tiers' THEN
      IF v_paid_count < 2 OR v_paid_count > 3 THEN
        RAISE EXCEPTION 'tiers model requires 2-3 paid tiers';
      END IF;
      IF v_free_count > 1 THEN
        RAISE EXCEPTION 'tiers model allows at most 1 free tier';
      END IF;

    ELSE
      RAISE EXCEPTION 'Invalid pricing model: %', p_model;
  END CASE;

  -- 4. Deactivate old tiers
  UPDATE community_tiers
  SET is_active = false, updated_at = now()
  WHERE community_id = p_community_id AND is_active = true;

  -- 5. Create new tiers
  v_sort := 0;
  FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers)
  LOOP
    INSERT INTO community_tiers (
      community_id, name, is_free, price_cents, billing_period,
      linked_product_id, sort_order, is_active
    ) VALUES (
      p_community_id,
      COALESCE(v_tier->>'name', 'Tier ' || v_sort),
      COALESCE((v_tier->>'is_free')::boolean, false),
      COALESCE((v_tier->>'price_cents')::integer, 0),
      NULLIF(v_tier->>'billing_period', ''),
      NULLIF(v_tier->>'linked_product_id', '')::uuid,
      v_sort,
      true
    )
    RETURNING id INTO v_new_tier_id;

    v_result_ids := array_append(v_result_ids, v_new_tier_id);

    IF v_tier ? 'benefits' AND jsonb_typeof(v_tier->'benefits') = 'array' THEN
      FOR v_benefit IN SELECT * FROM jsonb_array_elements(v_tier->'benefits')
      LOOP
        INSERT INTO community_tier_benefits (tier_id, label, sort_order)
        VALUES (v_new_tier_id, v_benefit->>'label', COALESCE((v_benefit->>'sort_order')::int, 0));
      END LOOP;
    END IF;

    v_sort := v_sort + 1;
  END LOOP;

  -- 6. Update community record (backward compat) — FIXED mappings
  CASE p_model
    WHEN 'free' THEN
      UPDATE communities SET
        access_type = 'OPEN', price_cents = 0, billing_period = 'monthly',
        linked_product_id = NULL, updated_at = now()
      WHERE id = p_community_id;

    WHEN 'subscription' THEN
      UPDATE communities SET
        access_type = 'PAID_SUBSCRIPTION',
        price_cents = COALESCE((v_first_paid->>'price_cents')::int, 0),
        billing_period = COALESCE(v_first_paid->>'billing_period', 'monthly'),
        linked_product_id = NULLIF(v_first_paid->>'linked_product_id', '')::uuid,
        updated_at = now()
      WHERE id = p_community_id;

    WHEN 'one_time' THEN
      UPDATE communities SET
        access_type = 'PAID_SUBSCRIPTION',
        price_cents = COALESCE((v_first_paid->>'price_cents')::int, 0),
        billing_period = 'one_time',
        linked_product_id = NULL,
        updated_at = now()
      WHERE id = p_community_id;

    WHEN 'freemium' THEN
      -- Use FREE_WITH_PRODUCT only if a linked product exists; otherwise use OPEN
      v_linked_product := NULLIF(v_first_paid->>'linked_product_id', '')::uuid;
      IF v_linked_product IS NOT NULL THEN
        UPDATE communities SET
          access_type = 'FREE_WITH_PRODUCT',
          price_cents = 0,
          billing_period = 'monthly',
          linked_product_id = v_linked_product,
          updated_at = now()
        WHERE id = p_community_id;
      ELSE
        UPDATE communities SET
          access_type = 'OPEN',
          price_cents = 0,
          billing_period = 'monthly',
          linked_product_id = NULL,
          updated_at = now()
        WHERE id = p_community_id;
      END IF;

    WHEN 'tiers' THEN
      -- Tiers model: access governed by tier system, use OPEN for legacy compat
      UPDATE communities SET
        access_type = 'OPEN',
        price_cents = 0,
        billing_period = 'monthly',
        linked_product_id = NULL,
        updated_at = now()
      WHERE id = p_community_id;
  END CASE;

  RETURN jsonb_build_object(
    'model', p_model,
    'tier_ids', to_jsonb(v_result_ids),
    'tiers_created', v_sort
  );
END;
$function$;
