ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS checkout_cta text DEFAULT 'COMPRAR',
  ADD COLUMN IF NOT EXISTS checkout_bottom_title text,
  ADD COLUMN IF NOT EXISTS checkout_price_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkout_discount_price_cents integer,
  ADD COLUMN IF NOT EXISTS checkout_price_type text DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS checkout_billing_interval text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS checkout_custom_fields jsonb DEFAULT '[]'::jsonb;