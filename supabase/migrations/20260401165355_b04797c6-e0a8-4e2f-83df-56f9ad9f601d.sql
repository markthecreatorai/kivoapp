-- Add profile fields to community_members for Skool-like profile
ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS hide_from_search boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS membership_visibility jsonb DEFAULT '{}'::jsonb;