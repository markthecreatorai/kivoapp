
-- 1. Add source tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'store',
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public.communities(id);

CREATE INDEX IF NOT EXISTS idx_orders_source ON public.orders (workspace_id, source_type);

-- 2. Add source_type to split_entries
ALTER TABLE public.split_entries
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'store';

-- 3. Backfill orders: community-linked products
UPDATE orders o
SET source_type = 'community', community_id = c.id
FROM communities c
WHERE c.linked_product_id = o.product_id
  AND c.linked_product_id IS NOT NULL
  AND o.source_type = 'store';

-- Backfill orders: course products
UPDATE orders o
SET source_type = 'course'
FROM products p
WHERE p.id = o.product_id
  AND p.type = 'COURSE'
  AND o.source_type = 'store'
  AND o.community_id IS NULL;

-- Backfill split_entries from orders
UPDATE split_entries se
SET source_type = o.source_type
FROM orders o
WHERE o.id = se.order_id
  AND o.source_type != 'store';

-- 4. RPC: revenue breakdown by source
CREATE OR REPLACE FUNCTION public.get_revenue_by_source(
  p_workspace_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  source_type text,
  total_revenue numeric,
  order_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.source_type,
    COALESCE(SUM(o.total_amount), 0) AS total_revenue,
    COUNT(*) AS order_count
  FROM orders o
  WHERE o.workspace_id = p_workspace_id
    AND o.status = 'PAID'
    AND o.created_at >= p_start_date
    AND o.created_at < p_end_date
  GROUP BY o.source_type
  ORDER BY total_revenue DESC;
$$;

-- 5. RPC: top communities by revenue
CREATE OR REPLACE FUNCTION public.get_top_communities_revenue(
  p_workspace_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_limit int DEFAULT 5
)
RETURNS TABLE(
  community_id uuid,
  community_name text,
  total_revenue numeric,
  order_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.community_id,
    c.name AS community_name,
    COALESCE(SUM(o.total_amount), 0) AS total_revenue,
    COUNT(*) AS order_count
  FROM orders o
  JOIN communities c ON c.id = o.community_id
  WHERE o.workspace_id = p_workspace_id
    AND o.status = 'PAID'
    AND o.community_id IS NOT NULL
    AND o.created_at >= p_start_date
    AND o.created_at < p_end_date
  GROUP BY o.community_id, c.name
  ORDER BY total_revenue DESC
  LIMIT p_limit;
$$;

-- 6. RPC: daily revenue by source for charts
CREATE OR REPLACE FUNCTION public.get_daily_revenue_by_source(
  p_workspace_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  day date,
  source_type text,
  total_revenue numeric,
  order_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.created_at::date AS day,
    o.source_type,
    COALESCE(SUM(o.total_amount), 0) AS total_revenue,
    COUNT(*) AS order_count
  FROM orders o
  WHERE o.workspace_id = p_workspace_id
    AND o.status = 'PAID'
    AND o.created_at >= p_start_date
    AND o.created_at < p_end_date
  GROUP BY o.created_at::date, o.source_type
  ORDER BY day;
$$;
