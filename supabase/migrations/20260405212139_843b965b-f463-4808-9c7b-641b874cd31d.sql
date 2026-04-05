
-- Utility functions
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id AND wm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_community_workspace_admin(_community_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.communities c
    JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = _community_id AND wm.user_id = auth.uid() AND wm.role IN ('OWNER', 'ADMIN')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_community_member(_community_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = _community_id AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
  );
$$;

-- RLS enabled
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "products_all_true" ON public.products;
DROP POLICY IF EXISTS "Workspace members can view products" ON public.products;
DROP POLICY IF EXISTS "Workspace admins can create products" ON public.products;
DROP POLICY IF EXISTS "Workspace admins can update products" ON public.products;
DROP POLICY IF EXISTS "Workspace admins can delete products" ON public.products;
DROP POLICY IF EXISTS "products_select_member" ON public.products;
DROP POLICY IF EXISTS "products_insert_admin" ON public.products;
DROP POLICY IF EXISTS "products_update_admin" ON public.products;
DROP POLICY IF EXISTS "products_delete_admin" ON public.products;
DROP POLICY IF EXISTS "Public can view published products" ON public.products;
DROP POLICY IF EXISTS "products_select" ON public.products;

DROP POLICY IF EXISTS "orders_all_true" ON public.orders;
DROP POLICY IF EXISTS "Workspace members can view orders" ON public.orders;
DROP POLICY IF EXISTS "Workspace admins can create orders" ON public.orders;
DROP POLICY IF EXISTS "Workspace admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select_member_or_buyer" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_system_or_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;

DROP POLICY IF EXISTS "posts_all_true" ON public.community_posts;
DROP POLICY IF EXISTS "Community members can view posts" ON public.community_posts;
DROP POLICY IF EXISTS "Community members can create posts" ON public.community_posts;
DROP POLICY IF EXISTS "Authors and admins can update posts" ON public.community_posts;
DROP POLICY IF EXISTS "Authors and admins can delete posts" ON public.community_posts;
DROP POLICY IF EXISTS "community_posts_select" ON public.community_posts;
DROP POLICY IF EXISTS "community_posts_insert" ON public.community_posts;
DROP POLICY IF EXISTS "community_posts_update" ON public.community_posts;
DROP POLICY IF EXISTS "community_posts_delete" ON public.community_posts;

DROP POLICY IF EXISTS "subscriptions_all_true" ON public.circle_subscriptions;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.circle_subscriptions;
DROP POLICY IF EXISTS "Admins can view community subscriptions" ON public.circle_subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.circle_subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.circle_subscriptions;
DROP POLICY IF EXISTS "circle_subs_select" ON public.circle_subscriptions;
DROP POLICY IF EXISTS "circle_subs_insert" ON public.circle_subscriptions;
DROP POLICY IF EXISTS "circle_subs_update" ON public.circle_subscriptions;

-- PRODUCTS policies
CREATE POLICY "products_select"
  ON public.products FOR SELECT
  USING (
    public.is_workspace_member(workspace_id)
    OR (status = 'PUBLISHED' AND is_storefront_visible = true)
  );

CREATE POLICY "products_insert_admin"
  ON public.products FOR INSERT
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "products_update_admin"
  ON public.products FOR UPDATE
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "products_delete_admin"
  ON public.products FOR DELETE
  USING (public.is_workspace_admin(auth.uid(), workspace_id));

-- ORDERS policies
CREATE POLICY "orders_select"
  ON public.orders FOR SELECT
  USING (
    public.is_workspace_member(workspace_id)
    OR customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "orders_insert"
  ON public.orders FOR INSERT
  WITH CHECK (
    public.is_workspace_admin(auth.uid(), workspace_id)
    OR customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "orders_update_admin"
  ON public.orders FOR UPDATE
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

-- COMMUNITY_POSTS policies
CREATE POLICY "community_posts_select"
  ON public.community_posts FOR SELECT
  USING (
    public.is_community_member(community_id)
    OR public.is_community_workspace_admin(community_id)
  );

CREATE POLICY "community_posts_insert"
  ON public.community_posts FOR INSERT
  WITH CHECK (public.is_community_member(community_id));

CREATE POLICY "community_posts_update"
  ON public.community_posts FOR UPDATE
  USING (
    (author_id IN (SELECT id FROM public.community_members WHERE user_id = auth.uid()))
    OR public.is_community_workspace_admin(community_id)
  )
  WITH CHECK (
    (author_id IN (SELECT id FROM public.community_members WHERE user_id = auth.uid()))
    OR public.is_community_workspace_admin(community_id)
  );

CREATE POLICY "community_posts_delete"
  ON public.community_posts FOR DELETE
  USING (
    (author_id IN (SELECT id FROM public.community_members WHERE user_id = auth.uid()))
    OR public.is_community_workspace_admin(community_id)
  );

-- CIRCLE_SUBSCRIPTIONS policies
CREATE POLICY "circle_subs_select"
  ON public.circle_subscriptions FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_community_workspace_admin(community_id)
  );

CREATE POLICY "circle_subs_insert"
  ON public.circle_subscriptions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_community_workspace_admin(community_id)
  );

CREATE POLICY "circle_subs_update"
  ON public.circle_subscriptions FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.is_community_workspace_admin(community_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_community_workspace_admin(community_id)
  );
