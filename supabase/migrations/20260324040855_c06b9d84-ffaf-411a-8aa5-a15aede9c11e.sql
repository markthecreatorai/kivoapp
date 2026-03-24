
CREATE TABLE public.ops_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  notified_externally BOOLEAN DEFAULT false,
  external_channel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE(alert_type, alert_key)
);

ALTER TABLE public.ops_alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read ops_alert_log" ON public.ops_alert_log
  FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));
