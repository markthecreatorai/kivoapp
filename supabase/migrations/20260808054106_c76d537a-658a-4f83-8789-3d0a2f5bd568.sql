-- =====================================================================
-- BASELINE MIGRATION: products / storefront / email schema
-- Idempotente: declara objetos já existentes em produção.
-- =====================================================================

-- ─────────── FUNÇÕES AUXILIARES DE COMUNIDADE ───────────
CREATE OR REPLACE FUNCTION public.get_community_ids_for_user(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT community_id FROM community_members WHERE user_id = _user_id AND status = 'ACTIVE' $$;

CREATE OR REPLACE FUNCTION public.get_community_member_ids_for_user(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT id FROM community_members WHERE user_id = _user_id AND status = 'ACTIVE' $$;

CREATE OR REPLACE FUNCTION public.get_community_member_id(_user_id uuid, _community_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id FROM community_members
  WHERE user_id = _user_id AND community_id = _community_id AND status = 'ACTIVE'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_community_member(_community_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = _community_id AND cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_community_member(_user_id uuid, _community_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE user_id = _user_id AND community_id = _community_id AND status = 'ACTIVE'
  )
$$;

-- ─────────── PRODUCTS ───────────
CREATE TABLE IF NOT EXISTS public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  type public.product_type NOT NULL DEFAULT 'DIGITAL'::public.product_type,
  name text NOT NULL,
  slug text NOT NULL,
  status public.product_status DEFAULT 'DRAFT'::public.product_status,
  thumbnail_url text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  short_description text,
  is_storefront_visible boolean DEFAULT true,
  storefront_order integer DEFAULT 0,
  stock_limit integer,
  sales_count integer DEFAULT 0,
  deleted_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  checkout_description text,
  checkout_image text,
  listing_button_text text,
  thumbnail_style text,
  delivery_mode text,
  delivery_url text,
  confirmation_email_subject text,
  confirmation_email_body text,
  source_url text,
  is_embeddable boolean DEFAULT false,
  provider_type text,
  billing_interval text DEFAULT 'monthly'::text,
  cancel_after_enabled boolean DEFAULT false,
  cancel_after_cycles integer,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
  CONSTRAINT products_workspace_id_slug_key UNIQUE (workspace_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_products_workspace_id ON public.products USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products USING btree (workspace_id, slug);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_enforce_plan_product_limit ON public.products;
CREATE TRIGGER trg_enforce_plan_product_limit BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_product_limit();
DROP TRIGGER IF EXISTS trg_enforce_plan_product_limit_restore ON public.products;
CREATE TRIGGER trg_enforce_plan_product_limit_restore BEFORE UPDATE OF deleted_at ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_product_limit_on_restore();

-- Policies (products)
-- Correção: público NÃO deve ver produtos na lixeira (deleted_at IS NOT NULL).
DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products FOR SELECT
  USING (
    public.is_workspace_member(workspace_id)
    OR (status = 'PUBLISHED'::public.product_status AND is_storefront_visible = true AND deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "Users can view products of their workspaces" ON public.products;
CREATE POLICY "Users can view products of their workspaces" ON public.products FOR SELECT
  USING (workspace_id IN (SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "Buyers can view entitled products" ON public.products;
CREATE POLICY "Buyers can view entitled products" ON public.products FOR SELECT TO authenticated
  USING (id IN (
    SELECT e.product_id FROM public.entitlements e
    JOIN public.customers c ON e.customer_id = c.id
    WHERE c.email = (auth.jwt() ->> 'email') AND e.revoked_at IS NULL));
DROP POLICY IF EXISTS "Users can insert products in their workspaces" ON public.products;
CREATE POLICY "Users can insert products in their workspaces" ON public.products FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members
    WHERE workspace_members.user_id = auth.uid()
      AND workspace_members.role = ANY (ARRAY['OWNER'::public.workspace_role,'ADMIN'::public.workspace_role,'MEMBER'::public.workspace_role])));
DROP POLICY IF EXISTS "products_insert_admin" ON public.products;
CREATE POLICY "products_insert_admin" ON public.products FOR INSERT
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));
DROP POLICY IF EXISTS "Users can update products of their workspaces" ON public.products;
CREATE POLICY "Users can update products of their workspaces" ON public.products FOR UPDATE
  USING (workspace_id IN (SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "products_update_admin" ON public.products;
CREATE POLICY "products_update_admin" ON public.products FOR UPDATE
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));
DROP POLICY IF EXISTS "Users can delete products of their workspaces" ON public.products;
CREATE POLICY "Users can delete products of their workspaces" ON public.products FOR DELETE
  USING (workspace_id IN (SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "products_delete_admin" ON public.products;
CREATE POLICY "products_delete_admin" ON public.products FOR DELETE
  USING (public.is_workspace_admin(auth.uid(), workspace_id));

-- ─────────── PRICES ───────────
CREATE TABLE IF NOT EXISTS public.prices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0.00,
  currency text DEFAULT 'BRL'::text,
  type public.price_type DEFAULT 'ONE_TIME'::public.price_type,
  is_default boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text,
  compare_at_amount numeric,
  pix_discount_percent numeric,
  max_installments integer DEFAULT 1,
  is_active boolean DEFAULT true,
  CONSTRAINT prices_pkey PRIMARY KEY (id),
  CONSTRAINT prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_prices_product_id ON public.prices USING btree (product_id);
GRANT SELECT ON public.prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prices TO authenticated;
GRANT ALL ON public.prices TO service_role;
ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_prices_updated_at ON public.prices;
CREATE TRIGGER update_prices_updated_at BEFORE UPDATE ON public.prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Public can view active prices" ON public.prices;
CREATE POLICY "Public can view active prices" ON public.prices FOR SELECT
  USING (is_active = true AND product_id IN (
    SELECT products.id FROM public.products
    WHERE products.status = 'PUBLISHED'::public.product_status AND products.deleted_at IS NULL));
DROP POLICY IF EXISTS "Users can view prices of products in their workspaces" ON public.prices;
CREATE POLICY "Users can view prices of products in their workspaces" ON public.prices FOR SELECT
  USING (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));
DROP POLICY IF EXISTS "Users can insert prices for products in their workspaces" ON public.prices;
CREATE POLICY "Users can insert prices for products in their workspaces" ON public.prices FOR INSERT
  WITH CHECK (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));
DROP POLICY IF EXISTS "Users can update prices of products in their workspaces" ON public.prices;
CREATE POLICY "Users can update prices of products in their workspaces" ON public.prices FOR UPDATE
  USING (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));
DROP POLICY IF EXISTS "Users can delete prices of products in their workspaces" ON public.prices;
CREATE POLICY "Users can delete prices of products in their workspaces" ON public.prices FOR DELETE
  USING (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));

-- ─────────── PRODUCT_MEDIA ───────────
CREATE TABLE IF NOT EXISTS public.product_media (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  url text NOT NULL,
  alt_text text,
  mime_type text,
  position integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  size_bytes integer,
  CONSTRAINT product_media_pkey PRIMARY KEY (id),
  CONSTRAINT product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_media TO authenticated;
GRANT ALL ON public.product_media TO service_role;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view media of products in their workspaces" ON public.product_media;
CREATE POLICY "Users can view media of products in their workspaces" ON public.product_media FOR SELECT
  USING (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));
DROP POLICY IF EXISTS "Users can modify media of products in their workspaces" ON public.product_media;
CREATE POLICY "Users can modify media of products in their workspaces" ON public.product_media FOR ALL
  USING (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members
    WHERE workspace_members.user_id = auth.uid()
      AND workspace_members.role = ANY (ARRAY['OWNER'::public.workspace_role,'ADMIN'::public.workspace_role,'MEMBER'::public.workspace_role]))));

-- ─────────── DIGITAL_ASSETS ───────────
CREATE TABLE IF NOT EXISTS public.digital_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_assets_pkey PRIMARY KEY (id),
  CONSTRAINT digital_assets_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_assets TO authenticated;
GRANT ALL ON public.digital_assets TO service_role;
ALTER TABLE public.digital_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view digital assets of products in their workspaces" ON public.digital_assets;
CREATE POLICY "Users can view digital assets of products in their workspaces" ON public.digital_assets FOR SELECT
  USING (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));
