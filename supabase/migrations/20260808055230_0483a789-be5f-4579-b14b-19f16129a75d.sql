CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.generate_unique_slug(base_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  base_slug text;
  final_slug text;
  counter int := 0;
  reserved text[] := ARRAY[
    'login','signup','dashboard','checkout','member','admin','api','circles',
    'join','c','book','affiliate','order','upsell','pricing','planos','settings',
    'store','products','auth','explore','ops','verify-email','reset-password'
  ];
BEGIN
  base_slug := lower(regexp_replace(regexp_replace(unaccent(coalesce(base_name,'')),
                 '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);

  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'loja-' || substr(gen_random_uuid()::text, 1, 8);
  END IF;

  IF base_slug = ANY(reserved) THEN
    base_slug := base_slug || '-loja';
  END IF;

  final_slug := base_slug;

  WHILE EXISTS (SELECT 1 FROM public.workspaces WHERE slug = final_slug)
        OR final_slug = ANY(reserved) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END
$function$;

CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(p_name text)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ws public.workspaces;
  v_name text;
  v_slug text;
  v_attempt int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  v_name := NULLIF(btrim(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'workspace name is required' USING ERRCODE = '22023';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_slug := public.generate_unique_slug(v_name);
    IF v_attempt > 1 THEN
      v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 6);
    END IF;

    BEGIN
      INSERT INTO public.workspaces (name, slug)
      VALUES (v_name, v_slug)
      RETURNING * INTO v_ws;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  INSERT INTO public.workspace_members (user_id, workspace_id, role)
  VALUES (auth.uid(), v_ws.id, 'OWNER'::public.workspace_role);

  RETURN v_ws;
END
$function$;