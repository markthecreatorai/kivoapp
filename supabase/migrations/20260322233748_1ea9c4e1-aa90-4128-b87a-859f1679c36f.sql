
-- Add type and parent_id to circle_lessons for module/page hierarchy
ALTER TABLE public.circle_lessons 
  ADD COLUMN type TEXT NOT NULL DEFAULT 'page',
  ADD COLUMN parent_id UUID REFERENCES public.circle_lessons(id) ON DELETE CASCADE;

-- Index for fast lookups
CREATE INDEX idx_circle_lessons_parent_id ON public.circle_lessons(parent_id);
CREATE INDEX idx_circle_lessons_course_type ON public.circle_lessons(course_id, type);