DROP POLICY IF EXISTS "Users can modify digital assets of products in their workspaces" ON public.digital_assets;
CREATE POLICY "Users can modify digital assets of products in their workspaces" ON public.digital_assets FOR ALL
  USING (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members
    WHERE workspace_members.user_id = auth.uid()
      AND workspace_members.role = ANY (ARRAY['OWNER'::public.workspace_role,'ADMIN'::public.workspace_role,'MEMBER'::public.workspace_role]))));

-- ─────────── MEMBER_CONTENT ───────────
CREATE TABLE IF NOT EXISTS public.member_content (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  parent_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  position integer DEFAULT 0,
  media_type text,
  media_url text,
  duration integer,
  text_content text,
  is_free boolean DEFAULT false,
  is_published boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_content_pkey PRIMARY KEY (id),
  CONSTRAINT fk_member_content_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_content_parent FOREIGN KEY (parent_id) REFERENCES public.member_content(id) ON DELETE CASCADE,
  CONSTRAINT member_content_type_check CHECK (type = ANY (ARRAY['MODULE'::text,'LESSON'::text])),
  CONSTRAINT member_content_media_type_check CHECK (media_type = ANY (ARRAY['VIDEO'::text,'TEXT'::text,'PDF'::text,'AUDIO'::text]))
);
CREATE INDEX IF NOT EXISTS idx_member_content_product_id ON public.member_content USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_member_content_parent_id ON public.member_content USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_member_content_position ON public.member_content USING btree (product_id, "position");
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_content TO authenticated;
GRANT ALL ON public.member_content TO service_role;
ALTER TABLE public.member_content ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_member_content_updated_at ON public.member_content;
CREATE TRIGGER update_member_content_updated_at BEFORE UPDATE ON public.member_content
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Users can view content of products in their workspaces" ON public.member_content;
CREATE POLICY "Users can view content of products in their workspaces" ON public.member_content FOR SELECT
  USING (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));
