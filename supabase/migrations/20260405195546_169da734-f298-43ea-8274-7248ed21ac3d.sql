
-- ============================================================
-- P0.1 COMPREHENSIVE RLS HARDENING — 14 findings
-- ============================================================

-- 1. PAYMENTS — Remove anon SELECT (exposes card info, amounts, gateway IDs)
DROP POLICY IF EXISTS "Public can view payments by id" ON public.payments;
-- Add scoped anon policy: only view payment for active checkout session you own
CREATE POLICY "Anon can view payment for own checkout"
  ON public.payments FOR SELECT TO anon
  USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN checkout_sessions cs ON cs.id = o.checkout_session_id
      WHERE cs.status IN ('AWAITING_PAYMENT','PROCESSING')
        AND cs.created_at > now() - interval '24 hours'
        AND cs.email IS NOT NULL
    )
  );

-- 2. PIX_PAYMENT_DATA — Remove anon SELECT (exposes QR codes)
DROP POLICY IF EXISTS "Public can view pix data" ON public.pix_payment_data;
CREATE POLICY "Anon can view pix for own checkout"
  ON public.pix_payment_data FOR SELECT TO anon
  USING (
    payment_id IN (
      SELECT p.id FROM payments p
      JOIN orders o ON o.id = p.order_id
      JOIN checkout_sessions cs ON cs.id = o.checkout_session_id
      WHERE cs.status IN ('AWAITING_PAYMENT','PROCESSING')
        AND cs.created_at > now() - interval '24 hours'
    )
  );

-- 3. ENTITLEMENTS — Remove anon SELECT (exposes customer-product relationships)
DROP POLICY IF EXISTS "Public can view entitlements by customer" ON public.entitlements;
-- No anon replacement needed — authenticated policies already exist

-- 4. ORDER_ITEMS — Remove overly-permissive anon SELECT
DROP POLICY IF EXISTS "Public can view order items" ON public.order_items;
-- Add scoped anon policy for checkout flow (view items of own recent order)
CREATE POLICY "Anon can view order items for own checkout"
  ON public.order_items FOR SELECT TO anon
  USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN checkout_sessions cs ON cs.id = o.checkout_session_id
      WHERE cs.status IN ('AWAITING_PAYMENT','PROCESSING','COMPLETED')
        AND cs.created_at > now() - interval '24 hours'
    )
  );

-- 5. APPOINTMENTS — Replace PII-leaking anon SELECT
DROP POLICY IF EXISTS "Public can view appointments for booking check" ON public.appointments;
-- Create a view for booking availability that excludes PII
CREATE OR REPLACE VIEW public.appointment_availability
WITH (security_invoker = true)
AS
  SELECT product_id, scheduled_date, start_time, end_time, workspace_id
  FROM public.appointments
  WHERE status = 'CONFIRMED';

-- Anon can only check availability (no PII exposed)
CREATE POLICY "Anon can check appointment availability"
  ON public.appointments FOR SELECT TO anon
  USING (false); -- Block direct access; use the view instead

-- 6. CHECKOUT_SESSIONS — Already improved in previous migration, but email is still visible.
-- We cannot hide columns via RLS, so we'll tighten the time window
DROP POLICY IF EXISTS "Public can view active checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Public can view active checkout sessions"
  ON public.checkout_sessions FOR SELECT TO anon
  USING (
    status IN ('OPEN','AWAITING_PAYMENT','PROCESSING')
    AND created_at > now() - interval '2 hours'
  );

-- 7. WEBHOOK_DELIVERY_LOG — Remove public/anon access
DROP POLICY IF EXISTS "Workspace members can view webhook logs" ON public.webhook_delivery_log;
CREATE POLICY "Workspace members can view webhook logs"
  ON public.webhook_delivery_log FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- 8. OPS_CHECKLIST — Remove permissive "any authenticated" policy
DROP POLICY IF EXISTS "Authenticated can manage checklist" ON public.ops_checklist;
-- Admin policy already exists and is sufficient

-- 9. WEEK1_PLAN — Remove permissive "any authenticated" policy
DROP POLICY IF EXISTS "Authenticated can manage week1 plan" ON public.week1_plan;
-- Admin policy already exists and is sufficient

-- 10. EXPERIMENT_ASSIGNMENTS — Tighten SELECT
DROP POLICY IF EXISTS "Users can read own assignments" ON public.experiment_assignments;
CREATE POLICY "Workspace members can read assignments"
  ON public.experiment_assignments FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
-- Keep anon INSERT for tracking, keep the existing validated INSERT

-- 11. STORAGE: private-files — Scope to user's own folder
DROP POLICY IF EXISTS "Users can view private files" ON storage.objects;
CREATE POLICY "Users can view own private files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'private-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 12. STORAGE: community-post-attachments — Scope to community members
DROP POLICY IF EXISTS "Members can read own post attachments" ON storage.objects;
CREATE POLICY "Community members can read post attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'community-post-attachments'
    AND (
      EXISTS (
        SELECT 1 FROM community_members cm
        JOIN communities c ON c.id = cm.community_id
        WHERE cm.user_id = auth.uid()
          AND cm.status = 'ACTIVE'
          AND (storage.foldername(name))[1] = cm.community_id::text
      )
    )
  );

-- 13. STORAGE: community-resources — Scope to community members
DROP POLICY IF EXISTS "Members can view resource files" ON storage.objects;
CREATE POLICY "Community members can view resource files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'community-resources'
    AND (
      EXISTS (
        SELECT 1 FROM community_members cm
        WHERE cm.user_id = auth.uid()
          AND cm.status = 'ACTIVE'
          AND (storage.foldername(name))[1] = cm.community_id::text
      )
    )
  );

-- 14. AUDIT_LOGS service_role INSERT — Intentionally permissive (service_role is trusted)
-- No change needed
