
CREATE OR REPLACE FUNCTION public.can_access_event(
  p_community_id uuid,
  p_event_id uuid,
  p_user_id uuid
)
RETURNS TABLE(allowed boolean, reason text, display_message text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member_id uuid;
  v_member_status text;
  v_member_level integer;
  v_member_role text;
  v_access_rule text;
  v_access_value text;
BEGIN
  -- 1. Get member
  SELECT cm.id, cm.status, cm.level, cm.role
  INTO v_member_id, v_member_status, v_member_level, v_member_role
  FROM community_members cm
  WHERE cm.community_id = p_community_id AND cm.user_id = p_user_id
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_MEMBER'::text, 'Você precisa ser membro da comunidade para acessar este evento.'::text;
    RETURN;
  END IF;

  IF v_member_status != 'ACTIVE' THEN
    RETURN QUERY SELECT false, 'INACTIVE'::text, 'Sua conta está inativa nesta comunidade.'::text;
    RETURN;
  END IF;

  -- 2. Admin/Owner bypass
  IF v_member_role IN ('OWNER', 'ADMIN') THEN
    RETURN QUERY SELECT true, 'ADMIN'::text, ''::text;
    RETURN;
  END IF;

  -- 3. Get event access rule
  SELECT ce.access_rule, ce.access_value
  INTO v_access_rule, v_access_value
  FROM community_events ce
  WHERE ce.id = p_event_id AND ce.community_id = p_community_id
  LIMIT 1;

  IF v_access_rule IS NULL THEN
    -- Event not found or no rule = allow
    RETURN QUERY SELECT true, 'NO_RULE'::text, ''::text;
    RETURN;
  END IF;

  -- 4. Evaluate rule
  CASE v_access_rule
    WHEN 'all_members' THEN
      RETURN QUERY SELECT true, 'ALL_MEMBERS'::text, ''::text;

    WHEN 'level' THEN
      IF v_member_level >= COALESCE(v_access_value::integer, 1) THEN
        RETURN QUERY SELECT true, 'LEVEL_OK'::text, ''::text;
      ELSE
        RETURN QUERY SELECT false, 'LEVEL_REQUIRED'::text,
          ('Este evento requer nível ' || v_access_value || ' ou superior. Seu nível atual é ' || v_member_level || '.')::text;
      END IF;

    WHEN 'tier' THEN
      IF EXISTS (
        SELECT 1 FROM community_member_tiers cmt
        WHERE cmt.member_id = v_member_id
          AND cmt.community_id = p_community_id
          AND cmt.tier_id = v_access_value::uuid
          AND cmt.status = 'ACTIVE'
          AND (cmt.expires_at IS NULL OR cmt.expires_at > now())
      ) THEN
        RETURN QUERY SELECT true, 'TIER_OK'::text, ''::text;
      ELSE
        RETURN QUERY SELECT false, 'TIER_REQUIRED'::text,
          ('Este evento é exclusivo para membros do plano ' ||
            COALESCE((SELECT name FROM community_tiers WHERE id = v_access_value::uuid), 'selecionado') || '.')::text;
      END IF;

    WHEN 'space' THEN
      IF EXISTS (
        SELECT 1 FROM community_space_members csm
        WHERE csm.space_id = v_access_value::uuid
          AND csm.member_id = v_member_id
      ) THEN
        RETURN QUERY SELECT true, 'SPACE_OK'::text, ''::text;
      ELSE
        RETURN QUERY SELECT false, 'SPACE_REQUIRED'::text,
          ('Este evento é exclusivo para membros do grupo ' ||
            COALESCE((SELECT name FROM community_spaces WHERE id = v_access_value::uuid), 'selecionado') || '.')::text;
      END IF;

    ELSE
      RETURN QUERY SELECT true, 'UNKNOWN_RULE'::text, ''::text;
  END CASE;
  RETURN;
END;
$$;
