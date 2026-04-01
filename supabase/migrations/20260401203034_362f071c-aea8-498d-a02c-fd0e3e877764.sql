
CREATE OR REPLACE FUNCTION public.soft_delete_post(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_post record;
  v_is_author boolean;
  v_is_staff boolean;
BEGIN
  SELECT community_id, author_id INTO v_post
  FROM community_posts WHERE id = p_post_id AND deleted_at IS NULL;
  
  IF v_post IS NULL THEN RETURN false; END IF;

  SELECT EXISTS(
    SELECT 1 FROM community_members WHERE id = v_post.author_id AND user_id = v_user_id
  ) INTO v_is_author;

  SELECT EXISTS(
    SELECT 1 FROM community_members 
    WHERE community_id = v_post.community_id AND user_id = v_user_id 
    AND role IN ('OWNER','ADMIN') AND status = 'ACTIVE'
  ) INTO v_is_staff;

  IF NOT v_is_author AND NOT v_is_staff THEN RETURN false; END IF;

  UPDATE community_posts SET deleted_at = now() WHERE id = p_post_id;
  RETURN true;
END;
$$;
