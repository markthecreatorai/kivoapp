
-- Quiz table
CREATE TABLE public.course_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.circle_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Avaliação',
  description TEXT,
  passing_score INTEGER NOT NULL DEFAULT 70,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  is_required_for_certificate BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  time_limit_minutes INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.course_quizzes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_course_quizzes_course ON public.course_quizzes(course_id);

-- Questions table
CREATE TABLE public.course_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.course_quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.course_quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_quiz_questions_quiz ON public.course_quiz_questions(quiz_id);

-- Attempts table
CREATE TABLE public.course_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.course_quizzes(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.course_quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_quiz_attempts_quiz ON public.course_quiz_attempts(quiz_id);
CREATE INDEX idx_quiz_attempts_member ON public.course_quiz_attempts(member_id);

-- Answers table
CREATE TABLE public.course_quiz_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.course_quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.course_quiz_questions(id) ON DELETE CASCADE,
  selected_option INTEGER NOT NULL DEFAULT 0,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  points_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.course_quiz_answers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_quiz_answers_attempt ON public.course_quiz_answers(attempt_id);

-- RLS: course_quizzes
CREATE POLICY "Members can view published quizzes"
  ON public.course_quizzes FOR SELECT
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM circle_courses cc
      JOIN community_members cm ON cm.community_id = cc.community_id
      WHERE cc.id = course_quizzes.course_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );

CREATE POLICY "Admins can manage quizzes"
  ON public.course_quizzes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM circle_courses cc
      JOIN community_members cm ON cm.community_id = cc.community_id
      WHERE cc.id = course_quizzes.course_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
        AND cm.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM circle_courses cc
      JOIN community_members cm ON cm.community_id = cc.community_id
      WHERE cc.id = course_quizzes.course_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
        AND cm.status = 'ACTIVE'
    )
  );

-- RLS: course_quiz_questions
CREATE POLICY "Members can view questions of published quizzes"
  ON public.course_quiz_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM course_quizzes cq
      JOIN circle_courses cc ON cc.id = cq.course_id
      JOIN community_members cm ON cm.community_id = cc.community_id
      WHERE cq.id = course_quiz_questions.quiz_id
        AND cq.is_published = true
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );

CREATE POLICY "Admins can manage questions"
  ON public.course_quiz_questions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM course_quizzes cq
      JOIN circle_courses cc ON cc.id = cq.course_id
      JOIN community_members cm ON cm.community_id = cc.community_id
      WHERE cq.id = course_quiz_questions.quiz_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
        AND cm.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM course_quizzes cq
      JOIN circle_courses cc ON cc.id = cq.course_id
      JOIN community_members cm ON cm.community_id = cc.community_id
      WHERE cq.id = course_quiz_questions.quiz_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
        AND cm.status = 'ACTIVE'
    )
  );

-- RLS: course_quiz_attempts (members see own only)
CREATE POLICY "Members can view own attempts"
  ON public.course_quiz_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.id = course_quiz_attempts.member_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create attempts"
  ON public.course_quiz_attempts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.id = course_quiz_attempts.member_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );

CREATE POLICY "Members can update own attempts"
  ON public.course_quiz_attempts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.id = course_quiz_attempts.member_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all attempts"
  ON public.course_quiz_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM course_quizzes cq
      JOIN circle_courses cc ON cc.id = cq.course_id
      JOIN community_members cm ON cm.community_id = cc.community_id
      WHERE cq.id = course_quiz_attempts.quiz_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
        AND cm.status = 'ACTIVE'
    )
  );

-- RLS: course_quiz_answers
CREATE POLICY "Members can view own answers"
  ON public.course_quiz_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM course_quiz_attempts cqa
      JOIN community_members cm ON cm.id = cqa.member_id
      WHERE cqa.id = course_quiz_answers.attempt_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert answers"
  ON public.course_quiz_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM course_quiz_attempts cqa
      JOIN community_members cm ON cm.id = cqa.member_id
      WHERE cqa.id = course_quiz_answers.attempt_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );

-- Updated_at triggers
CREATE TRIGGER update_course_quizzes_updated_at
  BEFORE UPDATE ON public.course_quizzes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_course_quiz_questions_updated_at
  BEFORE UPDATE ON public.course_quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
