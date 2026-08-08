-- ─────────────────────────────────────────────────────────────
-- 1. Single source of truth: workspaces.plan (UPPERCASE)
-- ─────────────────────────────────────────────────────────────

-- Backfill from the most reliable source available, in order:
-- active subscription > metadata.plan > legacy plan_type
UPDATE public.workspaces w
SET plan = COALESCE(
  (
    SELECT CASE s.plan_code
             WHEN 'creator' THEN 'CREATOR'
             WHEN 'creator-pro' THEN 'CREATOR_PRO'
             WHEN 'creator_pro' THEN 'CREATOR_PRO'
             ELSE 'FREE'
           END
    FROM public.workspace_subscriptions s
    WHERE s.workspace_id = w.id
      AND s.status IN ('active', 'trialing', 'past_due')
    ORDER BY s.created_at DESC
    LIMIT 1
  ),
  CASE upper(replace(coalesce(w.metadata->>'plan', ''), '-', '_'))
    WHEN 'CREATOR' THEN 'CREATOR'
    WHEN 'CREATOR_PRO' THEN 'CREATOR_PRO'
    ELSE NULL
  END,
  CASE upper(replace(coalesce(w.plan_type, ''), '-', '_'))
    WHEN 'CREATOR' THEN 'CREATOR'
    WHEN 'CREATOR_PRO' THEN 'CREATOR_PRO'
    WHEN 'PRO' THEN 'CREATOR_PRO'
    ELSE NULL
  END,
  'FREE'
);

-- Normalise anything unexpected before constraining
UPDATE public.workspaces
SET plan = 'FREE'
WHERE plan IS NULL OR plan NOT IN ('FREE', 'CREATOR', 'CREATOR_PRO');

ALTER TABLE public.workspaces
  ALTER COLUMN plan SET DEFAULT 'FREE',
  ALTER COLUMN plan SET NOT NULL;

ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_plan_check;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_plan_check
  CHECK (plan IN ('FREE', 'CREATOR', 'CREATOR_PRO'));

-- Remove the conflicting sources of truth
UPDATE public.workspaces
SET metadata = metadata - 'plan'
WHERE metadata ? 'plan';

ALTER TABLE public.workspaces DROP COLUMN IF EXISTS plan_type;

COMMENT ON COLUMN public.workspaces.plan IS
  'Single source of truth for the workspace plan. Always FREE | CREATOR | CREATOR_PRO. Written only by sync_workspace_plan().';

