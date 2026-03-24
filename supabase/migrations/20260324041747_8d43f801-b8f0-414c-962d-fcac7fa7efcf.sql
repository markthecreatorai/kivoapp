
-- Create beta_cohort_log with full tracking columns
CREATE TABLE public.beta_cohort_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT now(),
  opened_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  action_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, step)
);

ALTER TABLE public.beta_cohort_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read beta_cohort_log" ON public.beta_cohort_log
  FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));
