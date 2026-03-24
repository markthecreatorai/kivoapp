
-- Onboarding progress table
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, step_key)
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workspace onboarding"
  ON public.onboarding_progress FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own workspace onboarding"
  ON public.onboarding_progress FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own workspace onboarding"
  ON public.onboarding_progress FOR UPDATE TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));

-- Add activated_at to workspaces
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_workspace ON public.onboarding_progress(workspace_id);
