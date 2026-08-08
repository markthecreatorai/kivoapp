-- =========================================================
-- 1. Tabela de auditoria de execuções de cron
-- =========================================================
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name TEXT NOT NULL,
  window_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  request_id BIGINT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cron_runs TO authenticated;
GRANT ALL ON public.cron_runs TO service_role;

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view cron runs" ON public.cron_runs;
CREATE POLICY "Admins can view cron runs"
  ON public.cron_runs FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS cron_runs_job_window_uniq
  ON public.cron_runs (job_name, window_key);
CREATE INDEX IF NOT EXISTS cron_runs_started_at_idx
  ON public.cron_runs (started_at DESC);

DROP TRIGGER IF EXISTS update_cron_runs_updated_at ON public.cron_runs;
CREATE TRIGGER update_cron_runs_updated_at
  BEFORE UPDATE ON public.cron_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2. Leitura do segredo de cron (Vault, fallback GUC)
-- =========================================================
CREATE OR REPLACE FUNCTION public.cron_secret()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v
    FROM vault.decrypted_secrets
    WHERE name = 'KIVO_CRON_SECRET'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
  END;

  IF v IS NULL OR v = '' THEN
    v := nullif(current_setting('app.cron_secret', true), '');
  END IF;

  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cron_secret() FROM PUBLIC;

-- =========================================================
-- 3. Disparo central com idempotência por janela + auditoria
-- =========================================================
CREATE OR REPLACE FUNCTION public.cron_invoke(
  p_job_name TEXT,
  p_function TEXT,
  p_window_unit TEXT DEFAULT 'hour',
  p_body JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_run UUID;
  v_req BIGINT;
  v_window TEXT;
  v_base TEXT := 'https://wfuwenylojhabresnrvi.supabase.co/functions/v1/';
BEGIN
  v_window := to_char(
    date_trunc(coalesce(nullif(p_window_unit, ''), 'hour'), now()),
    'YYYY-MM-DD"T"HH24:MI'
  );

  v_secret := public.cron_secret();

  IF v_secret IS NULL THEN
    INSERT INTO public.cron_runs (job_name, window_key, status, finished_at, error)
    VALUES (p_job_name, v_window || ':nosecret:' || gen_random_uuid()::text,
            'FAILED', now(), 'KIVO_CRON_SECRET ausente no Vault');
    RAISE WARNING 'cron_invoke(%): KIVO_CRON_SECRET ausente no Vault', p_job_name;
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.cron_runs (job_name, window_key, status)
    VALUES (p_job_name, v_window, 'RUNNING')
    RETURNING id INTO v_run;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'cron_invoke(%): já executado na janela %', p_job_name, v_window;
    RETURN NULL;
  END;

  SELECT net.http_post(
    url := v_base || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Kivo-Cron-Secret', v_secret,
      'x-cron-secret', v_secret,
      'X-Kivo-Cron-Run-Id', v_run::text
    ),
    body := coalesce(p_body, '{}'::jsonb) || jsonb_build_object(
      'source', 'cron',
      'cron_run_id', v_run,
      'window_key', v_window
    ),
    timeout_milliseconds := 60000
  ) INTO v_req;

  UPDATE public.cron_runs SET request_id = v_req WHERE id = v_run;
  RETURN v_run;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cron_invoke(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;

-- =========================================================
-- 4. Encerramento da execução (chamado pelas edge functions)
-- =========================================================
CREATE OR REPLACE FUNCTION public.cron_run_finish(
  p_run_id UUID,
  p_status TEXT,
  p_error TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_run_id IS NULL THEN RETURN; END IF;
  UPDATE public.cron_runs
     SET status = upper(coalesce(p_status, 'SUCCESS')),
         finished_at = now(),
         error = p_error,
         metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
   WHERE id = p_run_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cron_run_finish(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_run_finish(UUID, TEXT, TEXT, JSONB) TO service_role;

-- =========================================================
-- 5. Faxina: execuções travadas e histórico antigo
-- =========================================================
CREATE OR REPLACE FUNCTION public.cron_runs_sweep()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.cron_runs
     SET status = 'TIMEOUT',
         finished_at = now(),
         error = coalesce(error, 'Execução sem confirmação após 30 minutos')
   WHERE status = 'RUNNING'
     AND started_at < now() - interval '30 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.cron_runs WHERE started_at < now() - interval '60 days';
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cron_runs_sweep() FROM PUBLIC;

-- =========================================================
-- 6. Idempotência de cobrança de assinatura
-- =========================================================
ALTER TABLE public.subscription_charge_attempts
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_charge_attempts_idem_uniq
  ON public.subscription_charge_attempts (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =========================================================
-- 7. Reagendamento de todos os jobs no novo padrão
-- =========================================================
DO $$
DECLARE j TEXT;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'renew-subscriptions-daily',
    'process-email-sequences-hourly',
    'abandoned-cart-recovery-hourly',
    'send-recovery-emails-hourly',
    'process-streaks-daily',
    'event-reminders-every-15min',
    'process-payouts-daily-secure',
    'reconcile-asaas-daily-secure',
    'release-reserves-daily-secure',
    'subscription-health-daily',
    'cron-runs-sweep'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule('renew-subscriptions-daily', '0 6 * * *',
  $$SELECT public.cron_invoke('renew-subscriptions-daily', 'renew-subscriptions', 'day')$$);

SELECT cron.schedule('process-email-sequences-hourly', '5 * * * *',
  $$SELECT public.cron_invoke('process-email-sequences-hourly', 'process-email-sequences', 'hour')$$);

SELECT cron.schedule('abandoned-cart-recovery-hourly', '15 * * * *',
  $$SELECT public.cron_invoke('abandoned-cart-recovery-hourly', 'abandoned-cart-recovery', 'hour')$$);

SELECT cron.schedule('send-recovery-emails-hourly', '25 * * * *',
  $$SELECT public.cron_invoke('send-recovery-emails-hourly', 'send-recovery-emails', 'hour')$$);

SELECT cron.schedule('process-streaks-daily', '0 3 * * *',
  $$SELECT public.cron_invoke('process-streaks-daily', 'process-streaks', 'day')$$);

SELECT cron.schedule('event-reminders-every-15min', '*/15 * * * *',
  $$SELECT public.cron_invoke('event-reminders-every-15min', 'event-reminders', 'minute')$$);

SELECT cron.schedule('process-payouts-daily-secure', '0 7 * * *',
  $$SELECT public.cron_invoke('process-payouts-daily-secure', 'process-payouts', 'day')$$);

SELECT cron.schedule('reconcile-asaas-daily-secure', '30 6 * * *',
  $$SELECT public.cron_invoke('reconcile-asaas-daily-secure', 'reconcile-asaas', 'day')$$);

SELECT cron.schedule('release-reserves-daily-secure', '0 8 * * *',
  $$SELECT public.cron_invoke('release-reserves-daily-secure', 'release-reserves', 'day')$$);

SELECT cron.schedule('subscription-health-daily', '30 8 * * *',
  $$SELECT public.cron_invoke('subscription-health-daily', 'subscription-health-daily', 'day')$$);

SELECT cron.schedule('cron-runs-sweep', '*/10 * * * *',
  $$SELECT public.cron_runs_sweep()$$);