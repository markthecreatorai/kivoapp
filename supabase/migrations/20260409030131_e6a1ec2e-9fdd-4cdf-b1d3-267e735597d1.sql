
-- ============================================================
-- 1. courses
-- ============================================================
CREATE TABLE public.courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  title VARCHAR(100) NOT NULL DEFAULT 'Novo Curso',
  description_richtext TEXT,
  hero_image_url TEXT,
  branding_title_font TEXT DEFAULT 'Inter',
  branding_bg_color TEXT DEFAULT '#ffffff',
  branding_highlight_color TEXT DEFAULT '#6366f1',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can select courses"
  ON public.courses FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "workspace members can insert courses"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "workspace members can update courses"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "workspace members can delete courses"
  ON public.courses FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

-- ============================================================
-- 2. course_modules
-- ============================================================
CREATE TABLE public.course_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL DEFAULT 'Novo Módulo',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','drip')),
  drip_type TEXT NOT NULL DEFAULT 'none' CHECK (drip_type IN ('none','date','days_after_purchase')),
  drip_at TIMESTAMPTZ,
  drip_days INT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can select course_modules"
  ON public.course_modules FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c WHERE c.id = course_id AND public.is_workspace_member(c.workspace_id)
  ));

CREATE POLICY "workspace members can insert course_modules"
  ON public.course_modules FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.courses c WHERE c.id = course_id AND public.is_workspace_member(c.workspace_id)
  ));

CREATE POLICY "workspace members can update course_modules"
  ON public.course_modules FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c WHERE c.id = course_id AND public.is_workspace_member(c.workspace_id)
  ));

CREATE POLICY "workspace members can delete course_modules"
  ON public.course_modules FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c WHERE c.id = course_id AND public.is_workspace_member(c.workspace_id)
  ));

-- ============================================================
-- 3. course_lessons
-- ============================================================
CREATE TABLE public.course_lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL DEFAULT 'Nova Aula',
  description_richtext TEXT,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can select course_lessons"
  ON public.course_lessons FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = module_id AND public.is_workspace_member(c.workspace_id)
  ));

CREATE POLICY "workspace members can insert course_lessons"
  ON public.course_lessons FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.course_modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = module_id AND public.is_workspace_member(c.workspace_id)
  ));

CREATE POLICY "workspace members can update course_lessons"
  ON public.course_lessons FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = module_id AND public.is_workspace_member(c.workspace_id)
  ));

CREATE POLICY "workspace members can delete course_lessons"
  ON public.course_lessons FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = module_id AND public.is_workspace_member(c.workspace_id)
  ));

-- ============================================================
-- 4. lesson_materials
-- ============================================================
CREATE TABLE public.lesson_materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can select lesson_materials"
  ON public.lesson_materials FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_lessons l
    JOIN public.course_modules m ON m.id = l.module_id
    JOIN public.courses c ON c.id = m.course_id
    WHERE l.id = lesson_id AND public.is_workspace_member(c.workspace_id)
  ));

CREATE POLICY "workspace members can insert lesson_materials"
  ON public.lesson_materials FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.course_lessons l
    JOIN public.course_modules m ON m.id = l.module_id
    JOIN public.courses c ON c.id = m.course_id
    WHERE l.id = lesson_id AND public.is_workspace_member(c.workspace_id)
  ));

CREATE POLICY "workspace members can update lesson_materials"
  ON public.lesson_materials FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_lessons l
    JOIN public.course_modules m ON m.id = l.module_id
    JOIN public.courses c ON c.id = m.course_id
    WHERE l.id = lesson_id AND public.is_workspace_member(c.workspace_id)
  ));

CREATE POLICY "workspace members can delete lesson_materials"
  ON public.lesson_materials FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_lessons l
    JOIN public.course_modules m ON m.id = l.module_id
    JOIN public.courses c ON c.id = m.course_id
    WHERE l.id = lesson_id AND public.is_workspace_member(c.workspace_id)
  ));

-- ============================================================
-- 5. updated_at triggers
-- ============================================================
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_course_modules_updated_at
  BEFORE UPDATE ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_course_lessons_updated_at
  BEFORE UPDATE ON public.course_lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. Title length validation trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_title_length()
RETURNS TRIGGER AS $$
BEGIN
  IF length(NEW.title) > 100 THEN
    RAISE EXCEPTION 'Title must be at most 100 characters';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_courses_title
  BEFORE INSERT OR UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.validate_title_length();

CREATE TRIGGER validate_course_modules_title
  BEFORE INSERT OR UPDATE ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION public.validate_title_length();

CREATE TRIGGER validate_course_lessons_title
  BEFORE INSERT OR UPDATE ON public.course_lessons
  FOR EACH ROW EXECUTE FUNCTION public.validate_title_length();

-- ============================================================
-- 7. Indexes
-- ============================================================
CREATE INDEX idx_courses_workspace ON public.courses(workspace_id);
CREATE INDEX idx_courses_product ON public.courses(product_id);
CREATE INDEX idx_course_modules_course ON public.course_modules(course_id);
CREATE INDEX idx_course_modules_position ON public.course_modules(course_id, position);
CREATE INDEX idx_course_lessons_module ON public.course_lessons(module_id);
CREATE INDEX idx_course_lessons_position ON public.course_lessons(module_id, position);
CREATE INDEX idx_lesson_materials_lesson ON public.lesson_materials(lesson_id);
