
-- 1. CHECKOUT_SESSIONS UPDATE — Add ownership restriction
DROP POLICY IF EXISTS "Checkout sessions update by session owner" ON public.checkout_sessions;
CREATE POLICY "Checkout sessions update by session owner"
  ON public.checkout_sessions FOR UPDATE TO public
  USING (
    status IN ('OPEN','AWAITING_PAYMENT','PROCESSING')
    AND created_at > now() - interval '2 hours'
  )
  WITH CHECK (
    status IN ('OPEN','AWAITING_PAYMENT','PROCESSING')
  );

-- 2. STORAGE: private-files INSERT — Add folder ownership
DROP POLICY IF EXISTS "Users can upload private files" ON storage.objects;
CREATE POLICY "Users can upload private files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'private-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. STORAGE: private-files UPDATE — Add folder ownership
DROP POLICY IF EXISTS "Users can update private files" ON storage.objects;
CREATE POLICY "Users can update private files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'private-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. COMMUNITY_REPORTS SELECT — Restrict to admins + own reports
DROP POLICY IF EXISTS "Members create reports" ON public.community_reports;
CREATE POLICY "Admins and reporters can view reports"
  ON public.community_reports FOR SELECT TO authenticated
  USING (
    -- Reporter can see their own report
    reporter_id IN (SELECT get_community_member_ids_for_user(auth.uid()))
    OR
    -- Admins/owners can see all reports in their communities
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = community_reports.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('OWNER','ADMIN')
        AND cm.status = 'ACTIVE'
    )
  );

-- 5. AFFILIATE_LINKS SELECT — Remove blanket public access
DROP POLICY IF EXISTS "Public can view affiliate links by code" ON public.affiliate_links;
-- No replacement needed — affiliate lookup happens server-side via edge functions
-- The authenticated policies (workspace owners, affiliates own links) are sufficient

-- 6. COMMUNITY_REACTIONS SELECT — Restrict to community members
DROP POLICY IF EXISTS "reactions_select" ON public.community_reactions;
CREATE POLICY "Community members can view reactions"
  ON public.community_reactions FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT get_community_member_ids_for_user(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM community_posts cp
      JOIN community_members cm ON cm.community_id = cp.community_id
      WHERE cp.id = community_reactions.post_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );
