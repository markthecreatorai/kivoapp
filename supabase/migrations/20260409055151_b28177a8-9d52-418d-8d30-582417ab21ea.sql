
-- Expand referral_attributions with new columns
ALTER TABLE public.referral_attributions
  ADD COLUMN IF NOT EXISTS referral_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS referral_source TEXT NOT NULL DEFAULT 'affiliate_link',
  ADD COLUMN IF NOT EXISTS first_paid_subscription_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referral_terminated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_id UUID,
  ADD COLUMN IF NOT EXISTS plan_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider_event_id TEXT;

-- Index for fast lookup by referred user + status
CREATE INDEX IF NOT EXISTS idx_referral_attributions_referred_status
  ON public.referral_attributions (referred_user_id, referral_status);

-- Index for idempotency check
CREATE INDEX IF NOT EXISTS idx_referral_attributions_provider_event
  ON public.referral_attributions (payment_provider_event_id)
  WHERE payment_provider_event_id IS NOT NULL;

-- Create referral_audit_log table
CREATE TABLE IF NOT EXISTS public.referral_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID,
  referred_user_id UUID,
  event_type TEXT NOT NULL,
  subscription_id UUID,
  plan_id TEXT,
  payment_provider_event_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.referral_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own audit logs
CREATE POLICY "Users can view own referral audit logs"
  ON public.referral_audit_log
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = referrer_user_id OR auth.uid() = referred_user_id
  );

-- Service role can insert (edge functions / webhooks)
-- No insert policy for authenticated users - only service role inserts

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_referral_audit_log_referrer
  ON public.referral_audit_log (referrer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_audit_log_referred
  ON public.referral_audit_log (referred_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_audit_log_event_type
  ON public.referral_audit_log (event_type);
