
-- Add card metadata to payments
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS card_brand text;

-- Add order_id and retry fields to webhook_events
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id),
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_before text,
  ADD COLUMN IF NOT EXISTS status_after text;

-- Index for retry processing
CREATE INDEX IF NOT EXISTS idx_webhook_events_retry 
  ON public.webhook_events (status, next_retry_at) 
  WHERE status IN ('FAILED', 'RETRY');

-- Index for order_id lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_order_id 
  ON public.webhook_events (order_id) WHERE order_id IS NOT NULL;
