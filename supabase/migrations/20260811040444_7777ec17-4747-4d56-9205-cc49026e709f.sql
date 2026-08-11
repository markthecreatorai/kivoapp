-- 1) Tabela de códigos de verificação (server-only)
CREATE TABLE IF NOT EXISTS public.auth_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  purpose text NOT NULL DEFAULT 'signup_verification',
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  flow_origin text,
  return_target text,
  ip_hash text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.auth_verification_codes FROM PUBLIC;
REVOKE ALL ON public.auth_verification_codes FROM anon;
REVOKE ALL ON public.auth_verification_codes FROM authenticated;
GRANT ALL ON public.auth_verification_codes TO service_role;

ALTER TABLE public.auth_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_avc_email_purpose_active
  ON public.auth_verification_codes (email, purpose, created_at DESC)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_avc_user ON public.auth_verification_codes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avc_created ON public.auth_verification_codes (created_at DESC);

DROP TRIGGER IF EXISTS trg_avc_updated_at ON public.auth_verification_codes;
CREATE TRIGGER trg_avc_updated_at
BEFORE UPDATE ON public.auth_verification_codes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Criação de workspace apenas após confirmação (uso interno / service_role)
CREATE OR REPLACE FUNCTION public.ensure_producer_workspace_for(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_confirmed timestamptz;
  v_ws uuid;
  v_name text;
  v_slug text;
  v_display text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT email, email_confirmed_at,
         NULLIF(btrim(COALESCE(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'name', '')), '')
    INTO v_email, v_confirmed, v_display
  FROM auth.users WHERE id = p_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'email not confirmed';
  END IF;

  SELECT wm.workspace_id INTO v_ws
  FROM public.workspace_members wm
  WHERE wm.user_id = p_user_id
  ORDER BY wm.created_at NULLS LAST
  LIMIT 1;

  IF v_ws IS NULL THEN
    v_name := 'Loja de ' || COALESCE(v_display, split_part(v_email, '@', 1));
    v_slug := public.generate_unique_slug(v_name);
    INSERT INTO public.workspaces (name, slug) VALUES (v_name, v_slug) RETURNING id INTO v_ws;
    INSERT INTO public.workspace_members (user_id, workspace_id, role) VALUES (p_user_id, v_ws, 'OWNER');
  END IF;

  INSERT INTO public.user_account_types (user_id, account_type)
  VALUES (p_user_id, 'PRODUCER'::public.account_type)
  ON CONFLICT (user_id) DO UPDATE SET account_type = 'PRODUCER'::public.account_type, updated_at = now();

  RETURN v_ws;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_producer_workspace_for(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_producer_workspace_for(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_producer_workspace_for(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_producer_workspace_for(uuid) TO service_role;

-- 3) Gatilho: Circles nunca cria workspace; produtor por senha só depois de confirmar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    new_workspace_id UUID;
    user_email TEXT;
    display_name TEXT;
    workspace_name TEXT;
    workspace_slug TEXT;
    v_is_creator BOOLEAN;
    v_account public.account_type;
BEGIN
    v_is_creator := (upper(COALESCE(NEW.raw_user_meta_data ->> 'account_type', '')) = 'CREATOR')
                    OR COALESCE((NEW.raw_user_meta_data ->> 'is_creator')::boolean, false);

    v_account := CASE WHEN v_is_creator THEN 'PRODUCER'::public.account_type ELSE 'MEMBER'::public.account_type END;

    BEGIN
        INSERT INTO public.user_account_types (user_id, account_type)
        VALUES (NEW.id, v_account)
        ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user: falha ao registrar account_type user_id=% sqlstate=% message=%', NEW.id, SQLSTATE, SQLERRM;
    END;

    -- Workspace só para produtor JÁ confirmado (ex.: Google OAuth).
    -- Cadastro por email+senha cria a loja depois, em ensure_producer_workspace_for().
    IF v_is_creator AND NEW.email_confirmed_at IS NOT NULL THEN
        BEGIN
            user_email := NEW.email;
            display_name := NULLIF(btrim(COALESCE(
                NEW.raw_user_meta_data ->> 'full_name',
                NEW.raw_user_meta_data ->> 'display_name',
                NEW.raw_user_meta_data ->> 'name',
                ''
            )), '');

            IF display_name IS NULL THEN
                display_name := split_part(COALESCE(user_email, 'usuario'), '@', 1);
            END IF;

            workspace_name := 'Loja de ' || display_name;
            workspace_slug := public.generate_unique_slug(workspace_name);

            INSERT INTO public.workspaces (name, slug)
            VALUES (workspace_name, workspace_slug)
            RETURNING id INTO new_workspace_id;

            INSERT INTO public.workspace_members (user_id, workspace_id, role)
            VALUES (NEW.id, new_workspace_id, 'OWNER');
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'handle_new_user: falha ao criar workspace user_id=% sqlstate=% message=%', NEW.id, SQLSTATE, SQLERRM;
        END;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: falha inesperada user_id=% sqlstate=% message=%', NEW.id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$function$;

-- 4) Limpeza de códigos vencidos
CREATE OR REPLACE FUNCTION public.cleanup_auth_verification_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.auth_verification_codes
  WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_auth_verification_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_auth_verification_codes() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_auth_verification_codes() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_auth_verification_codes() TO service_role;