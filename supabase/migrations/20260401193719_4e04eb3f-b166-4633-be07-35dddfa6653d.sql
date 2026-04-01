
-- 1. Add circle_plan_id column
ALTER TABLE community_tiers ADD COLUMN IF NOT EXISTS circle_plan_id uuid REFERENCES circle_plans(id);

-- 2. Populate circle_plans for existing paid active tiers
INSERT INTO circle_plans (community_id, name, price_cents, currency, interval, trial_days, is_active)
SELECT ct.community_id, ct.name, ct.price_cents, 'BRL',
  CASE WHEN ct.billing_period = 'yearly' THEN 'yearly' ELSE 'monthly' END,
  0, true
FROM community_tiers ct
WHERE ct.is_active = true AND ct.is_free = false AND ct.circle_plan_id IS NULL
AND NOT EXISTS (
  SELECT 1 FROM circle_plans cp
  WHERE cp.community_id = ct.community_id
    AND cp.price_cents = ct.price_cents
    AND cp.is_active = true
);

-- 3. Link existing tiers to their circle_plans
UPDATE community_tiers ct SET circle_plan_id = cp.id
FROM circle_plans cp
WHERE cp.community_id = ct.community_id
  AND cp.price_cents = ct.price_cents
  AND cp.is_active = true
  AND ct.circle_plan_id IS NULL
  AND ct.is_free = false
  AND ct.is_active = true;

-- 4. Trigger function to auto-sync tier → circle_plan
CREATE OR REPLACE FUNCTION public.fn_sync_tier_to_circle_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  -- Only for paid tiers
  IF NEW.is_free = true OR NEW.price_cents = 0 THEN
    NEW.circle_plan_id := NULL;
    RETURN NEW;
  END IF;

  -- If already linked, update the circle_plan
  IF NEW.circle_plan_id IS NOT NULL THEN
    UPDATE circle_plans SET
      name = NEW.name,
      price_cents = NEW.price_cents,
      interval = COALESCE(NEW.billing_period, 'monthly'),
      is_active = NEW.is_active,
      updated_at = now()
    WHERE id = NEW.circle_plan_id;
    RETURN NEW;
  END IF;

  -- Create new circle_plan
  INSERT INTO circle_plans (community_id, name, price_cents, currency, interval, trial_days, is_active)
  VALUES (NEW.community_id, NEW.name, NEW.price_cents, 'BRL',
    CASE WHEN NEW.billing_period = 'yearly' THEN 'yearly' ELSE 'monthly' END,
    0, NEW.is_active)
  RETURNING id INTO v_plan_id;

  NEW.circle_plan_id := v_plan_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_tier_to_circle_plan
BEFORE INSERT OR UPDATE ON community_tiers
FOR EACH ROW
EXECUTE FUNCTION fn_sync_tier_to_circle_plan();
