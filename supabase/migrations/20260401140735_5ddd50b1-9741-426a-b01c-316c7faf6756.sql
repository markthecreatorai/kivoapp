
-- 1. Add username and sync_with_kivo columns
ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS sync_with_kivo boolean NOT NULL DEFAULT true;

-- 2. Unique username per community
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_members_username_unique
  ON public.community_members (community_id, username)
  WHERE username IS NOT NULL;

-- 3. Create join_community RPC (SECURITY DEFINER to bypass RLS)
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
  v_email text;
  v_meta jsonb;
  v_display text;
  v_avatar text;
  v_username text;
  v_base_username text;
  v_counter int := 0;
BEGIN
  -- Get user info from auth.users for profile snapshot
  SELECT email, raw_user_meta_data INTO v_email, v_meta
  FROM auth.users WHERE id = p_user_id;

  -- Derive display name: param > meta > email prefix
  v_display := NULLIF(TRIM(p_display_name), '');
  IF v_display IS NULL THEN
    v_display := NULLIF(TRIM(v_meta->>'display_name'), '');
  END IF;
  IF v_display IS NULL AND v_email IS NOT NULL THEN
    v_display := split_part(v_email, '@', 1);
  END IF;

  -- Derive avatar from meta
  v_avatar := NULLIF(TRIM(v_meta->>'avatar_url'), '');

  -- Generate unique username from email
  IF v_email IS NOT NULL THEN
    v_base_username := lower(regexp_replace(split_part(v_email, '@', 1), '[^a-z0-9_]', '', 'g'));
  ELSE
    v_base_username := 'user';
  END IF;
  v_username := v_base_username;

  -- Ensure uniqueness within community
  WHILE EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = p_community_id AND username = v_username
  ) LOOP
    v_counter := v_counter + 1;
    v_username := v_base_username || v_counter::text;
  END LOOP;

  -- Insert member (skip on duplicate)
  INSERT INTO community_members (
    community_id, user_id, role, status,
    display_name, avatar_url, username, sync_with_kivo
  ) VALUES (
    p_community_id, p_user_id, p_role::community_member_role, p_status::community_member_status,
    v_display, v_avatar, v_username,
    CASE WHEN p_role IN ('OWNER', 'ADMIN') THEN true ELSE true END
  )
  ON CONFLICT (community_id, user_id) DO NOTHING;
END;
$$;

-- 4. Trigger: enforce sync_with_kivo = true for OWNER/ADMIN
CREATE OR REPLACE FUNCTION public.fn_enforce_sync_owner_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('OWNER', 'ADMIN') THEN
    NEW.sync_with_kivo := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sync_owner_admin ON public.community_members;
CREATE TRIGGER trg_enforce_sync_owner_admin
  BEFORE INSERT OR UPDATE ON public.community_members
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_sync_owner_admin();

-- 5. Backfill: set username from auth.users email where missing
UPDATE community_members cm
SET username = sub.generated_username,
    sync_with_kivo = CASE WHEN cm.role IN ('OWNER', 'ADMIN') THEN true ELSE cm.sync_with_kivo END
FROM (
  SELECT cm2.id,
    lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_]', '', 'g')) AS generated_username
  FROM community_members cm2
  JOIN auth.users u ON u.id = cm2.user_id
  WHERE cm2.username IS NULL
) sub
WHERE cm.id = sub.id;

-- Handle username collisions from backfill (append row number)
WITH dupes AS (
  SELECT id, username,
    ROW_NUMBER() OVER (PARTITION BY community_id, username ORDER BY created_at) AS rn
  FROM community_members
  WHERE username IS NOT NULL
)
UPDATE community_members cm
SET username = dupes.username || dupes.rn::text
FROM dupes
WHERE cm.id = dupes.id AND dupes.rn > 1;

-- 6. Update fn_sync_member_avatar to respect sync_with_kivo
CREATE OR REPLACE FUNCTION public.fn_sync_member_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url AND NEW.user_id IS NOT NULL THEN
    UPDATE community_members
    SET avatar_url = NEW.avatar_url
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND sync_with_kivo = true;
  END IF;
  RETURN NEW;
END;
$$;
