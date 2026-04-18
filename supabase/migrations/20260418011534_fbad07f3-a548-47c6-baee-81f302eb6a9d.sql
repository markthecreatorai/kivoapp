-- Fix enum cast in join_community RPC
-- The role column is community_member_role enum, but p_role is text
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
BEGIN
  v_role_priority := CASE p_role
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
      SET role = p_role::community_member_role,
          display_name = CASE WHEN display_name IS NULL OR display_name = '' THEN COALESCE(NULLIF(p_display_name, ''), display_name) ELSE display_name END,
          status = p_status
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
      p_role::community_member_role,
      p_status
    );
  END IF;
END;
$$;