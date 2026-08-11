-- PENDENTE DE APLICAÇÃO (não aplicar nesta execução).
-- Aplicar via ferramenta de migration quando autorizado.
--
-- Hardening: unicidade de workspace do produtor sob confirmações concorrentes.
--
-- Problema: ensure_producer_workspace_for fazia SELECT-then-INSERT sem lock e
-- public.workspace_members só tem UNIQUE(user_id, workspace_id), então duas
-- confirmações simultâneas do mesmo usuário podiam criar DUAS workspaces.
--
-- Correção idempotente: adquirir pg_advisory_xact_lock determinístico por
-- p_user_id antes do SELECT/INSERT. O lock é liberado no fim da transação.
-- SECURITY DEFINER, search_path e grants atuais são preservados.

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

  -- Serializa confirmações concorrentes do MESMO usuário (chave determinística).
  PERFORM pg_advisory_xact_lock(hashtext('ensure_producer_workspace_for'), hashtext(p_user_id::text));

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
    INSERT INTO public.workspace_members (user_id, workspace_id, role)
    VALUES (p_user_id, v_ws, 'OWNER')
    ON CONFLICT (user_id, workspace_id) DO NOTHING;
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
