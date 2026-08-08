CREATE TABLE IF NOT EXISTS public.community_join_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.community_members(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  invite_code TEXT,
  review_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_join_applications_status_check CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  CONSTRAINT community_join_applications_unique_user UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cja_community_status ON public.community_join_applications (community_id, status);
CREATE INDEX IF NOT EXISTS idx_cja_member ON public.community_join_applications (member_id);
CREATE INDEX IF NOT EXISTS idx_cja_user ON public.community_join_applications (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_join_applications TO authenticated;
GRANT ALL ON public.community_join_applications TO service_role;

ALTER TABLE public.community_join_applications ENABLE ROW LEVEL SECURITY;

-- Helper: moderação da comunidade (OWNER/ADMIN/MODERATOR ativos) sem recursão
CREATE OR REPLACE FUNCTION public.can_moderate_community(_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = _community_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'::public.community_member_status
      AND cm.role IN ('OWNER'::public.community_member_role,
                      'ADMIN'::public.community_member_role,
                      'MODERATOR'::public.community_member_role)
  ) OR public.is_community_workspace_admin(_community_id);
$$;

REVOKE ALL ON FUNCTION public.can_moderate_community(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_moderate_community(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_admin_community(_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = _community_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'::public.community_member_status
      AND cm.role IN ('OWNER'::public.community_member_role,
                      'ADMIN'::public.community_member_role)
  ) OR public.is_community_workspace_admin(_community_id);
$$;

REVOKE ALL ON FUNCTION public.can_admin_community(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_admin_community(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS cja_select_own ON public.community_join_applications;
CREATE POLICY cja_select_own ON public.community_join_applications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_moderate_community(community_id));

DROP POLICY IF EXISTS cja_insert_own ON public.community_join_applications;
CREATE POLICY cja_insert_own ON public.community_join_applications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'PENDING');

DROP POLICY IF EXISTS cja_update_moderator ON public.community_join_applications;
CREATE POLICY cja_update_moderator ON public.community_join_applications
  FOR UPDATE TO authenticated
  USING (public.can_moderate_community(community_id))
  WITH CHECK (public.can_moderate_community(community_id));

DROP POLICY IF EXISTS cja_delete_admin ON public.community_join_applications;
CREATE POLICY cja_delete_admin ON public.community_join_applications
  FOR DELETE TO authenticated
  USING (public.can_admin_community(community_id));

DROP TRIGGER IF EXISTS trg_cja_updated_at ON public.community_join_applications;
CREATE TRIGGER trg_cja_updated_at
  BEFORE UPDATE ON public.community_join_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();