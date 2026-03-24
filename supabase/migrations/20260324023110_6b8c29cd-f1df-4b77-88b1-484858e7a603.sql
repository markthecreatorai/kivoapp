
-- Fix: analytics_events.workspace_id must be nullable for unauthenticated tracking
ALTER TABLE public.analytics_events ALTER COLUMN workspace_id DROP NOT NULL;

-- Performance indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created ON public.analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_created ON public.analytics_events(workspace_id, created_at DESC) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_page_path ON public.analytics_events(page_path, created_at DESC);

-- Performance indexes for experiment assignments
CREATE INDEX IF NOT EXISTS idx_exp_assign_key_variant ON public.experiment_assignments(experiment_key, variant);

-- Performance indexes for orders (payment monitoring)
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_workspace_status ON public.orders(workspace_id, status);

-- Index for checkout_sessions abandonment
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status_created ON public.checkout_sessions(status, created_at DESC);

-- Add recovered_checkout column to checkout_sessions
ALTER TABLE public.checkout_sessions ADD COLUMN IF NOT EXISTS recovered_checkout BOOLEAN DEFAULT false;

-- Webhook delivery log for observability
CREATE TABLE IF NOT EXISTS public.webhook_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.webhook_delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view webhook logs" ON public.webhook_delivery_log FOR SELECT USING (true);
CREATE INDEX idx_webhook_log_status ON public.webhook_delivery_log(status, created_at DESC);
CREATE INDEX idx_webhook_log_workspace ON public.webhook_delivery_log(workspace_id, created_at DESC);
