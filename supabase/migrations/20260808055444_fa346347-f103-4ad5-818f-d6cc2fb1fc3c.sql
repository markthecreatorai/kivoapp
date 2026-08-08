CREATE OR REPLACE FUNCTION public.reserved_slugs()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY[
    'login','signup','dashboard','checkout','member','admin','api','circles',
    'join','c','book','affiliate','affiliates','order','upsell','pricing','planos',
    'settings','products','store','leads','analytics','clients','coupons','earnings',
    'appointments','email-flows','onboarding','forgot-password','reset-password',
    'verify-email','auth','explore','ops'
  ]
$$;

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
  reserved text[] := public.reserved_slugs();
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

CREATE OR REPLACE FUNCTION public.fn_block_reserved_workspace_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NOT NULL AND lower(btrim(NEW.slug)) = ANY(public.reserved_slugs()) THEN
    NEW.slug := lower(btrim(NEW.slug)) || '-loja';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_block_reserved_workspace_slug ON public.workspaces;
CREATE TRIGGER trg_block_reserved_workspace_slug
BEFORE INSERT OR UPDATE OF slug ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.fn_block_reserved_workspace_slug();