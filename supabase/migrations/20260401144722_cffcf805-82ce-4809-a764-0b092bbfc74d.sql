
-- Add new columns
ALTER TABLE public.circle_courses
  ADD COLUMN IF NOT EXISTS buy_now_product_id uuid REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS private_mode text,
  ADD COLUMN IF NOT EXISTS allowed_tier_ids uuid[],
  ADD COLUMN IF NOT EXISTS allowed_member_ids uuid[];

-- Entitlements table for BUY_NOW purchases
CREATE TABLE IF NOT EXISTS public.circle_course_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.circle_courses(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text NOT NULL DEFAULT 'purchase',
  UNIQUE(course_id, member_id)
);

ALTER TABLE public.circle_course_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own entitlements"
  ON public.circle_course_entitlements FOR SELECT
  USING (
    member_id IN (SELECT public.get_community_member_ids_for_user(auth.uid()))
  );

CREATE POLICY "Admins can manage entitlements"
  ON public.circle_course_entitlements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      JOIN circle_courses cc ON cc.community_id = cm.community_id
      WHERE cc.id = circle_course_entitlements.course_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER','ADMIN')
        AND cm.status = 'ACTIVE'
    )
  );

-- Update validation trigger
CREATE OR REPLACE FUNCTION public.fn_validate_course_access_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.access_mode NOT IN ('OPEN', 'LEVEL_UNLOCK', 'BUY_NOW', 'TIME_UNLOCK', 'PRIVATE') THEN
    RAISE EXCEPTION 'access_mode must be OPEN, LEVEL_UNLOCK, BUY_NOW, TIME_UNLOCK, or PRIVATE';
  END IF;

  IF NEW.access_mode = 'OPEN' THEN
    NEW.min_level := NULL;
    NEW.unlock_after_days := NULL;
    NEW.buy_now_product_id := NULL;
    NEW.private_mode := NULL;
    NEW.allowed_tier_ids := NULL;
    NEW.allowed_member_ids := NULL;
  END IF;

  IF NEW.access_mode = 'LEVEL_UNLOCK' THEN
    IF NEW.min_level IS NULL OR NEW.min_level < 1 THEN
      RAISE EXCEPTION 'LEVEL_UNLOCK requires min_level >= 1';
    END IF;
    NEW.unlock_after_days := NULL;
    NEW.buy_now_product_id := NULL;
    NEW.private_mode := NULL;
    NEW.allowed_tier_ids := NULL;
    NEW.allowed_member_ids := NULL;
  END IF;

  IF NEW.access_mode = 'BUY_NOW' THEN
    IF NEW.buy_now_product_id IS NULL THEN
      RAISE EXCEPTION 'BUY_NOW requires buy_now_product_id';
    END IF;
    NEW.min_level := NULL;
    NEW.unlock_after_days := NULL;
    NEW.private_mode := NULL;
    NEW.allowed_tier_ids := NULL;
    NEW.allowed_member_ids := NULL;
  END IF;

  IF NEW.access_mode = 'TIME_UNLOCK' THEN
    IF NEW.unlock_after_days IS NULL OR NEW.unlock_after_days < 1 THEN
      RAISE EXCEPTION 'TIME_UNLOCK requires unlock_after_days >= 1';
    END IF;
    NEW.min_level := NULL;
    NEW.buy_now_product_id := NULL;
    NEW.private_mode := NULL;
    NEW.allowed_tier_ids := NULL;
    NEW.allowed_member_ids := NULL;
  END IF;

  IF NEW.access_mode = 'PRIVATE' THEN
    IF NEW.private_mode IS NULL OR NEW.private_mode NOT IN ('TIERS', 'SPECIFIC_MEMBERS', 'BOTH') THEN
      RAISE EXCEPTION 'PRIVATE requires private_mode (TIERS, SPECIFIC_MEMBERS, or BOTH)';
    END IF;
    IF NEW.private_mode IN ('TIERS', 'BOTH') AND (NEW.allowed_tier_ids IS NULL OR array_length(NEW.allowed_tier_ids, 1) IS NULL) THEN
      RAISE EXCEPTION 'PRIVATE with TIERS requires at least one tier in allowed_tier_ids';
    END IF;
    IF NEW.private_mode IN ('SPECIFIC_MEMBERS', 'BOTH') AND (NEW.allowed_member_ids IS NULL OR array_length(NEW.allowed_member_ids, 1) IS NULL) THEN
      RAISE EXCEPTION 'PRIVATE with SPECIFIC_MEMBERS requires at least one member in allowed_member_ids';
    END IF;
    NEW.min_level := NULL;
    NEW.unlock_after_days := NULL;
    NEW.buy_now_product_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Rebuild RPC
