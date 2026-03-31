
CREATE OR REPLACE FUNCTION public.fn_sync_member_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url AND NEW.user_id IS NOT NULL THEN
    UPDATE community_members
    SET avatar_url = NEW.avatar_url
    WHERE user_id = NEW.user_id
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_member_avatar
AFTER UPDATE OF avatar_url ON public.community_members
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_member_avatar();
