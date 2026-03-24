
-- Experiments table for A/B pricing and CTA tests
CREATE TABLE public.experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  experiment_key TEXT NOT NULL UNIQUE,
  variants JSONB NOT NULL DEFAULT '["A","B"]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  min_sample INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- User/workspace variant assignments
CREATE TABLE public.experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key TEXT NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_id TEXT,
  variant TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(experiment_key, workspace_id),
  UNIQUE(experiment_key, session_id)
);

ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;

-- Public read for experiments (needed on landing/pricing pages)
CREATE POLICY "Anyone can read active experiments" ON public.experiments FOR SELECT USING (is_active = true);

-- Assignments: anyone can read their own, insert their own
CREATE POLICY "Anyone can read own assignments" ON public.experiment_assignments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert assignments" ON public.experiment_assignments FOR INSERT WITH CHECK (true);

CREATE INDEX idx_experiment_assignments_key ON public.experiment_assignments(experiment_key);
CREATE INDEX idx_experiment_assignments_workspace ON public.experiment_assignments(workspace_id);

-- Seed the two initial experiments
INSERT INTO public.experiments (name, experiment_key, variants) VALUES
  ('Pricing Creator', 'pricing_creator', '["A","B"]'),
  ('Upgrade CTA', 'upgrade_cta', '["A","B"]');
