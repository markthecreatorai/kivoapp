CREATE TABLE public.subscription_charge_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  is_retry boolean NOT NULL DEFAULT false,
  amount numeric NOT NULL DEFAULT 0,
  provider text NOT NULL DEFAULT 'asaas',
  gateway_payment_id text,
  gateway_status text,
  status text NOT NULL DEFAULT 'FAILED',
  error_message text,
  next_retry_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_charge_attempts TO authenticated;
GRANT ALL ON public.subscription_charge_attempts TO service_role;

ALTER TABLE public.subscription_charge_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace admins can view charge attempts"
ON public.subscription_charge_attempts
FOR SELECT
TO authenticated
USING (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE INDEX idx_sca_subscription ON public.subscription_charge_attempts(subscription_id, created_at DESC);
CREATE INDEX idx_sca_workspace ON public.subscription_charge_attempts(workspace_id, created_at DESC);

CREATE TRIGGER update_subscription_charge_attempts_updated_at
BEFORE UPDATE ON public.subscription_charge_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();