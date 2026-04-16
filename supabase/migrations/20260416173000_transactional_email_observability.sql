-- Fase 3: observabilidade mínima para e-mails transacionais (Resend)

CREATE TABLE IF NOT EXISTS public.transactional_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  recipient TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_email_logs_provider_message_id
  ON public.transactional_email_logs(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tx_email_logs_created_at
  ON public.transactional_email_logs(created_at DESC);

ALTER TABLE public.transactional_email_logs ENABLE ROW LEVEL SECURITY;

-- Sem políticas nesta fase: leitura/escrita apenas por service role (edge functions).
