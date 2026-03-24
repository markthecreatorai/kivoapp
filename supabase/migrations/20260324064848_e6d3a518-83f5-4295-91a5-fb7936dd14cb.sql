-- Fix all RLS policies that reference auth.users directly
-- Replace with auth.jwt() ->> 'email' which doesn't require SELECT on auth.users

-- 1. customers
DROP POLICY IF EXISTS "Users can view own customer record" ON public.customers;
CREATE POLICY "Users can view own customer record"
  ON public.customers FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email')::text);

-- 2. entitlements
DROP POLICY IF EXISTS "Users can view own entitlements" ON public.entitlements;
CREATE POLICY "Users can view own entitlements"
  ON public.entitlements FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT c.id FROM customers c
    WHERE c.email = (auth.jwt() ->> 'email')::text
  ));

-- 3. subscriptions SELECT
DROP POLICY IF EXISTS "Customers can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Customers can view own subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT c.id FROM customers c
    WHERE c.email = (auth.jwt() ->> 'email')::text
  ));

-- 4. subscriptions UPDATE
DROP POLICY IF EXISTS "Customers can cancel own subscriptions" ON public.subscriptions;
CREATE POLICY "Customers can cancel own subscriptions"
  ON public.subscriptions FOR UPDATE TO authenticated
  USING (customer_id IN (
    SELECT c.id FROM customers c
    WHERE c.email = (auth.jwt() ->> 'email')::text
  ));

-- 5. invoices
DROP POLICY IF EXISTS "Customers can view own invoices" ON public.invoices;
CREATE POLICY "Customers can view own invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (subscription_id IN (
    SELECT s.id FROM subscriptions s
    WHERE s.customer_id IN (
      SELECT c.id FROM customers c
      WHERE c.email = (auth.jwt() ->> 'email')::text
    )
  ));

-- 6. lesson_progress SELECT
DROP POLICY IF EXISTS "Users can view own lesson progress" ON public.lesson_progress;
CREATE POLICY "Users can view own lesson progress"
  ON public.lesson_progress FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT c.id FROM customers c
    WHERE c.email = (auth.jwt() ->> 'email')::text
  ));

-- 7. lesson_progress INSERT
DROP POLICY IF EXISTS "Users can insert own lesson progress" ON public.lesson_progress;
CREATE POLICY "Users can insert own lesson progress"
  ON public.lesson_progress FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (
    SELECT c.id FROM customers c
    WHERE c.email = (auth.jwt() ->> 'email')::text
  ));

-- 8. lesson_progress UPDATE
DROP POLICY IF EXISTS "Users can update own lesson progress" ON public.lesson_progress;
CREATE POLICY "Users can update own lesson progress"
  ON public.lesson_progress FOR UPDATE TO authenticated
  USING (customer_id IN (
    SELECT c.id FROM customers c
    WHERE c.email = (auth.jwt() ->> 'email')::text
  ));

-- 9. member_content
DROP POLICY IF EXISTS "Buyers can view content of entitled products" ON public.member_content;
CREATE POLICY "Buyers can view content of entitled products"
  ON public.member_content FOR SELECT TO authenticated
  USING (
    (product_id IN (
      SELECT e.product_id FROM entitlements e
      JOIN customers c ON e.customer_id = c.id
      WHERE c.email = (auth.jwt() ->> 'email')::text
        AND e.revoked_at IS NULL
    )) OR (is_free = true)
  );

-- 10. certificates
DROP POLICY IF EXISTS "Students can view own certificates" ON public.certificates;
CREATE POLICY "Students can view own certificates"
  ON public.certificates FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT c.id FROM customers c
    WHERE c.email = (auth.jwt() ->> 'email')::text
  ));

-- 11. appointments
DROP POLICY IF EXISTS "Customers can view own appointments" ON public.appointments;
CREATE POLICY "Customers can view own appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING (
    customer_email = (auth.jwt() ->> 'email')::text
    OR workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- 12. products
DROP POLICY IF EXISTS "Buyers can view entitled products" ON public.products;
CREATE POLICY "Buyers can view entitled products"
  ON public.products FOR SELECT TO authenticated
  USING (id IN (
    SELECT e.product_id FROM entitlements e
    JOIN customers c ON e.customer_id = c.id
    WHERE c.email = (auth.jwt() ->> 'email')::text
      AND e.revoked_at IS NULL
  ));
