CREATE OR REPLACE FUNCTION public.join_community(
  p_community_id uuid,
  p_user_id uuid,
  p_display_name text DEFAULT ''::text,
  p_role text DEFAULT 'MEMBER'::text,
  p_status text DEFAULT 'ACTIVE'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_priority int;
  v_existing_priority int;
  v_existing_role text;
  v_existing_avatar text;
  v_existing_display text;
  v_safe_status community_member_status;
  v_safe_role community_member_role;
BEGIN
  -- Defense-in-depth: coerce text inputs to enum values safely
  v_safe_status := CASE upper(coalesce(p_status, 'ACTIVE'))
    WHEN 'PENDING' THEN 'PENDING'::community_member_status
    WHEN 'ACTIVE'  THEN 'ACTIVE'::community_member_status
    WHEN 'MUTED'   THEN 'MUTED'::community_member_status
    WHEN 'BANNED'  THEN 'BANNED'::community_member_status
    WHEN 'LEFT'    THEN 'LEFT'::community_member_status
    ELSE 'ACTIVE'::community_member_status
  END;

  v_safe_role := CASE upper(coalesce(p_role, 'MEMBER'))
    WHEN 'OWNER'     THEN 'OWNER'::community_member_role
    WHEN 'ADMIN'     THEN 'ADMIN'::community_member_role
    WHEN 'MODERATOR' THEN 'MODERATOR'::community_member_role
    ELSE 'MEMBER'::community_member_role
  END;

  v_role_priority := CASE v_safe_role
    WHEN 'OWNER' THEN 3
    WHEN 'ADMIN' THEN 2
    ELSE 1
  END;

  SELECT role::text INTO v_existing_role
  FROM public.community_members
  WHERE community_id = p_community_id AND user_id = p_user_id;

  IF v_existing_role IS NOT NULL THEN
    v_existing_priority := CASE v_existing_role
      WHEN 'OWNER' THEN 3
      WHEN 'ADMIN' THEN 2
      ELSE 1
    END;

    IF v_role_priority > v_existing_priority THEN
      UPDATE public.community_members
      SET role = v_safe_role,
          display_name = CASE
            WHEN display_name IS NULL OR display_name = ''
              THEN COALESCE(NULLIF(p_display_name, ''), display_name)
            ELSE display_name
          END,
          status = v_safe_status
      WHERE community_id = p_community_id AND user_id = p_user_id;
    ELSE
      UPDATE public.community_members
      SET display_name = COALESCE(NULLIF(p_display_name, ''), display_name)
      WHERE community_id = p_community_id AND user_id = p_user_id
        AND (display_name IS NULL OR display_name = '');
    END IF;
  ELSE
    SELECT cm.avatar_url, cm.display_name
    INTO v_existing_avatar, v_existing_display
    FROM public.community_members cm
    WHERE cm.user_id = p_user_id
      AND cm.avatar_url IS NOT NULL
    ORDER BY cm.updated_at DESC
    LIMIT 1;

    INSERT INTO public.community_members (community_id, user_id, display_name, avatar_url, role, status)
    VALUES (
      p_community_id,
      p_user_id,
      COALESCE(NULLIF(p_display_name, ''), v_existing_display, ''),
      v_existing_avatar,
      v_safe_role,
      v_safe_status
    );
  END IF;
END;
$$;