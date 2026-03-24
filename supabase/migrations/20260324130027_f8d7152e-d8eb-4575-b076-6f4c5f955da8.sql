
-- Workspace subscription state tracking
CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'asaas',
  provider_subscription_id TEXT,
  provider_customer_id TEXT,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  last_event_id TEXT,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, provider)
);

ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owners can view their workspace subscription
CREATE POLICY "Workspace members can view subscription"
  ON public.workspace_subscriptions FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- Service role handles inserts/updates via webhook

-- Function to get active subscription plan for a workspace
CREATE OR REPLACE FUNCTION public.get_workspace_plan(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT plan_code FROM workspace_subscriptions
     WHERE workspace_id = p_workspace_id
       AND status IN ('active', 'trialing', 'past_due')
     ORDER BY created_at DESC LIMIT 1),
    'free'
  );
$$;
