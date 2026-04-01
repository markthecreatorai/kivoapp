
-- ============================================================
-- community_tiers
-- ============================================================
CREATE TABLE public.community_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_free boolean NOT NULL DEFAULT false,
  price_cents integer NOT NULL DEFAULT 0,
  billing_period text,
  linked_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_tiers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_community_tiers_community ON public.community_tiers(community_id);

-- Validation trigger
CREATE OR REPLACE FUNCTION public.fn_validate_community_tier()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.price_cents < 0 THEN
    RAISE EXCEPTION 'price_cents must be >= 0';
  END IF;
  IF NEW.is_free AND NEW.price_cents != 0 THEN
    RAISE EXCEPTION 'Free tier must have price_cents = 0';
  END IF;
  IF NOT NEW.is_free AND NEW.price_cents > 0 AND NEW.billing_period IS NULL THEN
    RAISE EXCEPTION 'Paid tier requires billing_period';
  END IF;
  IF NEW.billing_period IS NOT NULL AND NEW.billing_period NOT IN ('monthly', 'yearly', 'one_time') THEN
    RAISE EXCEPTION 'billing_period must be monthly, yearly, or one_time';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_community_tier
BEFORE INSERT OR UPDATE ON public.community_tiers
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_community_tier();

-- Updated_at trigger
CREATE TRIGGER update_community_tiers_updated_at
BEFORE UPDATE ON public.community_tiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: anyone authenticated can read active tiers of communities they belong to
CREATE POLICY "Members can view community tiers"
ON public.community_tiers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_tiers.community_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
  )
);

-- Public read for listed communities (discovery)
CREATE POLICY "Public can view tiers of listed communities"
ON public.community_tiers FOR SELECT TO anon
USING (
  is_active AND EXISTS (
    SELECT 1 FROM communities c
    WHERE c.id = community_tiers.community_id AND c.is_listed = true
  )
);

-- OWNER/ADMIN can manage
CREATE POLICY "Admins can manage community tiers"
ON public.community_tiers FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_tiers.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.status = 'ACTIVE'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_tiers.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.status = 'ACTIVE'
  )
);

-- ============================================================
-- community_tier_benefits
-- ============================================================
CREATE TABLE public.community_tier_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES public.community_tiers(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_tier_benefits ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_tier_benefits_tier ON public.community_tier_benefits(tier_id);

-- Read: same as tier access
CREATE POLICY "Members can view tier benefits"
ON public.community_tier_benefits FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_tiers ct
    JOIN community_members cm ON cm.community_id = ct.community_id
    WHERE ct.id = community_tier_benefits.tier_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
  )
);

CREATE POLICY "Public can view benefits of listed tiers"
ON public.community_tier_benefits FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM community_tiers ct
    JOIN communities c ON c.id = ct.community_id
    WHERE ct.id = community_tier_benefits.tier_id
      AND ct.is_active = true AND c.is_listed = true
  )
);

CREATE POLICY "Admins can manage tier benefits"
ON public.community_tier_benefits FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_tiers ct
    JOIN community_members cm ON cm.community_id = ct.community_id
    WHERE ct.id = community_tier_benefits.tier_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.status = 'ACTIVE'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM community_tiers ct
    JOIN community_members cm ON cm.community_id = ct.community_id
    WHERE ct.id = community_tier_benefits.tier_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.status = 'ACTIVE'
  )
);

-- ============================================================
-- community_member_tiers (entitlements)
-- ============================================================
CREATE TABLE public.community_member_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES public.community_tiers(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'ADMIN',
  source_id uuid,
  status text NOT NULL DEFAULT 'ACTIVE',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_member_tiers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_member_tiers_member ON public.community_member_tiers(member_id);
CREATE INDEX idx_member_tiers_community ON public.community_member_tiers(community_id);
CREATE INDEX idx_member_tiers_tier ON public.community_member_tiers(tier_id);

-- Only one active entitlement per member+community
CREATE UNIQUE INDEX uq_member_tier_active
ON public.community_member_tiers(member_id, community_id)
WHERE status = 'ACTIVE';

-- Validation
CREATE OR REPLACE FUNCTION public.fn_validate_member_tier()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.source_type NOT IN ('SUBSCRIPTION', 'PRODUCT', 'ADMIN') THEN
    RAISE EXCEPTION 'source_type must be SUBSCRIPTION, PRODUCT, or ADMIN';
  END IF;
  IF NEW.status NOT IN ('ACTIVE', 'INACTIVE', 'EXPIRED') THEN
    RAISE EXCEPTION 'status must be ACTIVE, INACTIVE, or EXPIRED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_member_tier
BEFORE INSERT OR UPDATE ON public.community_member_tiers
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_member_tier();

CREATE TRIGGER update_member_tiers_updated_at
BEFORE UPDATE ON public.community_member_tiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Members can see their own entitlement
CREATE POLICY "Members can view own tier"
ON public.community_member_tiers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.id = community_member_tiers.member_id
      AND cm.user_id = auth.uid()
  )
);

-- Admins can view all + manage
CREATE POLICY "Admins can view all member tiers"
ON public.community_member_tiers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_member_tiers.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.status = 'ACTIVE'
  )
);

CREATE POLICY "Admins can manage member tiers"
ON public.community_member_tiers FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_member_tiers.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.status = 'ACTIVE'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_member_tiers.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.status = 'ACTIVE'
  )
);
