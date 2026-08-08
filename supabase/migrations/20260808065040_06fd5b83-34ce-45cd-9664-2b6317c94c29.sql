-- 1) allow global default rule (workspace_id null)
ALTER TABLE public.split_rules ALTER COLUMN workspace_id DROP NOT NULL;

-- 2) percent sum must be 100
UPDATE public.split_rules
SET creator_percent = 100 - platform_percent - affiliate_percent
WHERE platform_percent + creator_percent + affiliate_percent <> 100;

ALTER TABLE public.split_rules
  ADD CONSTRAINT split_percent_sum_100
  CHECK (platform_percent + creator_percent + affiliate_percent = 100);

-- 3) hold days per payment method
ALTER TABLE public.split_rules ADD COLUMN IF NOT EXISTS hold_days_card integer NOT NULL DEFAULT 30;
ALTER TABLE public.split_rules ADD COLUMN IF NOT EXISTS hold_days_pix integer NOT NULL DEFAULT 2;

-- only one global default
CREATE UNIQUE INDEX IF NOT EXISTS split_rules_one_global_default
  ON public.split_rules ((true))
  WHERE workspace_id IS NULL AND product_id IS NULL AND is_default = true;

-- 4) insert the global default rule
INSERT INTO public.split_rules (workspace_id, product_id, community_id, platform_percent, creator_percent, affiliate_percent, hold_days, hold_days_card, hold_days_pix, is_default)
SELECT NULL, NULL, NULL, 8, 92, 0, 30, 30, 2, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.split_rules
  WHERE workspace_id IS NULL AND product_id IS NULL AND is_default = true
);

-- 5) resolver: product rule > workspace default > global default, with method-aware hold
CREATE OR REPLACE FUNCTION public.get_split_rule(p_workspace_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, platform_percent numeric, creator_percent numeric, affiliate_percent numeric, hold_days integer, hold_days_card integer, hold_days_pix integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sr.id, sr.platform_percent, sr.creator_percent, sr.affiliate_percent,
         CASE
           WHEN lower(coalesce(p_payment_method,'')) IN ('credit_card','card','cartao','cartão') THEN sr.hold_days_card
           WHEN lower(coalesce(p_payment_method,'')) IN ('pix') THEN sr.hold_days_pix
           ELSE sr.hold_days
         END AS hold_days,
         sr.hold_days_card, sr.hold_days_pix
  FROM split_rules sr
  WHERE (sr.workspace_id = p_workspace_id OR sr.workspace_id IS NULL)
    AND (sr.product_id = p_product_id OR (sr.product_id IS NULL AND sr.is_default = true))
  ORDER BY (sr.product_id IS NULL), (sr.workspace_id IS NULL)
  LIMIT 1;
$function$;