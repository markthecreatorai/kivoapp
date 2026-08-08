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
    -- CREATOR via account_type (novo) ou is_creator (legado)
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

    IF v_is_creator THEN
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