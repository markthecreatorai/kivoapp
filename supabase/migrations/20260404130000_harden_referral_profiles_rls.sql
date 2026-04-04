-- Harden referral_profiles RLS to guarantee self-service create/update works
-- Fixes: "new row violates row-level security policy for table referral_profiles"

ALTER TABLE public.referral_profiles ENABLE ROW LEVEL SECURITY;

-- Recreate policies in an idempotent way
DROP POLICY IF EXISTS "Users can view own referral profile" ON public.referral_profiles;
DROP POLICY IF EXISTS "Public active referral codes" ON public.referral_profiles;
DROP POLICY IF EXISTS "Users can insert own referral profile" ON public.referral_profiles;
DROP POLICY IF EXISTS "Users can update own referral profile" ON public.referral_profiles;

CREATE POLICY "Users can view own referral profile"
ON public.referral_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Public active referral codes"
ON public.referral_profiles
FOR SELECT
TO anon, authenticated
USING (status = 'active');

CREATE POLICY "Users can insert own referral profile"
ON public.referral_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own referral profile"
ON public.referral_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Ensure standard table privileges for client roles
GRANT SELECT, INSERT, UPDATE ON TABLE public.referral_profiles TO authenticated;
GRANT SELECT ON TABLE public.referral_profiles TO anon;
