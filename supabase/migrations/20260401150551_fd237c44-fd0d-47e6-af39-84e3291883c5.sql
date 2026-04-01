
-- ============================================================
-- resolve_member_tiers: returns all active tiers for a member
-- Sources: direct entitlements, active subscriptions, product purchases
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_member_tiers(
  p_community_id uuid,
  p_user_id uuid
)
RETURNS TABLE(
  tier_id uuid,
  tier_name text,
  source_type text,
  source_id uuid,
  is_free boolean,
  price_cents integer,
  started_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member_id uuid;
BEGIN
  -- Get member id
  SELECT cm.id INTO v_member_id
  FROM community_members cm
  WHERE cm.community_id = p_community_id AND cm.user_id = p_user_id AND cm.status = 'ACTIVE'
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN;
  END IF;

  -- Source 1: Direct entitlements (ADMIN, SUBSCRIPTION, PRODUCT)
  RETURN QUERY
  SELECT ct.id, ct.name, cmt.source_type, cmt.source_id, ct.is_free, ct.price_cents, cmt.started_at
  FROM community_member_tiers cmt
  JOIN community_tiers ct ON ct.id = cmt.tier_id
  WHERE cmt.member_id = v_member_id
    AND cmt.community_id = p_community_id
    AND cmt.status = 'ACTIVE'
    AND (cmt.expires_at IS NULL OR cmt.expires_at > now())
    AND ct.is_active = true;

  -- Source 2: Active subscriptions (circle_subscriptions → circle_plans matching community_tiers by name/price)
  -- This maps circle_plans to community_tiers via matching plan_id
  RETURN QUERY
  SELECT DISTINCT ct.id, ct.name, 'SUBSCRIPTION'::text, cs.id, ct.is_free, ct.price_cents, cs.started_at
  FROM circle_subscriptions cs
  JOIN circle_plans cp ON cp.id = cs.plan_id
  JOIN community_tiers ct ON ct.community_id = p_community_id
    AND ct.is_active = true
    AND ct.price_cents = cp.price_cents
    AND ct.billing_period = cp.interval
  WHERE cs.user_id = p_user_id
    AND cs.community_id = p_community_id
    AND cs.status IN ('active', 'trialing')
    AND NOT EXISTS (
      SELECT 1 FROM community_member_tiers cmt2
      WHERE cmt2.member_id = v_member_id
        AND cmt2.tier_id = ct.id
        AND cmt2.status = 'ACTIVE'
    );

  -- Source 3: Product purchases (orders with product_id matching tier's linked_product_id)
  RETURN QUERY
  SELECT DISTINCT ct.id, ct.name, 'PRODUCT'::text, o.id, ct.is_free, ct.price_cents, o.created_at
  FROM orders o
  JOIN community_tiers ct ON ct.linked_product_id = o.product_id
    AND ct.community_id = p_community_id
    AND ct.is_active = true
  JOIN community_members cm ON cm.community_id = p_community_id
    AND cm.user_id = p_user_id
    AND cm.status = 'ACTIVE'
  JOIN customers c ON c.id = o.customer_id
  WHERE c.email = (SELECT email FROM auth.users WHERE id = p_user_id LIMIT 1)
    AND o.status IN ('PAID', 'COMPLETED')
    AND NOT EXISTS (
      SELECT 1 FROM community_member_tiers cmt3
      WHERE cmt3.member_id = v_member_id
        AND cmt3.tier_id = ct.id
        AND cmt3.status = 'ACTIVE'
    );
END;
$$;

-- ============================================================
-- grant_tier_entitlement: idempotent upsert
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_tier_entitlement(
  p_community_id uuid,
  p_member_id uuid,
  p_tier_id uuid,
  p_source_type text DEFAULT 'ADMIN',
  p_source_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_existing_id uuid;
BEGIN
  -- Validate source_type
  IF p_source_type NOT IN ('SUBSCRIPTION', 'PRODUCT', 'ADMIN') THEN
    RAISE EXCEPTION 'Invalid source_type: %', p_source_type;
  END IF;

  -- Check if already has active entitlement for this tier
  SELECT id INTO v_existing_id
  FROM community_member_tiers
  WHERE member_id = p_member_id
    AND community_id = p_community_id
    AND tier_id = p_tier_id
    AND status = 'ACTIVE'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Idempotent: return existing
    RETURN v_existing_id;
  END IF;

  -- Deactivate any other active tier for this member in this community
  UPDATE community_member_tiers
  SET status = 'INACTIVE', updated_at = now()
  WHERE member_id = p_member_id
    AND community_id = p_community_id
    AND status = 'ACTIVE';

  -- Insert new entitlement
  INSERT INTO community_member_tiers (
    community_id, member_id, tier_id, source_type, source_id, status, started_at, expires_at
  ) VALUES (
    p_community_id, p_member_id, p_tier_id, p_source_type, p_source_id, 'ACTIVE', now(), p_expires_at
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================
-- revoke_tier_entitlement: deactivate active tier
-- ============================================================
CREATE OR REPLACE FUNCTION public.revoke_tier_entitlement(
  p_community_id uuid,
  p_member_id uuid,
  p_tier_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_tier_id IS NOT NULL THEN
    UPDATE community_member_tiers
    SET status = 'INACTIVE', updated_at = now()
    WHERE member_id = p_member_id
      AND community_id = p_community_id
      AND tier_id = p_tier_id
      AND status = 'ACTIVE';
  ELSE
    -- Revoke all active tiers
    UPDATE community_member_tiers
    SET status = 'INACTIVE', updated_at = now()
    WHERE member_id = p_member_id
      AND community_id = p_community_id
      AND status = 'ACTIVE';
  END IF;
END;
$$;
