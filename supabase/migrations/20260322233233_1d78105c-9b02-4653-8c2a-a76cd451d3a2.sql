
CREATE TABLE public.circle_lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.circle_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Lesson',
  content TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.circle_lessons ENABLE ROW LEVEL SECURITY;

-- Members can view published lessons of published courses they belong to
CREATE POLICY "Members can view published lessons"
  ON public.circle_lessons
  FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM public.circle_courses cc
      JOIN public.community_members cm ON cm.community_id = cc.community_id
      WHERE cc.id = circle_lessons.course_id
        AND cc.is_published = true
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );

-- Admins can view all lessons
CREATE POLICY "Admins can view all lessons"
  ON public.circle_lessons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.circle_courses cc
      JOIN public.community_members cm ON cm.community_id = cc.community_id
      WHERE cc.id = circle_lessons.course_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
        AND cm.role IN ('OWNER', 'ADMIN')
    )
  );

-- Admins can insert lessons
CREATE POLICY "Admins can insert lessons"
  ON public.circle_lessons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.circle_courses cc
      JOIN public.community_members cm ON cm.community_id = cc.community_id
      WHERE cc.id = circle_lessons.course_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
        AND cm.role IN ('OWNER', 'ADMIN')
    )
  );

-- Admins can update lessons
CREATE POLICY "Admins can update lessons"
  ON public.circle_lessons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.circle_courses cc
      JOIN public.community_members cm ON cm.community_id = cc.community_id
      WHERE cc.id = circle_lessons.course_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
        AND cm.role IN ('OWNER', 'ADMIN')
    )
  );

-- Admins can delete lessons
CREATE POLICY "Admins can delete lessons"
  ON public.circle_lessons
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.circle_courses cc
      JOIN public.community_members cm ON cm.community_id = cc.community_id
      WHERE cc.id = circle_lessons.course_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
        AND cm.role IN ('OWNER', 'ADMIN')
    )
  );

CREATE TRIGGER update_circle_lessons_updated_at
  BEFORE UPDATE ON public.circle_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