DROP POLICY IF EXISTS "Buyers can view content of entitled products" ON public.member_content;
CREATE POLICY "Buyers can view content of entitled products" ON public.member_content FOR SELECT TO authenticated
  USING ((product_id IN (
    SELECT e.product_id FROM public.entitlements e
    JOIN public.customers c ON e.customer_id = c.id
    WHERE c.email = (auth.jwt() ->> 'email') AND e.revoked_at IS NULL)) OR is_free = true);
DROP POLICY IF EXISTS "Users can insert content for products in their workspaces" ON public.member_content;
CREATE POLICY "Users can insert content for products in their workspaces" ON public.member_content FOR INSERT
  WITH CHECK (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members
    WHERE workspace_members.user_id = auth.uid()
      AND workspace_members.role = ANY (ARRAY['OWNER'::public.workspace_role,'ADMIN'::public.workspace_role,'MEMBER'::public.workspace_role]))));
DROP POLICY IF EXISTS "Users can update content of products in their workspaces" ON public.member_content;
CREATE POLICY "Users can update content of products in their workspaces" ON public.member_content FOR UPDATE
  USING (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));
DROP POLICY IF EXISTS "Users can delete content of products in their workspaces" ON public.member_content;
CREATE POLICY "Users can delete content of products in their workspaces" ON public.member_content FOR DELETE
  USING (product_id IN (SELECT products.id FROM public.products WHERE products.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));

