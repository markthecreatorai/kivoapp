
-- Migrate existing LEVEL_GATED to LEVEL_UNLOCK
UPDATE public.circle_courses SET access_mode = 'LEVEL_UNLOCK' WHERE access_mode = 'LEVEL_GATED';

-- Add new columns
ALTER TABLE public.circle_courses
  ADD COLUMN IF NOT EXISTS unlock_after_days integer,
  ADD COLUMN IF NOT EXISTS course_price_cents integer DEFAULT 0;

-- Replace validation trigger
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
  END IF;

  IF NEW.access_mode = 'LEVEL_UNLOCK' THEN
    IF NEW.min_level IS NULL OR NEW.min_level < 1 THEN
      RAISE EXCEPTION 'LEVEL_UNLOCK requires min_level >= 1';
    END IF;
    NEW.unlock_after_days := NULL;
  END IF;

  IF NEW.access_mode = 'BUY_NOW' THEN
    IF COALESCE(NEW.course_price_cents, 0) <= 0 THEN
      RAISE EXCEPTION 'BUY_NOW requires course_price_cents > 0';
    END IF;
    NEW.min_level := NULL;
    NEW.unlock_after_days := NULL;
  END IF;

  IF NEW.access_mode = 'TIME_UNLOCK' THEN
    IF NEW.unlock_after_days IS NULL OR NEW.unlock_after_days < 1 THEN
      RAISE EXCEPTION 'TIME_UNLOCK requires unlock_after_days >= 1';
    END IF;
    NEW.min_level := NULL;
  END IF;

  IF NEW.access_mode = 'PRIVATE' THEN
    NEW.min_level := NULL;
    NEW.unlock_after_days := NULL;
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
  v_member_status text;
  v_member_level integer;
  v_member_role text;
  v_joined_at timestamptz;
  v_access_mode text;
  v_min_level integer;
  v_unlock_days integer;
BEGIN
  -- Get member info
  SELECT cm.status, cm.level, cm.role, cm.joined_at
  INTO v_member_status, v_member_level, v_member_role, v_joined_at
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

  -- OWNER/ADMIN always have access
  IF v_member_role IN ('OWNER', 'ADMIN') THEN
    RETURN QUERY SELECT true, 'ADMIN'::text, NULL::integer, v_member_level;
    RETURN;
  END IF;

  -- Get course info
  SELECT cc.access_mode, cc.min_level, cc.unlock_after_days
  INTO v_access_mode, v_min_level, v_unlock_days
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
      -- For now, always locked (purchase check will be added via entitlements)
      RETURN QUERY SELECT false, 'PURCHASE_REQUIRED'::text, NULL::integer, v_member_level;

    WHEN 'TIME_UNLOCK' THEN
      IF v_joined_at + (v_unlock_days || ' days')::interval <= now() THEN
        RETURN QUERY SELECT true, 'OPEN'::text, NULL::integer, v_member_level;
      ELSE
        RETURN QUERY SELECT false, 'TIME_REQUIRED'::text, v_unlock_days, v_member_level;
      END IF;

    WHEN 'PRIVATE' THEN
      -- For now, always locked (entitlement/tier check will be added later)
      RETURN QUERY SELECT false, 'PRIVATE_ACCESS'::text, NULL::integer, v_member_level;

    ELSE
      RETURN QUERY SELECT false, 'UNKNOWN'::text, NULL::integer, v_member_level;
  END CASE;
  RETURN;
END;
$$;
