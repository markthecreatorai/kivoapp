
-- Acquisition leads pipeline
CREATE TABLE public.acquisition_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  channel TEXT NOT NULL DEFAULT 'outbound' CHECK (channel IN ('content', 'outbound', 'partner', 'referral', 'ads')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'demo', 'won', 'lost')),
  notes TEXT,
  owner TEXT,
  revenue_attributed INTEGER DEFAULT 0,
  cost INTEGER DEFAULT 0,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.acquisition_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own workspace acquisition leads"
  ON public.acquisition_leads FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- Acquisition tasks (follow-up cadence)
CREATE TABLE public.acquisition_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.acquisition_leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'follow_up' CHECK (task_type IN ('follow_up', 'demo', 'email', 'dm', 'whatsapp', 'call', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.acquisition_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own workspace acquisition tasks"
  ON public.acquisition_tasks FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- Playbook checklist items
CREATE TABLE public.playbook_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 14),
  item_key TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, day_number, item_key)
);

ALTER TABLE public.playbook_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own workspace playbook"
  ON public.playbook_checklist FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- Indexes
CREATE INDEX idx_acquisition_leads_workspace ON public.acquisition_leads(workspace_id);
CREATE INDEX idx_acquisition_leads_status ON public.acquisition_leads(workspace_id, status);
CREATE INDEX idx_acquisition_tasks_due ON public.acquisition_tasks(workspace_id, due_date, status);
CREATE INDEX idx_playbook_workspace ON public.playbook_checklist(workspace_id);

-- Updated_at trigger for acquisition_leads
CREATE TRIGGER update_acquisition_leads_updated_at
  BEFORE UPDATE ON public.acquisition_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