-- ─────────── STOREFRONTS ───────────
CREATE TABLE IF NOT EXISTS public.storefronts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  slug text NOT NULL,
  title text,
  bio text,
  avatar_url text,
  is_published boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  social_links jsonb DEFAULT '{}'::jsonb,
  banner_url text,
  CONSTRAINT storefronts_pkey PRIMARY KEY (id),
  CONSTRAINT storefronts_slug_key UNIQUE (slug),
  CONSTRAINT storefronts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_storefronts_slug ON public.storefronts USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_storefronts_workspace_id ON public.storefronts USING btree (workspace_id);
GRANT SELECT ON public.storefronts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storefronts TO authenticated;
GRANT ALL ON public.storefronts TO service_role;
ALTER TABLE public.storefronts ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_storefronts_updated_at ON public.storefronts;
CREATE TRIGGER update_storefronts_updated_at BEFORE UPDATE ON public.storefronts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_sync_storefront_avatar ON public.storefronts;
CREATE TRIGGER trg_sync_storefront_avatar AFTER UPDATE ON public.storefronts
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_storefront_avatar_to_members();

DROP POLICY IF EXISTS "Public can view published storefronts" ON public.storefronts;
CREATE POLICY "Public can view published storefronts" ON public.storefronts FOR SELECT
  USING (is_published = true);
DROP POLICY IF EXISTS "Owners can view their own storefront" ON public.storefronts;
CREATE POLICY "Owners can view their own storefront" ON public.storefronts FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view storefronts of their workspaces" ON public.storefronts;
CREATE POLICY "Users can view storefronts of their workspaces" ON public.storefronts FOR SELECT
  USING (workspace_id IN (SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update storefronts of workspaces they own/admin" ON public.storefronts;
CREATE POLICY "Users can update storefronts of workspaces they own/admin" ON public.storefronts FOR UPDATE
  USING (workspace_id IN (SELECT workspace_members.workspace_id FROM public.workspace_members
    WHERE workspace_members.user_id = auth.uid()
      AND workspace_members.role = ANY (ARRAY['OWNER'::public.workspace_role,'ADMIN'::public.workspace_role])));

-- ─────────── STOREFRONT_THEMES ───────────
CREATE TABLE IF NOT EXISTS public.storefront_themes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  storefront_id uuid NOT NULL,
  template_key text DEFAULT 'minimal'::text,
  primary_color text DEFAULT '#F9423A'::text,
  background_color text DEFAULT '#ffffff'::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  secondary_color text DEFAULT '#1a1a1a'::text,
  text_color text DEFAULT '#1a1a1a'::text,
  font_heading text DEFAULT 'Inter'::text,
  font_body text DEFAULT 'Inter'::text,
  button_style text DEFAULT 'rounded'::text,
  custom_css text,
  CONSTRAINT storefront_themes_pkey PRIMARY KEY (id),
  CONSTRAINT storefront_themes_storefront_id_fkey FOREIGN KEY (storefront_id) REFERENCES public.storefronts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_storefront_themes_storefront_id ON public.storefront_themes USING btree (storefront_id);
GRANT SELECT ON public.storefront_themes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storefront_themes TO authenticated;
GRANT ALL ON public.storefront_themes TO service_role;
ALTER TABLE public.storefront_themes ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_storefront_themes_updated_at ON public.storefront_themes;
CREATE TRIGGER update_storefront_themes_updated_at BEFORE UPDATE ON public.storefront_themes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Public can view themes of published storefronts" ON public.storefront_themes;
CREATE POLICY "Public can view themes of published storefronts" ON public.storefront_themes FOR SELECT
  USING (storefront_id IN (SELECT storefronts.id FROM public.storefronts WHERE storefronts.is_published = true));
DROP POLICY IF EXISTS "Users can view themes of storefronts in their workspaces" ON public.storefront_themes;
CREATE POLICY "Users can view themes of storefronts in their workspaces" ON public.storefront_themes FOR SELECT
  USING (storefront_id IN (SELECT storefronts.id FROM public.storefronts WHERE storefronts.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));
DROP POLICY IF EXISTS "Users can insert themes for storefronts in their workspaces" ON public.storefront_themes;
CREATE POLICY "Users can insert themes for storefronts in their workspaces" ON public.storefront_themes FOR INSERT
  WITH CHECK (storefront_id IN (SELECT storefronts.id FROM public.storefronts WHERE storefronts.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members
    WHERE workspace_members.user_id = auth.uid()
      AND workspace_members.role = ANY (ARRAY['OWNER'::public.workspace_role,'ADMIN'::public.workspace_role]))));
DROP POLICY IF EXISTS "Users can update themes of storefronts in their workspaces" ON public.storefront_themes;
CREATE POLICY "Users can update themes of storefronts in their workspaces" ON public.storefront_themes FOR UPDATE
  USING (storefront_id IN (SELECT storefronts.id FROM public.storefronts WHERE storefronts.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members
    WHERE workspace_members.user_id = auth.uid()
      AND workspace_members.role = ANY (ARRAY['OWNER'::public.workspace_role,'ADMIN'::public.workspace_role]))));
