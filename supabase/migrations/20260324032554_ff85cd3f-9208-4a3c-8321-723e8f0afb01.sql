
-- Re-create admin check function
CREATE OR REPLACE FUNCTION public.is_admin_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id
      AND email = 'lucaslopescarrijo@gmail.com'
  )
$$;

-- week1_plan
DROP POLICY IF EXISTS "Admin full access week1_plan" ON public.week1_plan;
CREATE POLICY "Admin full access week1_plan" ON public.week1_plan
  FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

-- ops_checklist
DROP POLICY IF EXISTS "Admin full access ops_checklist" ON public.ops_checklist;
CREATE POLICY "Admin full access ops_checklist" ON public.ops_checklist
  FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

-- feature_flags
DROP POLICY IF EXISTS "Authenticated read feature_flags" ON public.feature_flags;
CREATE POLICY "Authenticated read feature_flags" ON public.feature_flags
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin update feature_flags" ON public.feature_flags;
CREATE POLICY "Admin update feature_flags" ON public.feature_flags
  FOR UPDATE TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admin insert feature_flags" ON public.feature_flags;
CREATE POLICY "Admin insert feature_flags" ON public.feature_flags
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admin delete feature_flags" ON public.feature_flags;
CREATE POLICY "Admin delete feature_flags" ON public.feature_flags
  FOR DELETE TO authenticated
  USING (public.is_admin_user(auth.uid()));
