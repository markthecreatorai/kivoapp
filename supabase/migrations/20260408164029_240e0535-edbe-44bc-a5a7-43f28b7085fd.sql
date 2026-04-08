
-- 1) Drop existing trigger that only syncs avatar (we'll replace with broader one)
DROP TRIGGER IF EXISTS trg_sync_member_avatar ON public.community_members;
DROP FUNCTION IF EXISTS public.fn_sync_member_avatar();

-- 2) Create new sync function for avatar + display_name
CREATE OR REPLACE FUNCTION public.sync_member_profile_across_communities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Prevent infinite recursion from cascading trigger fires
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Only act when avatar_url or display_name actually changed
  IF (NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url)
     AND (NEW.display_name IS NOT DISTINCT FROM OLD.display_name) THEN
    RETURN NEW;
  END IF;

  UPDATE community_members
  SET avatar_url = COALESCE(NEW.avatar_url, avatar_url),
      display_name = COALESCE(NULLIF(NEW.display_name, ''), display_name),
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND id != NEW.id
    AND (sync_with_kivo IS NOT FALSE);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_member_profile
  AFTER UPDATE OF avatar_url, display_name ON public.community_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_member_profile_across_communities();

-- 3) Update join_community RPC to copy avatar/display_name from existing memberships
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

  -- Check existing membership in THIS community
  SELECT role INTO v_existing_role
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
      SET role = p_role,
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
    -- NEW member: fetch avatar/display_name from most recent existing membership
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
      p_role,
      p_status
    );
  END IF;
END;
$$;

-- 4) Data fix: sync existing memberships
-- For each user with multiple memberships, propagate the most recent non-null avatar and display_name
WITH best AS (
  SELECT DISTINCT ON (user_id)
    user_id, avatar_url, display_name
  FROM community_members
  WHERE avatar_url IS NOT NULL AND avatar_url != ''
  ORDER BY user_id, updated_at DESC
)
UPDATE community_members cm
SET avatar_url = COALESCE(cm.avatar_url, best.avatar_url),
    display_name = COALESCE(NULLIF(cm.display_name, ''), best.display_name)
FROM best
WHERE cm.user_id = best.user_id
  AND (cm.avatar_url IS NULL OR cm.avatar_url = '' OR cm.display_name IS NULL OR cm.display_name = '')
  AND (cm.sync_with_kivo IS NOT FALSE);
