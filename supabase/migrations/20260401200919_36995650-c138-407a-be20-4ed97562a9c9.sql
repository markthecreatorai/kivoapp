
-- Drop old restrictive policies for update and delete
DROP POLICY IF EXISTS posts_update_own ON public.community_posts;
DROP POLICY IF EXISTS posts_delete_own ON public.community_posts;

-- Allow post author OR community owner/admin to update posts
CREATE POLICY posts_update_own ON public.community_posts
FOR UPDATE TO authenticated
USING (
  author_id IN (SELECT get_community_member_ids_for_user(auth.uid()))
  OR EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_posts.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.status = 'ACTIVE'
  )
);

-- Allow post author OR community owner/admin to delete posts
CREATE POLICY posts_delete_own ON public.community_posts
FOR DELETE TO authenticated
USING (
  author_id IN (SELECT get_community_member_ids_for_user(auth.uid()))
  OR EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_posts.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.status = 'ACTIVE'
  )
);
