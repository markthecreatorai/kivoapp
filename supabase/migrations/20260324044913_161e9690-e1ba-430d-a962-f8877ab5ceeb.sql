
-- Add provider tracking columns to circle_subscriptions
ALTER TABLE public.circle_subscriptions 
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS dunning_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dunning_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'credit_card';

-- Add provider_plan_id to circle_plans for Pagar.me plan sync
ALTER TABLE public.circle_plans
  ADD COLUMN IF NOT EXISTS provider_plan_id TEXT;
