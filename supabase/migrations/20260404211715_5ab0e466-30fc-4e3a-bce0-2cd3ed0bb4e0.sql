CREATE TABLE public.circle_certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.circle_courses(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  course_name TEXT NOT NULL,
  creator_name TEXT,
  hours INTEGER DEFAULT 0,
  certificate_code TEXT NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, course_id),
  UNIQUE(certificate_code)
);

CREATE INDEX idx_circle_certificates_member ON public.circle_certificates(member_id);
CREATE INDEX idx_circle_certificates_course ON public.circle_certificates(course_id);
CREATE INDEX idx_circle_certificates_code ON public.circle_certificates(certificate_code);
CREATE INDEX idx_circle_certificates_community ON public.circle_certificates(community_id);

ALTER TABLE public.circle_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "certificates_public_read"
  ON public.circle_certificates FOR SELECT
  USING (true);

CREATE POLICY "certificates_member_insert"
  ON public.circle_certificates FOR INSERT
  TO authenticated
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.community_members
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  );