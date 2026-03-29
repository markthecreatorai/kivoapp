-- Fix community_members INSERT policy to allow authenticated users to join as MEMBER only
DROP POLICY IF EXISTS "members_insert" ON public.community_members;
CREATE POLICY "members_insert" ON public.community_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND role = 'MEMBER');

-- Allow anyone (including anon during signup) to read active communities for join page
DROP POLICY IF EXISTS "communities_public_read" ON public.communities;
CREATE POLICY "communities_public_read" ON public.communities
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Allow authenticated users to read active invite links for validation
DROP POLICY IF EXISTS "invite_links_read" ON public.community_invite_links;
CREATE POLICY "invite_links_read" ON public.community_invite_links
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Allow authenticated users to update invite link uses_count
DROP POLICY IF EXISTS "invite_links_update_uses" ON public.community_invite_links;
CREATE POLICY "invite_links_update_uses" ON public.community_invite_links
  FOR UPDATE TO authenticated
  USING (is_active = true)
  WITH CHECK (is_active = true);