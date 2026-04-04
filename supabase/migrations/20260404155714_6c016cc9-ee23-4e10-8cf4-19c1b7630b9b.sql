
-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Users can view own referral profile" ON public.referral_profiles;
DROP POLICY IF EXISTS "Users can create own referral profile" ON public.referral_profiles;
DROP POLICY IF EXISTS "Users can update own referral profile" ON public.referral_profiles;
DROP POLICY IF EXISTS "Public can view active referral codes" ON public.referral_profiles;

-- Ensure RLS is enabled
ALTER TABLE public.referral_profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view their own profile
CREATE POLICY "Users can view own referral profile"
  ON public.referral_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated users can create their own profile
CREATE POLICY "Users can create own referral profile"
  ON public.referral_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users can update their own profile
CREATE POLICY "Users can update own referral profile"
  ON public.referral_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public/anon can look up active referral codes (needed for referral link validation)
CREATE POLICY "Public can view active referral codes"
  ON public.referral_profiles
  FOR SELECT
  TO anon
  USING (status = 'active');

-- Explicit grants
GRANT SELECT, INSERT, UPDATE ON public.referral_profiles TO authenticated;
GRANT SELECT ON public.referral_profiles TO anon;
