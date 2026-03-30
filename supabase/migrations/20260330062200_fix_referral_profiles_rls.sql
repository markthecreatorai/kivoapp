-- Fix: Add missing INSERT and UPDATE policies for referral_profiles
-- The original migration only created a SELECT policy, blocking users from creating their own profile.

-- Allow authenticated users to insert their own referral profile
CREATE POLICY "Users can insert own referral profile"
ON public.referral_profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to update their own referral profile
CREATE POLICY "Users can update own referral profile"
ON public.referral_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
