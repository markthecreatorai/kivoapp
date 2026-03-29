
ALTER TABLE public.circle_courses
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS access_rule text NOT NULL DEFAULT 'free';

COMMENT ON COLUMN public.circle_courses.price_cents IS 'Preço em centavos (0 = gratuito)';
COMMENT ON COLUMN public.circle_courses.billing_period IS 'one_time | monthly | yearly';
COMMENT ON COLUMN public.circle_courses.access_rule IS 'free | paid | members_only';
