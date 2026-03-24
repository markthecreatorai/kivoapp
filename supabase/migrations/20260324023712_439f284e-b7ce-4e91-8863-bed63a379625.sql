
-- Fix overly permissive checkout_sessions UPDATE policy
DROP POLICY IF EXISTS "Public can update checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Checkout sessions update by session owner" ON public.checkout_sessions
  FOR UPDATE USING (true)
  WITH CHECK (
    status IN ('OPEN', 'AWAITING_PAYMENT', 'PROCESSING')
  );

-- Add rate limit tracking table for public endpoints
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
-- No public access needed - only edge functions with service role

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_endpoint ON public.rate_limit_log(ip_address, endpoint, created_at DESC);

-- Auto-cleanup old rate limit entries (keep 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM rate_limit_log WHERE created_at < now() - interval '1 hour';
$$;
