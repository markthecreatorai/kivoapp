
-- 72h operational checklist
CREATE TABLE public.ops_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  time_window text NOT NULL,
  task text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage checklist"
  ON public.ops_checklist FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Week 1 plan items
CREATE TABLE public.week1_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  owner text,
  due_date date,
  status text NOT NULL DEFAULT 'todo',
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.week1_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage week1 plan"
  ON public.week1_plan FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
