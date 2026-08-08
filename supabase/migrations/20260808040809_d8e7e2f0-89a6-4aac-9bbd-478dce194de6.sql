DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='account_type' AND n.nspname='public') THEN
    CREATE TYPE public.account_type AS ENUM ('PRODUCER','MEMBER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_account_types (
  user_id uuid PRIMARY KEY,
  account_type public.account_type NOT NULL DEFAULT 'MEMBER',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_account_types TO authenticated;
GRANT ALL ON public.user_account_types TO service_role;

ALTER TABLE public.user_account_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own account type" ON public.user_account_types;
CREATE POLICY "Users read own account type"
ON public.user_account_types FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS set_user_account_types_updated_at ON public.user_account_types;
CREATE TRIGGER set_user_account_types_updated_at
BEFORE UPDATE ON public.user_account_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- handle_new_user: only create workspace for producers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    new_workspace_id UUID;
    user_email TEXT;
    workspace_name TEXT;
    workspace_slug TEXT;
    v_is_creator BOOLEAN;
    v_account public.account_type;
BEGIN
    v_is_creator := COALESCE((NEW.raw_user_meta_data ->> 'is_creator')::boolean, false);
    v_account := CASE WHEN v_is_creator THEN 'PRODUCER'::public.account_type ELSE 'MEMBER'::public.account_type END;

    INSERT INTO public.user_account_types (user_id, account_type)
    VALUES (NEW.id, v_account)
    ON CONFLICT (user_id) DO NOTHING;

    IF v_account = 'PRODUCER'::public.account_type THEN
        SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
        workspace_name := split_part(COALESCE(user_email, 'user'), '@', 1) || '''s Workspace';
        workspace_slug := public.generate_unique_slug(workspace_name);

        INSERT INTO public.workspaces (name, slug)
        VALUES (workspace_name, workspace_slug)
        RETURNING id INTO new_workspace_id;

        INSERT INTO public.workspace_members (user_id, workspace_id, role)
        VALUES (NEW.id, new_workspace_id, 'OWNER');
    END IF;

    RETURN NEW;
END;
$function$;

-- one-time backfill
INSERT INTO public.user_account_types (user_id, account_type)
SELECT u.id,
       CASE WHEN EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.user_id = u.id)
            THEN 'PRODUCER'::public.account_type ELSE 'MEMBER'::public.account_type END
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- upgrade member -> producer on demand
CREATE OR REPLACE FUNCTION public.ensure_producer_workspace()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_ws uuid;
  v_name text;
  v_slug text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT wm.workspace_id INTO v_ws
  FROM public.workspace_members wm
  WHERE wm.user_id = v_user
  ORDER BY wm.created_at NULLS LAST
  LIMIT 1;

  IF v_ws IS NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user;
    v_name := split_part(COALESCE(v_email, 'user'), '@', 1) || '''s Workspace';
    v_slug := public.generate_unique_slug(v_name);

    INSERT INTO public.workspaces (name, slug) VALUES (v_name, v_slug) RETURNING id INTO v_ws;
    INSERT INTO public.workspace_members (user_id, workspace_id, role) VALUES (v_user, v_ws, 'OWNER');
  END IF;

  INSERT INTO public.user_account_types (user_id, account_type)
  VALUES (v_user, 'PRODUCER'::public.account_type)
  ON CONFLICT (user_id) DO UPDATE SET account_type = 'PRODUCER'::public.account_type, updated_at = now();

  RETURN v_ws;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_producer_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_producer_workspace() TO authenticated;