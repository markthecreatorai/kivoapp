ALTER TABLE public.fee_config
  ADD COLUMN IF NOT EXISTS withdrawal_fixed_cents integer NOT NULL DEFAULT 367,
  ADD COLUMN IF NOT EXISTS withdrawal_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_withdrawal_cents integer NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS auto_approve_limit_cents integer NOT NULL DEFAULT 0;

UPDATE public.fee_config
SET withdrawal_fixed_cents = 367,
    withdrawal_percent = 0,
    min_withdrawal_cents = 5000,
    auto_approve_limit_cents = 0
WHERE plan_type IN ('creator', 'creator_pro');