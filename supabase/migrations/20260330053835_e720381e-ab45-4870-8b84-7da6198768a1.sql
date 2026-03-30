ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS listing_button_text text,
  ADD COLUMN IF NOT EXISTS thumbnail_style text,
  ADD COLUMN IF NOT EXISTS delivery_mode text,
  ADD COLUMN IF NOT EXISTS delivery_url text,
  ADD COLUMN IF NOT EXISTS confirmation_email_subject text,
  ADD COLUMN IF NOT EXISTS confirmation_email_body text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS is_embeddable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_type text,
  ADD COLUMN IF NOT EXISTS billing_interval text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS cancel_after_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_after_cycles integer;