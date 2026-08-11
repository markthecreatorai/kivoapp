-- Idempotente: privilégios mínimos na tabela de códigos de verificação.
-- Somente service_role (Edge Functions) acessa; anon/authenticated não têm nenhum privilégio.
DO $$
BEGIN
  IF to_regclass('public.auth_verification_codes') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.auth_verification_codes FROM anon, authenticated';
    EXECUTE 'GRANT ALL ON public.auth_verification_codes TO service_role';
    EXECUTE 'ALTER TABLE public.auth_verification_codes ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;