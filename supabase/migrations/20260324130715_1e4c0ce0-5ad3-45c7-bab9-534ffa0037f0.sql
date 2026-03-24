
-- Add next_plan fields to workspace_subscriptions for upgrade/downgrade lifecycle
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS next_plan_code text,
  ADD COLUMN IF NOT EXISTS change_effective_at timestamptz;
