-- 1. Public buckets: remove broad listing policies (direct public URL access still works)
DROP POLICY IF EXISTS "Assets bucket: Public access for view" ON storage.objects;
DROP POLICY IF EXISTS "Public can view community files" ON storage.objects;

-- 2. checkout_sessions: remove unscoped anon read/update
DROP POLICY IF EXISTS "Public can view active checkout sessions" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Checkout sessions update by session owner" ON public.checkout_sessions;

CREATE OR REPLACE FUNCTION public.get_checkout_session_public(p_session_id uuid)
RETURNS TABLE(id uuid, email text, workspace_id uuid, coupon_code text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cs.id, cs.email, cs.workspace_id, cs.coupon_code, cs.status
  FROM public.checkout_sessions cs
  WHERE cs.id = p_session_id
    AND cs.created_at > now() - interval '30 days'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.complete_checkout_session(p_session_id uuid, p_recovered boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.checkout_sessions
  SET status = 'COMPLETED',
      completed_at = now(),
      recovered_checkout = COALESCE(p_recovered, false) OR COALESCE(recovered_checkout, false)
  WHERE id = p_session_id
    AND status <> 'COMPLETED'
    AND created_at > now() - interval '30 days';
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_session_public(uuid) FROM public;
REVOKE ALL ON FUNCTION public.complete_checkout_session(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.get_checkout_session_public(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_checkout_session(uuid, boolean) TO anon, authenticated, service_role;

-- 3. community_invite_links: remove unscoped UPDATE, add controlled counter bump
DROP POLICY IF EXISTS "invite_links_update_uses" ON public.community_invite_links;

CREATE OR REPLACE FUNCTION public.increment_invite_link_uses(p_link_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.community_invite_links
  SET uses_count = COALESCE(uses_count, 0) + 1
  WHERE id = p_link_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR COALESCE(uses_count, 0) < max_uses);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_invite_link_uses(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_invite_link_uses(uuid) TO authenticated, service_role;

-- 4. community_reports: restrict UPDATE to owners/admins/moderators
DROP POLICY IF EXISTS "Admins update reports" ON public.community_reports;

CREATE POLICY "Staff update reports"
ON public.community_reports
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = community_reports.community_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
      AND cm.role IN ('OWNER', 'ADMIN', 'MODERATOR')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = community_reports.community_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
      AND cm.role IN ('OWNER', 'ADMIN', 'MODERATOR')
  )
);

-- 5. Platform admin: role table instead of hardcoded email
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Seed current platform admin so access is preserved
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE email = 'lucaslopescarrijo@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_admin_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::public.app_role
  )
$$;

-- 6. Realtime channel authorization
DROP POLICY IF EXISTS "realtime_authenticated_scoped_read" ON realtime.messages;
CREATE POLICY "realtime_authenticated_scoped_read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = auth.uid()::text
  OR realtime.topic() LIKE 'user:' || auth.uid()::text || '%'
  OR EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
      AND realtime.topic() LIKE '%' || cm.community_id::text || '%'
  )
);

DROP POLICY IF EXISTS "realtime_authenticated_scoped_write" ON realtime.messages;
CREATE POLICY "realtime_authenticated_scoped_write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = auth.uid()::text
  OR realtime.topic() LIKE 'user:' || auth.uid()::text || '%'
  OR EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
      AND realtime.topic() LIKE '%' || cm.community_id::text || '%'
  )
);