
-- Chargeback cases: full workflow tracking
CREATE TABLE chargeback_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES payments(id),
  gateway_dispute_id text,
  amount bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  reason text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','evidence_pending','submitted','won','lost')),
  sla_deadline_at timestamptz,
  assigned_to uuid,
  resolved_at timestamptz,
  financial_impact bigint DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Chargeback evidences
CREATE TABLE chargeback_evidences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES chargeback_cases(id) ON DELETE CASCADE,
  uploaded_by uuid,
  file_url text NOT NULL,
  file_name text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Chargeback timeline (audit trail)
CREATE TABLE chargeback_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES chargeback_cases(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid,
  note text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reserve entries (rolling reserve per workspace)
CREATE TABLE reserve_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES orders(id),
  split_entry_id uuid,
  amount bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held','released','forfeited')),
  reserve_percent numeric NOT NULL DEFAULT 10,
  release_at timestamptz NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reserve policy per workspace
CREATE TABLE reserve_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  reserve_percent numeric NOT NULL DEFAULT 10
    CHECK (reserve_percent >= 0 AND reserve_percent <= 50),
  release_window_days int NOT NULL DEFAULT 30
    CHECK (release_window_days >= 7 AND release_window_days <= 180),
  auto_adjust_by_risk boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_chargeback_cases_workspace ON chargeback_cases(workspace_id);
CREATE INDEX idx_chargeback_cases_status ON chargeback_cases(status);
CREATE INDEX idx_chargeback_cases_order ON chargeback_cases(order_id);
CREATE INDEX idx_reserve_entries_workspace ON reserve_entries(workspace_id);
CREATE INDEX idx_reserve_entries_status_release ON reserve_entries(status, release_at);

-- RLS
ALTER TABLE chargeback_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE chargeback_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE chargeback_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserve_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserve_policies ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "admin_all_chargeback_cases" ON chargeback_cases
  FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "admin_all_chargeback_evidences" ON chargeback_evidences
  FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "admin_all_chargeback_timeline" ON chargeback_timeline
  FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "admin_all_reserve_entries" ON reserve_entries
  FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "admin_all_reserve_policies" ON reserve_policies
  FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()));

-- Workspace members can read their own data
CREATE POLICY "workspace_read_reserves" ON reserve_entries
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
  ));

CREATE POLICY "workspace_read_reserve_policy" ON reserve_policies
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
  ));

CREATE POLICY "workspace_read_chargebacks" ON chargeback_cases
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
  ));

-- Function: get reserve balance for a workspace
CREATE OR REPLACE FUNCTION public.get_reserve_balance(p_workspace_id uuid)
RETURNS TABLE(total_held bigint, total_released bigint, upcoming_releases bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN status = 'held' THEN amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN status = 'released' THEN amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN status = 'held' AND release_at <= now() + interval '7 days' THEN amount ELSE 0 END), 0)::bigint
  FROM reserve_entries
  WHERE workspace_id = p_workspace_id;
$$;

-- Triggers
CREATE TRIGGER update_chargeback_cases_updated_at BEFORE UPDATE ON chargeback_cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reserve_policies_updated_at BEFORE UPDATE ON reserve_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