-- ─────────────────────────────────────────────────────────────
-- 2. Plan limits table-driven helper
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.plan_max_products(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(coalesce(_plan, 'FREE'))
           WHEN 'CREATOR' THEN 10
           WHEN 'CREATOR_PRO' THEN NULL   -- unlimited
           ELSE 1
         END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. sync_workspace_plan(): the only writer of workspaces.plan
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_workspace_plan(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub    public.workspace_subscriptions;
  v_plan   text := 'FREE';
  v_old    text;
BEGIN
  SELECT plan INTO v_old FROM public.workspaces WHERE id = p_workspace_id;
  IF v_old IS NULL THEN
    RETURN NULL; -- workspace does not exist
  END IF;

  -- Prefer a live subscription, then the newest record
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  ORDER BY (status IN ('active', 'trialing')) DESC,
           (status = 'past_due') DESC,
           created_at DESC
  LIMIT 1;

  IF v_sub.id IS NOT NULL THEN
    v_plan := CASE v_sub.plan_code
                WHEN 'creator' THEN 'CREATOR'
                WHEN 'creator-pro' THEN 'CREATOR_PRO'
                WHEN 'creator_pro' THEN 'CREATOR_PRO'
                ELSE 'FREE'
              END;

    -- Not paid yet / no longer paying => no paid features
    IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
      v_plan := 'FREE';
    END IF;

    -- Delinquency: 7-day grace window after the period ends
    IF v_sub.status = 'past_due'
       AND v_sub.current_period_end IS NOT NULL
       AND v_sub.current_period_end < now() - interval '7 days' THEN
      v_plan := 'FREE';
    END IF;
  END IF;

  UPDATE public.workspaces
  SET plan = v_plan,
      plan_started_at = CASE
        WHEN v_plan <> 'FREE' AND plan <> v_plan THEN now()
        WHEN v_plan = 'FREE' THEN NULL
        ELSE plan_started_at
      END,
      plan_expires_at = CASE WHEN v_plan = 'FREE' THEN NULL ELSE v_sub.current_period_end END,
      updated_at = now()
  WHERE id = p_workspace_id;

  IF v_old IS DISTINCT FROM v_plan THEN
    INSERT INTO public.audit_logs (workspace_id, entity_type, entity_id, action, metadata)
    VALUES (
      p_workspace_id, 'workspace', p_workspace_id, 'workspace_plan_changed',
      jsonb_build_object(
        'old_plan', v_old,
        'new_plan', v_plan,
        'subscription_id', v_sub.id,
        'subscription_status', v_sub.status,
        'current_period_end', v_sub.current_period_end
      )
    );
  END IF;

  RETURN v_plan;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_workspace_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_workspace_plan(uuid) TO service_role;

-- Keep workspaces.plan in lockstep with the subscription lifecycle
CREATE OR REPLACE FUNCTION public.fn_sync_workspace_plan_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_workspace_plan(COALESCE(NEW.workspace_id, OLD.workspace_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_workspace_plan ON public.workspace_subscriptions;
CREATE TRIGGER trg_sync_workspace_plan
AFTER INSERT OR UPDATE OF status, plan_code, current_period_end, canceled_at
  OR DELETE ON public.workspace_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_workspace_plan_from_subscription();

-- ─────────────────────────────────────────────────────────────
-- 4. Delinquency / downgrade job (data is never deleted)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_overdue_workspace_plans()
RETURNS TABLE(workspace_id uuid, subscription_id uuid, plan_code text, previous_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH overdue AS (
    UPDATE public.workspace_subscriptions s
    SET status = 'expired',
        updated_at = now()
    WHERE s.status IN ('past_due', 'pending')
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end < now() - interval '7 days'
    RETURNING s.workspace_id, s.id, s.plan_code, 'past_due'::text AS prev
  )
  SELECT o.workspace_id, o.id, o.plan_code, o.prev FROM overdue o;

  -- The AFTER UPDATE trigger already re-synced workspaces.plan for each row.
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_workspace_plans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_overdue_workspace_plans() TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. Server-side plan enforcement on products (not bypassable via API)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_plan_product_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan  text;
  v_max   integer;
  v_count integer;
BEGIN
  IF NEW.workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO v_plan FROM public.workspaces WHERE id = NEW.workspace_id;
  v_max := public.plan_max_products(v_plan);

  IF v_max IS NULL THEN
    RETURN NEW; -- unlimited
  END IF;

  SELECT count(*) INTO v_count
  FROM public.products
  WHERE workspace_id = NEW.workspace_id
    AND deleted_at IS NULL;

  IF v_count >= v_max THEN
    RAISE EXCEPTION
      'PLAN_LIMIT_PRODUCTS: seu plano permite % produto(s) e você já tem %. Faça upgrade para criar mais.',
      v_max, v_count
      USING ERRCODE = 'check_violation',
            HINT = 'plan=' || coalesce(v_plan, 'FREE');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_product_limit ON public.products;
CREATE TRIGGER trg_enforce_plan_product_limit
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_product_limit();

-- Undeleting a product must respect the limit too
CREATE OR REPLACE FUNCTION public.enforce_plan_product_limit_on_restore()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan  text;
  v_max   integer;
  v_count integer;
BEGIN
  IF OLD.deleted_at IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO v_plan FROM public.workspaces WHERE id = NEW.workspace_id;
  v_max := public.plan_max_products(v_plan);
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.products
  WHERE workspace_id = NEW.workspace_id
    AND deleted_at IS NULL
    AND id <> NEW.id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION
      'PLAN_LIMIT_PRODUCTS: seu plano permite % produto(s) ativo(s). Faça upgrade para reativar este produto.', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_product_limit_restore ON public.products;
CREATE TRIGGER trg_enforce_plan_product_limit_restore
BEFORE UPDATE OF deleted_at ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_product_limit_on_restore();

-- ─────────────────────────────────────────────────────────────
-- 6. Re-sync every workspace from its subscription state
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.workspaces LOOP
    PERFORM public.sync_workspace_plan(r.id);
  END LOOP;
END $$;