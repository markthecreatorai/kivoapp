
-- 1. community_invite_links
CREATE TABLE IF NOT EXISTS public.community_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.community_members(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE DEFAULT lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  max_uses int,
  uses_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Community admins manage invite links"
  ON public.community_invite_links FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = community_invite_links.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
        AND cm.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = community_invite_links.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
        AND cm.status = 'ACTIVE'
    )
  );

CREATE POLICY "Anyone can view active invite links"
  ON public.community_invite_links FOR SELECT
  USING (is_active = true);

-- 2. New columns on community_members
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"likes": true, "comments": true, "dms": true, "events": true, "announcements": true}'::jsonb;

-- 3. circle_lesson_progress
CREATE TABLE IF NOT EXISTS public.circle_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.circle_lessons(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  completed_at timestamptz,
  progress_pct int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, member_id)
);

ALTER TABLE public.circle_lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage own lesson progress"
  ON public.circle_lesson_progress FOR ALL TO authenticated
  USING (
    member_id IN (SELECT id FROM public.community_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    member_id IN (SELECT id FROM public.community_members WHERE user_id = auth.uid())
  );

CREATE TRIGGER trg_lesson_progress_updated_at
  BEFORE UPDATE ON public.circle_lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. New columns on communities
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT true;
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS category text;
