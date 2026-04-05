-- Fix orders policies that reference auth.users directly (causes permission denied)
-- Replace with auth.jwt() ->> 'email' which doesn't require table access

DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT
  USING (
    is_workspace_member(workspace_id)
    OR customer_email = (auth.jwt() ->> 'email')::text
  );

DROP POLICY IF EXISTS "orders_insert" ON public.orders;
CREATE POLICY "orders_insert" ON public.orders
  FOR INSERT
  WITH CHECK (
    is_workspace_admin(auth.uid(), workspace_id)
    OR customer_email = (auth.jwt() ->> 'email')::text
  );