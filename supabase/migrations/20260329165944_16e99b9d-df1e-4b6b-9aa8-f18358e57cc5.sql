-- Fix storefront public access policies (allow both anon and authenticated)
DROP POLICY IF EXISTS "Public can view published storefronts" ON public.storefronts;
CREATE POLICY "Public can view published storefronts"
ON public.storefronts FOR SELECT
USING (is_published = true);

DROP POLICY IF EXISTS "Public can view blocks of published storefronts" ON public.storefront_blocks;
CREATE POLICY "Public can view blocks of published storefronts"
ON public.storefront_blocks FOR SELECT
USING (storefront_id IN (SELECT id FROM public.storefronts WHERE is_published = true));

DROP POLICY IF EXISTS "Public can view themes of published storefronts" ON public.storefront_themes;
CREATE POLICY "Public can view themes of published storefronts"
ON public.storefront_themes FOR SELECT
USING (storefront_id IN (SELECT id FROM public.storefronts WHERE is_published = true));

DROP POLICY IF EXISTS "Public can view published products" ON public.products;
CREATE POLICY "Public can view published products"
ON public.products FOR SELECT
USING (status = 'PUBLISHED' AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Public can view active prices" ON public.prices;
CREATE POLICY "Public can view active prices"
ON public.prices FOR SELECT
USING (is_active = true AND product_id IN (SELECT id FROM public.products WHERE status = 'PUBLISHED' AND deleted_at IS NULL));