
ALTER TABLE public.upsell_offers
ADD COLUMN IF NOT EXISTS cta_text TEXT DEFAULT 'SIM! Eu quero';
