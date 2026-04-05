
CREATE OR REPLACE FUNCTION public.fn_generate_affiliate_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    LOOP
      v_code := lower(substr(md5(gen_random_uuid()::text), 1, 8));
      SELECT EXISTS (SELECT 1 FROM affiliate_links WHERE code = v_code) INTO v_exists;
      EXIT WHEN NOT v_exists;
    END LOOP;
    NEW.code := v_code;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_affiliate_link_code
BEFORE INSERT ON public.affiliate_links
FOR EACH ROW
EXECUTE FUNCTION public.fn_generate_affiliate_code();

-- Fix any existing links with empty codes
UPDATE affiliate_links SET code = lower(substr(md5(gen_random_uuid()::text), 1, 8)) WHERE code = '';
