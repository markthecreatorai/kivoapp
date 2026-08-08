CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid,
  generation_type text NOT NULL,
  model text,
  source text NOT NULL DEFAULT 'ai-generate',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace admins can view ai usage"
ON public.ai_usage_log
FOR SELECT
TO authenticated
USING (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_workspace_created
ON public.ai_usage_log (workspace_id, created_at DESC);