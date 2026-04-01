-- Onboarding tasks configured by admin
CREATE TABLE public.community_onboarding_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'custom',
  target_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validate task_type
CREATE OR REPLACE FUNCTION public.fn_validate_onboarding_task_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NEW.task_type NOT IN ('video', 'link', 'social_action', 'visit_page', 'custom') THEN
    RAISE EXCEPTION 'task_type must be video, link, social_action, visit_page, or custom';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_onboarding_task_type
  BEFORE INSERT OR UPDATE ON public.community_onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_onboarding_task_type();

CREATE TRIGGER update_onboarding_tasks_updated_at
  BEFORE UPDATE ON public.community_onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Progress per member per task
CREATE TABLE public.community_onboarding_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.community_onboarding_tasks(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, member_id)
);

-- RLS: tasks
ALTER TABLE public.community_onboarding_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active community members can view onboarding tasks"
  ON public.community_onboarding_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = community_onboarding_tasks.community_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );

CREATE POLICY "Admins can manage onboarding tasks"
  ON public.community_onboarding_tasks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = community_onboarding_tasks.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
        AND cm.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = community_onboarding_tasks.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
        AND cm.status = 'ACTIVE'
    )
  );

-- RLS: progress
ALTER TABLE public.community_onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own onboarding progress"
  ON public.community_onboarding_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.id = community_onboarding_progress.member_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert own onboarding progress"
  ON public.community_onboarding_progress FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.id = community_onboarding_progress.member_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete own onboarding progress"
  ON public.community_onboarding_progress FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.id = community_onboarding_progress.member_id
        AND cm.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_onboarding_tasks_community ON public.community_onboarding_tasks(community_id, is_active, position);
CREATE INDEX idx_onboarding_progress_member ON public.community_onboarding_progress(member_id);
CREATE INDEX idx_onboarding_progress_task ON public.community_onboarding_progress(task_id);