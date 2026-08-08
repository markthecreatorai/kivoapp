-- 1) Revoke write privileges from client roles on financial tables
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.order_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.entitlements FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.customers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.coupon_usages FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.coupons FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coupons FROM anon;
REVOKE SELECT ON public.coupons FROM anon;
REVOKE SELECT ON public.coupon_usages FROM anon;
REVOKE SELECT ON public.orders FROM anon;
REVOKE SELECT ON public.order_items FROM anon;
REVOKE SELECT ON public.payments FROM anon;
REVOKE SELECT ON public.entitlements FROM anon;
REVOKE SELECT ON public.customers FROM anon;

GRANT SELECT ON public.orders, public.order_items, public.payments, public.entitlements, public.customers, public.coupon_usages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.orders, public.order_items, public.payments, public.entitlements, public.customers, public.coupons, public.coupon_usages TO service_role;

-- 2) ORDERS: drop legacy/permissive write policies, keep scoped read only
DROP POLICY IF EXISTS "Users can insert orders for their workspaces" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders of their workspaces" ON public.orders;
DROP POLICY IF EXISTS "Users can view orders of their workspaces" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id) OR customer_email = (auth.jwt() ->> 'email'));

-- 3) ORDER_ITEMS
DROP POLICY IF EXISTS "Users can view order items of their workspaces" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated
USING (order_id IN (
  SELECT o.id FROM public.orders o
  WHERE public.is_workspace_member(o.workspace_id)
     OR o.customer_email = (auth.jwt() ->> 'email')
));

-- 4) PAYMENTS
DROP POLICY IF EXISTS "Users can view payments of their workspaces" ON public.payments;
CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated
USING (
  public.is_workspace_member(workspace_id)
  OR order_id IN (SELECT o.id FROM public.orders o WHERE o.customer_email = (auth.jwt() ->> 'email'))
);

-- 5) ENTITLEMENTS
DROP POLICY IF EXISTS "Users can view entitlements of their workspaces" ON public.entitlements;
DROP POLICY IF EXISTS "Users can view own entitlements" ON public.entitlements;
CREATE POLICY "entitlements_select" ON public.entitlements FOR SELECT TO authenticated
USING (
  customer_id IN (SELECT c.id FROM public.customers c WHERE c.email = (auth.jwt() ->> 'email'))
  OR order_id IN (SELECT o.id FROM public.orders o WHERE public.is_workspace_member(o.workspace_id))
);

-- 6) CUSTOMERS: remove anon insert (checkout uses service role edge functions)
DROP POLICY IF EXISTS "Public can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Users can update customers of their workspaces" ON public.customers;
DROP POLICY IF EXISTS "Users can view customers of their workspaces" ON public.customers;
DROP POLICY IF EXISTS "Users can view own customer record" ON public.customers;
CREATE POLICY "customers_select" ON public.customers FOR SELECT TO authenticated
USING (
  public.is_workspace_member(workspace_id)
  OR email = (auth.jwt() ->> 'email')
);

-- 7) COUPONS: no anonymous enumeration of codes
DROP POLICY IF EXISTS "Public can view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Users can manage coupons of their workspaces" ON public.coupons;
CREATE POLICY "coupons_select_workspace" ON public.coupons FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));
CREATE POLICY "coupons_write_workspace" ON public.coupons FOR ALL TO authenticated
USING (public.is_workspace_admin(auth.uid(), workspace_id))
WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

-- 8) COUPON_USAGES
DROP POLICY IF EXISTS "Users can view coupon usages of their workspaces" ON public.coupon_usages;
CREATE POLICY "coupon_usages_select" ON public.coupon_usages FOR SELECT TO authenticated
USING (coupon_id IN (SELECT c.id FROM public.coupons c WHERE public.is_workspace_member(c.workspace_id)));
