
-- Main RPC (backward-compatible signature)
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
  v_has_tier boolean;
BEGIN
  -- 1. Validate member exists
  SELECT cm.id, cm.status, cm.level, cm.role, cm.joined_at
  INTO v_member_id, v_member_status, v_member_level, v_member_role, v_joined_at
  FROM community_members cm
  WHERE cm.community_id = p_community_id AND cm.user_id = p_user_id
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_MEMBER'::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  -- 2. Validate active status
  IF v_member_status != 'ACTIVE' THEN
    RETURN QUERY SELECT false, 'INACTIVE_MEMBER'::text, NULL::integer, v_member_level;
    RETURN;
  END IF;

  -- 3. OWNER/ADMIN bypass
  IF v_member_role IN ('OWNER', 'ADMIN') THEN
    RETURN QUERY SELECT true, 'ADMIN'::text, NULL::integer, v_member_level;
    RETURN;
  END IF;

  -- 4. Fetch course config
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

  -- 5. Apply access_mode
  CASE v_access_mode
    WHEN 'OPEN' THEN
      RETURN QUERY SELECT true, 'OPEN'::text, NULL::integer, v_member_level;

    WHEN 'LEVEL_UNLOCK' THEN
      IF v_member_level >= v_min_level THEN
        RETURN QUERY SELECT true, 'LEVEL_OK'::text, v_min_level, v_member_level;
      ELSE
        RETURN QUERY SELECT false, 'LEVEL_REQUIRED'::text, v_min_level, v_member_level;
      END IF;

    WHEN 'BUY_NOW' THEN
      -- Check entitlements table
      SELECT EXISTS (
        SELECT 1 FROM circle_course_entitlements
        WHERE course_id = p_course_id AND member_id = v_member_id
      ) INTO v_has_entitlement;

      IF v_has_entitlement THEN
        RETURN QUERY SELECT true, 'PURCHASED'::text, NULL::integer, v_member_level;
      ELSE
        RETURN QUERY SELECT false, 'PURCHASE_REQUIRED'::text, NULL::integer, v_member_level;
      END IF;

    WHEN 'TIME_UNLOCK' THEN
      IF v_joined_at + (v_unlock_days || ' days')::interval <= now() THEN
        RETURN QUERY SELECT true, 'TIME_OK'::text, NULL::integer, v_member_level;
      ELSE
        RETURN QUERY SELECT false, 'TIME_REQUIRED'::text, v_unlock_days, v_member_level;
      END IF;

    WHEN 'PRIVATE' THEN
      -- Priority 1: Check allowed_member_ids
      IF v_member_ids IS NOT NULL AND v_member_id = ANY(v_member_ids) THEN
        RETURN QUERY SELECT true, 'MEMBER_ALLOWED'::text, NULL::integer, v_member_level;
        RETURN;
      END IF;

      -- Priority 2: Check tier via active subscription
      IF v_tier_ids IS NOT NULL AND array_length(v_tier_ids, 1) > 0 THEN
        SELECT EXISTS (
          SELECT 1 FROM circle_subscriptions cs
          WHERE cs.user_id = p_user_id
            AND cs.community_id = p_community_id
            AND cs.status IN ('active', 'trialing')
            AND cs.plan_id = ANY(v_tier_ids)
        ) INTO v_has_tier;

        IF v_has_tier THEN
          RETURN QUERY SELECT true, 'TIER_ALLOWED'::text, NULL::integer, v_member_level;
          RETURN;
        END IF;
      END IF;

      -- Priority 3: Check entitlements (product-linked tier)
      SELECT EXISTS (
        SELECT 1 FROM circle_course_entitlements
        WHERE course_id = p_course_id AND member_id = v_member_id
      ) INTO v_has_entitlement;

      IF v_has_entitlement THEN
        RETURN QUERY SELECT true, 'ENTITLEMENT_ALLOWED'::text, NULL::integer, v_member_level;
        RETURN;
      END IF;

      RETURN QUERY SELECT false, 'PRIVATE_ACCESS'::text, NULL::integer, v_member_level;

    ELSE
      RETURN QUERY SELECT false, 'UNKNOWN_MODE'::text, NULL::integer, v_member_level;
  END CASE;
  RETURN;
END;
$$;

-- Debug companion function (returns full context as JSONB)
CREATE OR REPLACE FUNCTION public.can_access_course_debug(
  p_community_id uuid,
  p_course_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result record;
  v_member record;
  v_course record;
  v_subs jsonb;
  v_entitlements jsonb;
  v_debug jsonb;
BEGIN
  -- Get access result
  SELECT * INTO v_result
  FROM can_access_classroom_course(p_community_id, p_course_id, p_user_id)
  LIMIT 1;

  -- Get member info
  SELECT cm.id, cm.status, cm.level, cm.role, cm.joined_at, cm.display_name
  INTO v_member
  FROM community_members cm
  WHERE cm.community_id = p_community_id AND cm.user_id = p_user_id
  LIMIT 1;

  -- Get course config
  SELECT cc.access_mode, cc.min_level, cc.unlock_after_days, cc.buy_now_product_id,
         cc.private_mode, cc.allowed_tier_ids, cc.allowed_member_ids
  INTO v_course
  FROM circle_courses cc
  WHERE cc.id = p_course_id AND cc.community_id = p_community_id
  LIMIT 1;

  -- Get active subscriptions
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'plan_id', cs.plan_id,
    'status', cs.status,
    'plan_name', cp.name
  )), '[]'::jsonb)
  INTO v_subs
  FROM circle_subscriptions cs
  LEFT JOIN circle_plans cp ON cp.id = cs.plan_id
  WHERE cs.user_id = p_user_id
    AND cs.community_id = p_community_id
    AND cs.status IN ('active', 'trialing');

  -- Get entitlements
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'granted_at', ce.granted_at,
    'granted_by', ce.granted_by
  )), '[]'::jsonb)
  INTO v_entitlements
  FROM circle_course_entitlements ce
  JOIN community_members cm ON cm.id = ce.member_id
  WHERE ce.course_id = p_course_id AND cm.user_id = p_user_id;

  v_debug := jsonb_build_object(
    'result', jsonb_build_object(
      'allowed', v_result.allowed,
      'reason', v_result.reason,
      'required_level', v_result.required_level,
      'current_level', v_result.current_level
    ),
    'member', CASE WHEN v_member.id IS NOT NULL THEN jsonb_build_object(
      'id', v_member.id,
      'status', v_member.status,
      'level', v_member.level,
      'role', v_member.role,
      'joined_at', v_member.joined_at,
      'display_name', v_member.display_name
    ) ELSE 'null'::jsonb END,
    'course', CASE WHEN v_course.access_mode IS NOT NULL THEN jsonb_build_object(
      'access_mode', v_course.access_mode,
      'min_level', v_course.min_level,
      'unlock_after_days', v_course.unlock_after_days,
      'buy_now_product_id', v_course.buy_now_product_id,
      'private_mode', v_course.private_mode,
      'allowed_tier_ids', v_course.allowed_tier_ids,
      'allowed_member_ids', v_course.allowed_member_ids
    ) ELSE 'null'::jsonb END,
    'active_subscriptions', v_subs,
    'entitlements', v_entitlements,
    'evaluated_at', now()
  );

  RETURN v_debug;
END;
$$;
