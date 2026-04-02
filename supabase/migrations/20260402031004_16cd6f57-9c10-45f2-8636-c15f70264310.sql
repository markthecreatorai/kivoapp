
-- 1) Update join_community RPC to support role promotion
CREATE OR REPLACE FUNCTION public.join_community(
  p_community_id uuid,
  p_user_id uuid,
  p_display_name text DEFAULT '',
  p_role text DEFAULT 'MEMBER',
  p_status text DEFAULT 'ACTIVE'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_priority int;
  v_existing_priority int;
  v_existing_role text;
BEGIN
  -- Map roles to priority (higher = more privileged)
  v_role_priority := CASE p_role
    WHEN 'OWNER' THEN 3
    WHEN 'ADMIN' THEN 2
    ELSE 1
  END;

  -- Check existing role
  SELECT role INTO v_existing_role
  FROM public.community_members
  WHERE community_id = p_community_id AND user_id = p_user_id;

  IF v_existing_role IS NOT NULL THEN
    v_existing_priority := CASE v_existing_role
      WHEN 'OWNER' THEN 3
      WHEN 'ADMIN' THEN 2
      ELSE 1
    END;

    -- Only update if new role is more privileged, or update empty display_name
    IF v_role_priority > v_existing_priority THEN
      UPDATE public.community_members
      SET role = p_role,
          display_name = CASE WHEN display_name IS NULL OR display_name = '' THEN COALESCE(NULLIF(p_display_name, ''), display_name) ELSE display_name END,
          status = p_status
      WHERE community_id = p_community_id AND user_id = p_user_id;
    ELSIF (display_name IS NULL OR display_name = '') THEN
      UPDATE public.community_members
      SET display_name = COALESCE(NULLIF(p_display_name, ''), display_name)
      WHERE community_id = p_community_id AND user_id = p_user_id
        AND (display_name IS NULL OR display_name = '');
    END IF;
  ELSE
    INSERT INTO public.community_members (community_id, user_id, display_name, role, status)
    VALUES (p_community_id, p_user_id, p_display_name, p_role, p_status);
  END IF;
END;
$$;

-- 2) Fix Lucas's membership data
UPDATE public.community_members
SET role = 'OWNER', display_name = 'Lucas Carrijo'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'lucaslopescarrijo@gmail.com')
  AND community_id = (SELECT id FROM public.communities WHERE slug = 'creatoracademyceo');
