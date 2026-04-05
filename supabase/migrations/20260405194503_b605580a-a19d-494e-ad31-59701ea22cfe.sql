
-- 1. checkout_sessions UPDATE
DROP POLICY IF EXISTS "Checkout sessions update by session owner" ON public.checkout_sessions;
CREATE POLICY "Checkout sessions update by session owner"
  ON public.checkout_sessions FOR UPDATE TO public
  USING (status IN ('OPEN','AWAITING_PAYMENT','PROCESSING') AND email IS NOT NULL)
  WITH CHECK (status IN ('OPEN','AWAITING_PAYMENT','PROCESSING'));

-- 2. checkout_sessions SELECT (anon)
DROP POLICY IF EXISTS "Public can view checkout sessions" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Public can view active checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Public can view active checkout sessions"
  ON public.checkout_sessions FOR SELECT TO anon
  USING (status IN ('OPEN','AWAITING_PAYMENT','PROCESSING') AND created_at > now() - interval '24 hours');

-- 3. checkout_line_items SELECT (anon)
DROP POLICY IF EXISTS "Public can view checkout line items" ON public.checkout_line_items;
DROP POLICY IF EXISTS "Public can view active checkout line items" ON public.checkout_line_items;
CREATE POLICY "Public can view active checkout line items"
  ON public.checkout_line_items FOR SELECT TO anon
  USING (checkout_session_id IN (
    SELECT id FROM public.checkout_sessions
    WHERE status IN ('OPEN','AWAITING_PAYMENT','PROCESSING') AND created_at > now() - interval '24 hours'
  ));

-- 4. experiment_assignments SELECT
DROP POLICY IF EXISTS "Anyone can read own assignments" ON public.experiment_assignments;
DROP POLICY IF EXISTS "Users can read own assignments" ON public.experiment_assignments;
CREATE POLICY "Users can read own assignments"
  ON public.experiment_assignments FOR SELECT TO public
  USING (session_id IS NOT NULL);

-- 5. analytics_events INSERT (anon)
DROP POLICY IF EXISTS "Public can insert analytics events" ON public.analytics_events;
CREATE POLICY "Public can insert analytics events"
  ON public.analytics_events FOR INSERT TO anon
  WITH CHECK (event_type IS NOT NULL AND workspace_id IS NOT NULL AND workspace_id IN (SELECT id FROM public.workspaces));

-- 6. leads INSERT (anon)
DROP POLICY IF EXISTS "Public can submit leads" ON public.leads;
CREATE POLICY "Public can submit leads"
  ON public.leads FOR INSERT TO anon
  WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces) AND email IS NOT NULL);

-- 7. appointments INSERT (anon)
DROP POLICY IF EXISTS "Public can insert appointments" ON public.appointments;
CREATE POLICY "Public can insert appointments"
  ON public.appointments FOR INSERT TO anon
  WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces) AND product_id IN (SELECT id FROM public.products WHERE status = 'PUBLISHED') AND status = 'PENDING');

-- 8. customers INSERT (anon)
DROP POLICY IF EXISTS "Public can insert customers" ON public.customers;
CREATE POLICY "Public can insert customers"
  ON public.customers FOR INSERT TO anon
  WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces) AND email IS NOT NULL);

-- 9. affiliate_attributions INSERT
DROP POLICY IF EXISTS "Public can insert attributions" ON public.affiliate_attributions;
CREATE POLICY "Public can insert attributions"
  ON public.affiliate_attributions FOR INSERT TO public
  WITH CHECK (affiliate_link_id IN (SELECT id FROM public.affiliate_links));

-- 10. affiliates INSERT
DROP POLICY IF EXISTS "Public can insert affiliate applications" ON public.affiliates;
CREATE POLICY "Public can insert affiliate applications"
  ON public.affiliates FOR INSERT TO public
  WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces) AND email IS NOT NULL AND name IS NOT NULL AND status = 'PENDING');

-- 11. checkout_sessions INSERT (anon)
DROP POLICY IF EXISTS "Public can insert checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Public can insert checkout sessions"
  ON public.checkout_sessions FOR INSERT TO anon
  WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces) AND status = 'OPEN');

-- 12. checkout_line_items INSERT (anon)
DROP POLICY IF EXISTS "Public can insert checkout line items" ON public.checkout_line_items;
CREATE POLICY "Public can insert checkout line items"
  ON public.checkout_line_items FOR INSERT TO anon
  WITH CHECK (
    checkout_session_id IN (SELECT id FROM public.checkout_sessions WHERE status IN ('OPEN','AWAITING_PAYMENT') AND created_at > now() - interval '24 hours')
    AND product_id IN (SELECT id FROM public.products)
  );

-- 13. experiment_assignments INSERT
DROP POLICY IF EXISTS "Anyone can insert assignments" ON public.experiment_assignments;
CREATE POLICY "Anyone can insert assignments"
  ON public.experiment_assignments FOR INSERT TO public
  WITH CHECK (session_id IS NOT NULL AND experiment_key IS NOT NULL AND workspace_id IN (SELECT id FROM public.workspaces));
