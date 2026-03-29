
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS about_video_url text,
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly';
