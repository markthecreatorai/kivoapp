-- Drop and recreate public access policies
DROP POLICY IF EXISTS "Public can view published storefronts" ON public.storefronts;
DROP POLICY IF EXISTS "Public can view blocks of published storefronts" ON public.storefront_blocks;
DROP POLICY IF EXISTS "Public can view themes of published storefronts" ON public.storefront_themes;
DROP POLICY IF EXISTS "Public can view published products" ON public.products;
DROP POLICY IF EXISTS "Public can view active prices" ON public.prices;

CREATE POLICY "Public can view published storefronts"
ON public.storefronts FOR SELECT
USING (is_published = true);

CREATE POLICY "Public can view blocks of published storefronts"
ON public.storefront_blocks FOR SELECT
USING (storefront_id IN (SELECT id FROM public.storefronts WHERE is_published = true));

CREATE POLICY "Public can view themes of published storefronts"
ON public.storefront_themes FOR SELECT
USING (storefront_id IN (SELECT id FROM public.storefronts WHERE is_published = true));

CREATE POLICY "Public can view published products"
ON public.products FOR SELECT
USING (status = 'PUBLISHED' AND deleted_at IS NULL);

CREATE POLICY "Public can view active prices"
ON public.prices FOR SELECT
USING (is_active = true AND product_id IN (
  SELECT id FROM public.products WHERE status = 'PUBLISHED' AND deleted_at IS NULL
));

-- Owner access policy
DROP POLICY IF EXISTS "Owners can view their own storefront" ON public.storefronts;
CREATE POLICY "Owners can view their own storefront"
ON public.storefronts FOR SELECT TO authenticated
USING (workspace_id IN (
  SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
));

-- Auto-publish storefronts with valid slugs
UPDATE public.storefronts
SET is_published = true
WHERE is_published = false AND slug IS NOT NULL AND slug <> '';