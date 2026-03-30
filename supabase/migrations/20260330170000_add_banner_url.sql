-- Add banner_url to storefronts table
ALTER TABLE public.storefronts
ADD COLUMN IF NOT EXISTS banner_url text;