DROP POLICY IF EXISTS "Users can delete themes of storefronts in their workspaces" ON public.storefront_themes;
CREATE POLICY "Users can delete themes of storefronts in their workspaces" ON public.storefront_themes FOR DELETE
  USING (storefront_id IN (SELECT storefronts.id FROM public.storefronts WHERE storefronts.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members
    WHERE workspace_members.user_id = auth.uid()
      AND workspace_members.role = ANY (ARRAY['OWNER'::public.workspace_role,'ADMIN'::public.workspace_role]))));

-- ─────────── EMAIL_SEGMENTS ───────────
CREATE TABLE IF NOT EXISTS public.email_segments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  filter_rules jsonb DEFAULT '{}'::jsonb,
  member_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_dynamic boolean NOT NULL DEFAULT true,
  CONSTRAINT email_segments_pkey PRIMARY KEY (id),
  CONSTRAINT email_segments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_segments_workspace ON public.email_segments USING btree (workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_segments TO authenticated;
GRANT ALL ON public.email_segments TO service_role;
ALTER TABLE public.email_segments ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_email_segments_updated_at ON public.email_segments;
CREATE TRIGGER update_email_segments_updated_at BEFORE UPDATE ON public.email_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP POLICY IF EXISTS "Users can manage segments of their workspaces" ON public.email_segments;
CREATE POLICY "Users can manage segments of their workspaces" ON public.email_segments FOR ALL
  USING (workspace_id IN (SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid()));

-- ─────────── LEAD_SEGMENT_MEMBERS ───────────
CREATE TABLE IF NOT EXISTS public.lead_segment_members (
  lead_id uuid NOT NULL,
  segment_id uuid NOT NULL,
  added_at timestamptz DEFAULT now(),
  CONSTRAINT lead_segment_members_pkey PRIMARY KEY (lead_id, segment_id),
  CONSTRAINT lead_segment_members_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
  CONSTRAINT lead_segment_members_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.email_segments(id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_segment_members TO authenticated;
GRANT ALL ON public.lead_segment_members TO service_role;
ALTER TABLE public.lead_segment_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage segment members" ON public.lead_segment_members;
CREATE POLICY "Users can manage segment members" ON public.lead_segment_members FOR ALL
  USING (segment_id IN (SELECT email_segments.id FROM public.email_segments WHERE email_segments.workspace_id IN (
    SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid())));

-- ─────────── EMAIL_EVENTS ───────────
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  lead_id uuid,
  email text NOT NULL,
  event_type text NOT NULL,
  message_id text,
  campaign_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT email_events_pkey PRIMARY KEY (id),
  CONSTRAINT email_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
  CONSTRAINT email_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_email_events_workspace ON public.email_events USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_events_lead ON public.email_events USING btree (lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view email events of their workspaces" ON public.email_events;
CREATE POLICY "Users can view email events of their workspaces" ON public.email_events FOR SELECT
  USING (workspace_id IN (SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert email events for their workspaces" ON public.email_events;
CREATE POLICY "Users can insert email events for their workspaces" ON public.email_events FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_members.workspace_id FROM public.workspace_members WHERE workspace_members.user_id = auth.uid()));
