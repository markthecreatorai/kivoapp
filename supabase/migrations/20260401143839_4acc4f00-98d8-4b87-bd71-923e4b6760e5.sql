
-- Add access_mode and min_level to circle_courses
ALTER TABLE public.circle_courses
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS min_level integer;

-- Validation trigger
CREATE OR REPLACE FUNCTION public.fn_validate_course_access_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.access_mode NOT IN ('OPEN', 'LEVEL_GATED') THEN
    RAISE EXCEPTION 'access_mode must be OPEN or LEVEL_GATED';
  END IF;

  IF NEW.access_mode = 'OPEN' THEN
    NEW.min_level := NULL;
  END IF;

  IF NEW.access_mode = 'LEVEL_GATED' THEN
    IF NEW.min_level IS NULL OR NEW.min_level < 1 THEN
      RAISE EXCEPTION 'LEVEL_GATED requires min_level >= 1';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_course_access_mode ON public.circle_courses;
CREATE TRIGGER trg_validate_course_access_mode
  BEFORE INSERT OR UPDATE ON public.circle_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_course_access_mode();

-- RPC to check access
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
  v_access_mode text;
  v_min_level integer;
BEGIN
  -- Get member info
  SELECT cm.status, cm.level INTO v_member_status, v_member_level
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

  -- Get course access mode
  SELECT cc.access_mode, cc.min_level INTO v_access_mode, v_min_level
  FROM circle_courses cc
  WHERE cc.id = p_course_id AND cc.community_id = p_community_id
  LIMIT 1;

  IF v_access_mode IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_FOUND'::text, NULL::integer, v_member_level;
    RETURN;
  END IF;

  IF v_access_mode = 'OPEN' THEN
    RETURN QUERY SELECT true, 'OPEN'::text, NULL::integer, v_member_level;
    RETURN;
  END IF;

  -- LEVEL_GATED
  IF v_member_level >= v_min_level THEN
    RETURN QUERY SELECT true, 'OPEN'::text, v_min_level, v_member_level;
  ELSE
    RETURN QUERY SELECT false, 'LEVEL_REQUIRED'::text, v_min_level, v_member_level;
  END IF;
  RETURN;
END;
$$;
