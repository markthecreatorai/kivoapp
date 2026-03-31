-- Fix RPC signature mismatch for join_community
-- Supports both parameter orders used by different frontend versions.

-- Canonical signature used by current frontend
CREATE OR REPLACE FUNCTION public.join_community(
  p_community_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_role text DEFAULT 'MEMBER',
  p_status text DEFAULT 'ACTIVE'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.community_members (
    community_id,
    user_id,
    role,
    status,
    display_name
  )
  VALUES (
    p_community_id,
    p_user_id,
    p_role,
    p_status,
    p_display_name
  )
  ON CONFLICT (community_id, user_id) DO NOTHING;

  UPDATE public.communities
  SET member_count = (
    SELECT COUNT(*)
    FROM public.community_members
    WHERE community_id = p_community_id
      AND status = 'ACTIVE'
  )
  WHERE id = p_community_id;
END;
$$;

-- Legacy/alternate signature expected by some clients/cache
CREATE OR REPLACE FUNCTION public.join_community(
  p_community_id uuid,
  p_display_name text,
  p_role text DEFAULT 'MEMBER',
  p_status text DEFAULT 'ACTIVE',
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  INSERT INTO public.community_members (
    community_id,
    user_id,
    role,
    status,
    display_name
  )
  VALUES (
    p_community_id,
    p_user_id,
    p_role,
    p_status,
    p_display_name
  )
  ON CONFLICT (community_id, user_id) DO NOTHING;

  UPDATE public.communities
  SET member_count = (
    SELECT COUNT(*)
    FROM public.community_members
    WHERE community_id = p_community_id
      AND status = 'ACTIVE'
  )
  WHERE id = p_community_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_community(uuid, uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_community(uuid, text, text, text, uuid) TO anon, authenticated;

-- Refresh PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
