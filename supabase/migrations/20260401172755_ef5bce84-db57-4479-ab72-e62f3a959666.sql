
CREATE TABLE public.user_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'asaas',
  provider_method_id text NOT NULL,
  method_type text NOT NULL DEFAULT 'card',
  brand text,
  last_four text,
  exp_month smallint,
  exp_year smallint,
  label text,
  is_default boolean NOT NULL DEFAULT false,
  linked_subscription_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_method_id)
);

ALTER TABLE public.user_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment methods" ON public.user_payment_methods FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own payment methods" ON public.user_payment_methods FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own payment methods" ON public.user_payment_methods FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own payment methods" ON public.user_payment_methods FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_payment_methods_updated_at
  BEFORE UPDATE ON public.user_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
