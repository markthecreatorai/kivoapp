
-- Create circle_courses table for classroom management
CREATE TABLE public.circle_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  access_type TEXT NOT NULL DEFAULT 'free',
  cover_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.circle_courses ENABLE ROW LEVEL SECURITY;

-- RLS: Members of the community can view published courses
CREATE POLICY "Community members can view published courses"
  ON public.circle_courses
  FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND public.is_community_member(auth.uid(), community_id)
  );

-- RLS: Admins/owners can view all courses (including unpublished)
CREATE POLICY "Admins can view all courses"
  ON public.circle_courses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = circle_courses.community_id
        AND user_id = auth.uid()
        AND status = 'ACTIVE'
        AND role IN ('OWNER', 'ADMIN')
    )
  );

-- RLS: Admins can insert courses
CREATE POLICY "Admins can insert courses"
  ON public.circle_courses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = circle_courses.community_id
        AND user_id = auth.uid()
        AND status = 'ACTIVE'
        AND role IN ('OWNER', 'ADMIN')
    )
  );

-- RLS: Admins can update courses
CREATE POLICY "Admins can update courses"
  ON public.circle_courses
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = circle_courses.community_id
        AND user_id = auth.uid()
        AND status = 'ACTIVE'
        AND role IN ('OWNER', 'ADMIN')
    )
  );

-- RLS: Admins can delete courses
CREATE POLICY "Admins can delete courses"
  ON public.circle_courses
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = circle_courses.community_id
        AND user_id = auth.uid()
        AND status = 'ACTIVE'
        AND role IN ('OWNER', 'ADMIN')
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_circle_courses_updated_at
  BEFORE UPDATE ON public.circle_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
