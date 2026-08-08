-- 1) Helper: valida existência do workspace sem exigir SELECT em workspaces
CREATE OR REPLACE FUNCTION public.workspace_accepts_public_writes(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = _workspace_id)
$$;

REVOKE ALL ON FUNCTION public.workspace_accepts_public_writes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_accepts_public_writes(uuid) TO anon, authenticated, service_role;

-- 2) checkout_sessions / checkout_line_items: sem leitura anônima
DROP POLICY IF EXISTS "Public can view checkout sessions" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Public can update checkout sessions" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Anon can view own checkout session" ON public.checkout_sessions;
DROP POLICY IF EXISTS "Public can view checkout line items" ON public.checkout_line_items;
DROP POLICY IF EXISTS "Public can view active checkout line items" ON public.checkout_line_items;

-- 3) payments / pix / entitlements / order_items: nunca legíveis por anon
DROP POLICY IF EXISTS "Public can view payments by id" ON public.payments;
DROP POLICY IF EXISTS "Anon can view payment for own checkout" ON public.payments;
DROP POLICY IF EXISTS "Public can view pix data" ON public.pix_payment_data;
DROP POLICY IF EXISTS "Anon can view pix for own checkout" ON public.pix_payment_data;
DROP POLICY IF EXISTS "Public can view entitlements by customer" ON public.entitlements;
DROP POLICY IF EXISTS "Public can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Anon can view order items for own checkout" ON public.order_items;

-- 4) affiliate_links: só dono do link e dono do workspace
DROP POLICY IF EXISTS "Public can view affiliate links by code" ON public.affiliate_links;
DROP POLICY IF EXISTS "Anyone can view affiliate links" ON public.affiliate_links;

REVOKE SELECT, UPDATE ON public.payments FROM anon;
REVOKE SELECT, UPDATE ON public.pix_payment_data FROM anon;
REVOKE SELECT ON public.order_items FROM anon;
REVOKE SELECT ON public.entitlements FROM anon;
REVOKE SELECT, UPDATE ON public.checkout_sessions FROM anon;
REVOKE SELECT, UPDATE ON public.checkout_line_items FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.affiliate_links FROM anon;

-- 5) Escritas públicas: validar workspace + formato
DROP POLICY IF EXISTS "Public can insert customers" ON public.customers;
CREATE POLICY "Public can insert customers"
ON public.customers FOR INSERT TO anon
WITH CHECK (
  public.workspace_accepts_public_writes(workspace_id)
  AND email IS NOT NULL
  AND length(email) BETWEEN 6 AND 254
  AND email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND (name IS NULL OR length(name) <= 200)
);

DROP POLICY IF EXISTS "Public can submit leads" ON public.leads;
CREATE POLICY "Public can submit leads"
ON public.leads FOR INSERT TO anon
WITH CHECK (
  public.workspace_accepts_public_writes(workspace_id)
  AND email IS NOT NULL
  AND length(email) BETWEEN 6 AND 254
  AND email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND (name IS NULL OR length(name) <= 200)
);

DROP POLICY IF EXISTS "Public can insert analytics events" ON public.analytics_events;
CREATE POLICY "Public can insert analytics events"
ON public.analytics_events FOR INSERT TO anon
WITH CHECK (
  workspace_id IS NOT NULL
  AND public.workspace_accepts_public_writes(workspace_id)
  AND event_type IS NOT NULL
  AND length(event_type) <= 100
);

DROP POLICY IF EXISTS "Public can insert affiliate applications" ON public.affiliates;
CREATE POLICY "Public can insert affiliate applications"
ON public.affiliates FOR INSERT TO anon, authenticated
WITH CHECK (
  public.workspace_accepts_public_writes(workspace_id)
  AND email IS NOT NULL
  AND length(email) BETWEEN 6 AND 254
  AND email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND name IS NOT NULL
  AND length(name) <= 200
  AND status = 'PENDING'
);

DROP POLICY IF EXISTS "Public can insert checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Public can insert checkout sessions"
ON public.checkout_sessions FOR INSERT TO anon
WITH CHECK (
  public.workspace_accepts_public_writes(workspace_id)
  AND status = 'OPEN'
  AND (email IS NULL OR length(email) <= 254)
);

DROP POLICY IF EXISTS "Public can insert checkout line items" ON public.checkout_line_items;
CREATE POLICY "Public can insert checkout line items"
ON public.checkout_line_items FOR INSERT TO anon
WITH CHECK (
  checkout_session_id IN (
    SELECT cs.id FROM public.checkout_sessions cs
    WHERE cs.status IN ('OPEN','AWAITING_PAYMENT')
      AND cs.created_at > now() - interval '24 hours'
  )
  AND product_id IN (SELECT p.id FROM public.products p)
);