ALTER TABLE public.fee_config ADD COLUMN IF NOT EXISTS reserve_percent numeric DEFAULT 0;
ALTER TABLE public.fee_config ADD COLUMN IF NOT EXISTS reserve_hold_days integer DEFAULT 0;