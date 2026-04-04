
-- Helper function first
CREATE OR REPLACE FUNCTION public.is_workspace_admin(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
    AND user_id = _user_id
    AND role IN ('OWNER', 'ADMIN')
  );
$$;

-- Content Assets
CREATE TABLE public.content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('product', 'lesson', 'community_resource')),
  owner_id UUID NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_content_assets_workspace ON public.content_assets(workspace_id);
CREATE INDEX idx_content_assets_owner ON public.content_assets(owner_type, owner_id);

-- User Asset Entitlements
CREATE TABLE public.user_asset_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  asset_id UUID NOT NULL REFERENCES public.content_assets(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('purchase', 'subscription', 'manual')),
  source_id UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
ALTER TABLE public.user_asset_entitlements ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_uae_user ON public.user_asset_entitlements(user_id);
CREATE INDEX idx_uae_asset ON public.user_asset_entitlements(asset_id);
CREATE UNIQUE INDEX idx_uae_unique ON public.user_asset_entitlements(user_id, asset_id) WHERE revoked_at IS NULL;

-- Asset Download Logs
CREATE TABLE public.asset_download_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  asset_id UUID NOT NULL REFERENCES public.content_assets(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  user_agent TEXT
);
ALTER TABLE public.asset_download_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_adl_user ON public.asset_download_logs(user_id);
CREATE INDEX idx_adl_asset ON public.asset_download_logs(asset_id);

-- RLS: content_assets
CREATE POLICY "Users view entitled assets" ON public.content_assets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_asset_entitlements uae
    WHERE uae.asset_id = content_assets.id AND uae.user_id = auth.uid() AND uae.revoked_at IS NULL
  ));
CREATE POLICY "Admins manage assets" ON public.content_assets FOR ALL
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

-- RLS: user_asset_entitlements
CREATE POLICY "Users view own entitlements" ON public.user_asset_entitlements FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Admins manage entitlements" ON public.user_asset_entitlements FOR ALL
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

-- RLS: asset_download_logs
CREATE POLICY "Users view own logs" ON public.asset_download_logs FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users insert own logs" ON public.asset_download_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins view all logs" ON public.asset_download_logs FOR SELECT
  USING (public.is_workspace_admin(auth.uid(), workspace_id));

-- Trigger
CREATE TRIGGER update_content_assets_updated_at
  BEFORE UPDATE ON public.content_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
