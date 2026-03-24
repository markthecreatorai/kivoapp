
-- Circle Plans table
CREATE TABLE public.circle_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Plano Mensal',
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  interval TEXT NOT NULL DEFAULT 'monthly' CHECK (interval IN ('monthly', 'yearly')),
  trial_days INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Circle Subscriptions table
CREATE TABLE public.circle_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.circle_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'expired', 'trialing')),
  started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  next_billing_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  provider_subscription_id TEXT,
  provider TEXT DEFAULT 'pagarme',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_circle_plans_community ON public.circle_plans(community_id);
CREATE INDEX idx_circle_subs_user ON public.circle_subscriptions(user_id);
CREATE INDEX idx_circle_subs_community ON public.circle_subscriptions(community_id);
CREATE INDEX idx_circle_subs_status ON public.circle_subscriptions(status);
CREATE UNIQUE INDEX idx_circle_subs_active_unique ON public.circle_subscriptions(user_id, community_id) WHERE status IN ('active', 'trialing', 'pending', 'past_due');

-- Enable RLS
ALTER TABLE public.circle_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for circle_plans (public read, admin write via workspace check)
CREATE POLICY "Anyone can read active plans"
  ON public.circle_plans FOR SELECT
  USING (is_active = true);

CREATE POLICY "Workspace owners manage plans"
  ON public.circle_plans FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM communities c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = circle_plans.community_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('OWNER', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM communities c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = circle_plans.community_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('OWNER', 'ADMIN')
    )
  );

-- RLS policies for circle_subscriptions
CREATE POLICY "Users see own subscriptions"
  ON public.circle_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins see community subscriptions"
  ON public.circle_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = circle_subscriptions.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER', 'ADMIN')
        AND cm.status = 'ACTIVE'
    )
  );

CREATE POLICY "Users create own subscriptions"
  ON public.circle_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role updates subscriptions"
  ON public.circle_subscriptions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Function to check active circle subscription
CREATE OR REPLACE FUNCTION public.has_active_circle_subscription(_user_id UUID, _community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM circle_subscriptions
    WHERE user_id = _user_id
      AND community_id = _community_id
      AND status IN ('active', 'trialing')
  )
$$;

-- Updated_at triggers
CREATE TRIGGER circle_plans_updated_at
  BEFORE UPDATE ON public.circle_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER circle_subscriptions_updated_at
  BEFORE UPDATE ON public.circle_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
