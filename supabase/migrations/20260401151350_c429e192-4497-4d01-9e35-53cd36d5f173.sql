
-- ============================================================
-- BACKFILL: Convert legacy community pricing to community_tiers
-- Only creates tiers for communities that DON'T have any active tiers yet
-- ============================================================
INSERT INTO community_tiers (community_id, name, is_free, price_cents, billing_period, linked_product_id, sort_order, is_active)
SELECT
  c.id,
  CASE
    WHEN c.access_type = 'OPEN' THEN 'Standard'
    WHEN c.access_type = 'PAID_SUBSCRIPTION' AND c.billing_period = 'one_time' THEN 'Acesso Vitalício'
    WHEN c.access_type = 'PAID_SUBSCRIPTION' THEN 'Membro'
    WHEN c.access_type = 'FREE_WITH_PRODUCT' THEN 'Premium'
    ELSE 'Standard'
  END,
  CASE WHEN c.access_type = 'OPEN' THEN true ELSE false END,
  COALESCE(c.price_cents, 0),
  CASE
    WHEN c.access_type = 'OPEN' THEN NULL
    WHEN c.billing_period = 'one_time' THEN 'one_time'
    ELSE COALESCE(c.billing_period, 'monthly')
  END,
  c.linked_product_id,
  0,
  true
FROM communities c
WHERE NOT EXISTS (
  SELECT 1 FROM community_tiers ct
  WHERE ct.community_id = c.id AND ct.is_active = true
);

-- For FREE_WITH_PRODUCT communities, also create a free base tier if not exists
INSERT INTO community_tiers (community_id, name, is_free, price_cents, billing_period, sort_order, is_active)
SELECT
  c.id,
  'Gratuito',
  true,
  0,
  NULL,
  0,
  true
FROM communities c
WHERE c.access_type = 'FREE_WITH_PRODUCT'
  AND NOT EXISTS (
    SELECT 1 FROM community_tiers ct
    WHERE ct.community_id = c.id AND ct.is_active = true AND ct.is_free = true
  );

-- Update sort_order for the premium tier to come after free
UPDATE community_tiers SET sort_order = 1
WHERE is_active = true AND is_free = false
  AND community_id IN (
    SELECT community_id FROM community_tiers WHERE is_active = true AND is_free = true
  );

-- ============================================================
-- RPC: get_revenue_by_tier
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_revenue_by_tier(
  p_workspace_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  tier_id uuid,
  tier_name text,
  community_name text,
  total_revenue numeric,
  entitlement_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ct.id AS tier_id,
    ct.name AS tier_name,
    c.name AS community_name,
    COALESCE(SUM(o.total_amount), 0) AS total_revenue,
    COUNT(DISTINCT cmt.id) AS entitlement_count
  FROM community_tiers ct
  JOIN communities c ON c.id = ct.community_id
  LEFT JOIN community_member_tiers cmt ON cmt.tier_id = ct.id AND cmt.status = 'ACTIVE'
  LEFT JOIN orders o ON o.id = cmt.source_id
    AND o.status = 'PAID'
    AND o.created_at >= p_start_date
    AND o.created_at < p_end_date
  WHERE c.workspace_id = p_workspace_id
    AND ct.is_active = true
  GROUP BY ct.id, ct.name, c.name
  ORDER BY total_revenue DESC;
$$;

-- ============================================================
-- RPC: get_top_tiers_revenue
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_top_tiers_revenue(
  p_workspace_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_limit integer DEFAULT 5
)
RETURNS TABLE(
  tier_id uuid,
  tier_name text,
  community_name text,
  total_revenue numeric,
  member_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ct.id,
    ct.name,
    c.name,
    COALESCE(SUM(o.total_amount), 0),
    COUNT(DISTINCT cmt.member_id)
  FROM community_tiers ct
  JOIN communities c ON c.id = ct.community_id
  LEFT JOIN community_member_tiers cmt ON cmt.tier_id = ct.id AND cmt.status = 'ACTIVE'
  LEFT JOIN orders o ON o.id = cmt.source_id AND o.status = 'PAID'
    AND o.created_at >= p_start_date AND o.created_at < p_end_date
  WHERE c.workspace_id = p_workspace_id AND ct.is_active = true
  GROUP BY ct.id, ct.name, c.name
  HAVING COUNT(DISTINCT cmt.member_id) > 0
  ORDER BY COALESCE(SUM(o.total_amount), 0) DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- RPC: get_entitlement_source_breakdown
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_entitlement_source_breakdown(
  p_workspace_id uuid
)
RETURNS TABLE(
  source_type text,
  active_count bigint,
  percentage numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH counts AS (
    SELECT
      cmt.source_type,
      COUNT(*) AS cnt
    FROM community_member_tiers cmt
    JOIN communities c ON c.id = cmt.community_id
    WHERE c.workspace_id = p_workspace_id
      AND cmt.status = 'ACTIVE'
    GROUP BY cmt.source_type
  ),
  total AS (
    SELECT COALESCE(SUM(cnt), 0) AS total_cnt FROM counts
  )
  SELECT
    counts.source_type,
    counts.cnt,
    CASE WHEN total.total_cnt > 0
      THEN ROUND((counts.cnt::numeric / total.total_cnt) * 100, 1)
      ELSE 0
    END
  FROM counts, total
  ORDER BY counts.cnt DESC;
$$;
