
CREATE OR REPLACE FUNCTION public.get_community_public_plans(p_community_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  is_free boolean,
  price_cents integer,
  billing_period text,
  linked_product_id uuid,
  sort_order integer,
  benefits jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ct.id,
    ct.name,
    ct.is_free,
    ct.price_cents,
    ct.billing_period,
    ct.linked_product_id,
    ct.sort_order,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('label', b.label) ORDER BY b.sort_order)
       FROM community_tier_benefits b WHERE b.tier_id = ct.id),
      '[]'::jsonb
    ) AS benefits
  FROM community_tiers ct
  WHERE ct.community_id = p_community_id
    AND ct.is_active = true
    AND (ct.is_free = true OR ct.price_cents > 0)
  ORDER BY ct.sort_order;
$$;
