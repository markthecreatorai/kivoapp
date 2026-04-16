-- Fase 3 hardening: observabilidade mínima com payload/tags + idempotência de webhook

ALTER TABLE public.transactional_email_logs
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'transactional',
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payload JSONB,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS last_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tx_email_logs_category
  ON public.transactional_email_logs(category);

CREATE INDEX IF NOT EXISTS idx_tx_email_logs_status
  ON public.transactional_email_logs(status);

CREATE INDEX IF NOT EXISTS idx_tx_email_logs_idempotency_key
  ON public.transactional_email_logs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.transactional_email_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'resend',
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_message_id TEXT,
  payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_email_webhook_events_provider_event
  ON public.transactional_email_webhook_events(provider, event_id);

ALTER TABLE public.transactional_email_webhook_events ENABLE ROW LEVEL SECURITY;