CREATE OR REPLACE FUNCTION public.can_access_classroom_course(
  p_community_id uuid,
  p_course_id uuid,
  p_user_id uuid
)
RETURNS TABLE(allowed boolean, reason text, required_level integer, current_level integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member_id uuid;
  v_member_status text;
  v_member_level integer;
  v_member_role text;
  v_joined_at timestamptz;
  v_access_mode text;
  v_min_level integer;
  v_unlock_days integer;
  v_buy_product uuid;
  v_private_mode text;
  v_tier_ids uuid[];
  v_member_ids uuid[];
  v_has_entitlement boolean;
BEGIN
  SELECT cm.id, cm.status, cm.level, cm.role, cm.joined_at
  INTO v_member_id, v_member_status, v_member_level, v_member_role, v_joined_at
  FROM community_members cm
  WHERE cm.community_id = p_community_id AND cm.user_id = p_user_id
  LIMIT 1;

  IF v_member_status IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_MEMBER'::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF v_member_status != 'ACTIVE' THEN
    RETURN QUERY SELECT false, 'INACTIVE_MEMBER'::text, NULL::integer, v_member_level;
    RETURN;
  END IF;

  IF v_member_role IN ('OWNER', 'ADMIN') THEN
    RETURN QUERY SELECT true, 'ADMIN'::text, NULL::integer, v_member_level;
    RETURN;
  END IF;

  SELECT cc.access_mode, cc.min_level, cc.unlock_after_days, cc.buy_now_product_id,
         cc.private_mode, cc.allowed_tier_ids, cc.allowed_member_ids
  INTO v_access_mode, v_min_level, v_unlock_days, v_buy_product,
       v_private_mode, v_tier_ids, v_member_ids
  FROM circle_courses cc
  WHERE cc.id = p_course_id AND cc.community_id = p_community_id
  LIMIT 1;

  IF v_access_mode IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_FOUND'::text, NULL::integer, v_member_level;
    RETURN;
  END IF;

  CASE v_access_mode
    WHEN 'OPEN' THEN
      RETURN QUERY SELECT true, 'OPEN'::text, NULL::integer, v_member_level;

    WHEN 'LEVEL_UNLOCK' THEN
      IF v_member_level >= v_min_level THEN
        RETURN QUERY SELECT true, 'OPEN'::text, v_min_level, v_member_level;
      ELSE
        RETURN QUERY SELECT false, 'LEVEL_REQUIRED'::text, v_min_level, v_member_level;
      END IF;

    WHEN 'BUY_NOW' THEN
      SELECT EXISTS (
        SELECT 1 FROM circle_course_entitlements
        WHERE course_id = p_course_id AND member_id = v_member_id
      ) INTO v_has_entitlement;

      IF v_has_entitlement THEN
        RETURN QUERY SELECT true, 'OPEN'::text, NULL::integer, v_member_level;
      ELSE
        RETURN QUERY SELECT false, 'PURCHASE_REQUIRED'::text, NULL::integer, v_member_level;
      END IF;

    WHEN 'TIME_UNLOCK' THEN
      IF v_joined_at + (v_unlock_days || ' days')::interval <= now() THEN
        RETURN QUERY SELECT true, 'OPEN'::text, NULL::integer, v_member_level;
      ELSE
        RETURN QUERY SELECT false, 'TIME_REQUIRED'::text, v_unlock_days, v_member_level;
      END IF;

    WHEN 'PRIVATE' THEN
      -- Check tiers
      IF v_private_mode IN ('TIERS', 'BOTH') AND v_tier_ids IS NOT NULL THEN
        -- For now tier check is a placeholder (circle_plans check would go here)
        NULL;
      END IF;
      -- Check specific members
      IF v_private_mode IN ('SPECIFIC_MEMBERS', 'BOTH') AND v_member_ids IS NOT NULL THEN
        IF v_member_id = ANY(v_member_ids) THEN
          RETURN QUERY SELECT true, 'OPEN'::text, NULL::integer, v_member_level;
          RETURN;
        END IF;
      END IF;
      RETURN QUERY SELECT false, 'PRIVATE_ACCESS'::text, NULL::integer, v_member_level;

    ELSE
      RETURN QUERY SELECT false, 'UNKNOWN'::text, NULL::integer, v_member_level;
  END CASE;
  RETURN;
END;
$$;
