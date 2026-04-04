
-- 1. Create all tables first
CREATE TABLE public.community_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date date,
  created_by uuid NOT NULL REFERENCES public.community_members(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.community_task_assignees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.community_tasks(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, member_id)
);

CREATE TABLE public.community_task_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.community_tasks(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.community_members(id),
  action text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX idx_community_tasks_community ON public.community_tasks(community_id);
CREATE INDEX idx_community_tasks_status ON public.community_tasks(community_id, status);
CREATE INDEX idx_task_assignees_task ON public.community_task_assignees(task_id);
CREATE INDEX idx_task_assignees_member ON public.community_task_assignees(member_id);
CREATE INDEX idx_task_events_task ON public.community_task_events(task_id);

-- 3. RLS
ALTER TABLE public.community_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_task_events ENABLE ROW LEVEL SECURITY;

-- 4. Policies for community_tasks
CREATE POLICY "Members can view tasks" ON public.community_tasks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM community_members WHERE community_id = community_tasks.community_id AND user_id = auth.uid() AND status = 'ACTIVE'));

CREATE POLICY "Members can create tasks" ON public.community_tasks FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM community_members WHERE community_id = community_tasks.community_id AND user_id = auth.uid() AND status = 'ACTIVE'));

CREATE POLICY "Authorized users can update tasks" ON public.community_tasks FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM community_members cm
  WHERE cm.community_id = community_tasks.community_id AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
  AND (cm.id = community_tasks.created_by OR cm.role IN ('OWNER', 'ADMIN')
       OR EXISTS (SELECT 1 FROM community_task_assignees WHERE task_id = community_tasks.id AND member_id = cm.id))
));

CREATE POLICY "Staff can delete tasks" ON public.community_tasks FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM community_members WHERE community_id = community_tasks.community_id AND user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND status = 'ACTIVE'));

-- 5. Policies for community_task_assignees
CREATE POLICY "Members can view assignees" ON public.community_task_assignees FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM community_tasks ct JOIN community_members cm ON cm.community_id = ct.community_id AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE' WHERE ct.id = community_task_assignees.task_id));

CREATE POLICY "Members can manage assignees" ON public.community_task_assignees FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM community_tasks ct JOIN community_members cm ON cm.community_id = ct.community_id AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE' WHERE ct.id = community_task_assignees.task_id));

CREATE POLICY "Members can remove assignees" ON public.community_task_assignees FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM community_tasks ct JOIN community_members cm ON cm.community_id = ct.community_id AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE' WHERE ct.id = community_task_assignees.task_id));

-- 6. Policies for community_task_events
CREATE POLICY "Members can view task events" ON public.community_task_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM community_tasks ct JOIN community_members cm ON cm.community_id = ct.community_id AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE' WHERE ct.id = community_task_events.task_id));

CREATE POLICY "Members can insert task events" ON public.community_task_events FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM community_tasks ct JOIN community_members cm ON cm.community_id = ct.community_id AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE' WHERE ct.id = community_task_events.task_id));
