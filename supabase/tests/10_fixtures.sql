-- ============================================================================
-- QA-4A-V7 — Fixtures sintéticas + helpers de asserção (schema qa4b)
-- ----------------------------------------------------------------------------
-- 100% dados sintéticos. NENHUMA cópia de produção. Todo objeto vive no schema
-- descartável qa4b e todas as linhas criadas carregam o marcador 'qa4b' no
-- e-mail/slug para permitir varredura de vazamento.
--
-- Este arquivo cria FUNÇÕES. As linhas são criadas dentro de cada teste, sempre
-- em BEGIN … ROLLBACK (exceto o runner de concorrência, que usa banco
-- descartável recriado).
-- ============================================================================

\set ON_ERROR_STOP on

DROP SCHEMA IF EXISTS qa4b CASCADE;
CREATE SCHEMA qa4b;

-- ── Guarda anti-produção (defesa em profundidade; o runner também checa) ─────
CREATE OR REPLACE FUNCTION qa4b.assert_not_production() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF current_database() ILIKE '%wfuwenylojhabresnrvi%' THEN
    RAISE EXCEPTION 'QA4B ABORTADO: banco de producao detectado (%).', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE customer_email NOT ILIKE '%qa4b%' LIMIT 1) THEN
    RAISE EXCEPTION 'QA4B ABORTADO: public.orders contem dados nao sinteticos.';
  END IF;
END;
$$;

-- ── Asserções fail-closed ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qa4b.ok(p_cond boolean, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERT FALHOU: %', p_msg USING ERRCODE = '55000';
  END IF;
  RAISE NOTICE 'ok  — %', p_msg;
END;
$$;

CREATE OR REPLACE FUNCTION qa4b.eq(p_actual anyelement, p_expected anyelement, p_msg text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'ASSERT FALHOU: % (esperado=% obtido=%)',
      p_msg, p_expected, p_actual USING ERRCODE = '55000';
  END IF;
  RAISE NOTICE 'ok  — % (=%)', p_msg, p_expected;
END;
$$;

-- Executa SQL esperando exceção cujo texto casa com p_pattern.
-- Usa subtransação: o efeito parcial é descartado, provando "falha antes de
-- efeitos" quando combinada com qa4b.snapshot_hash().
CREATE OR REPLACE FUNCTION qa4b.raises(p_sql text, p_pattern text, p_msg text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_err text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'ASSERT FALHOU: % — nenhuma excecao levantada', p_msg
      USING ERRCODE = '55000';
  EXCEPTION
    WHEN sqlstate '55000' THEN
      IF SQLERRM LIKE 'ASSERT FALHOU%' THEN RAISE; END IF;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_err := SQLERRM;
  END;
  IF v_err NOT LIKE '%' || p_pattern || '%' THEN
    RAISE EXCEPTION 'ASSERT FALHOU: % — excecao inesperada: %', p_msg, v_err
      USING ERRCODE = '55000';
  END IF;
  RAISE NOTICE 'ok  — % (raise: %)', p_msg, p_pattern;
END;
$$;

-- Impressão digital do estado financeiro de um pedido: prova "sem efeitos".
CREATE OR REPLACE FUNCTION qa4b.snapshot_hash(p_order_id uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT md5(
    COALESCE((SELECT string_agg(l.type || ':' || l.amount || ':' || l.status, '|' ORDER BY l.id)
                FROM public.wallet_ledger l
               WHERE l.workspace_id = (SELECT workspace_id FROM public.orders WHERE id = p_order_id)), '-')
    || '#' ||
    COALESCE((SELECT string_agg(r.status || ':' || r.amount, '|' ORDER BY r.id)
                FROM public.reserve_entries r WHERE r.order_id = p_order_id), '-')
    || '#' ||
    COALESCE((SELECT string_agg(f.gateway_refund_id || ':' || f.amount || ':' || f.status, '|' ORDER BY f.id)
                FROM public.refunds f WHERE f.order_id = p_order_id), '-')
    || '#' ||
    COALESCE((SELECT string_agg(c.gateway_dispute_id || ':' || c.amount, '|' ORDER BY c.id)
                FROM public.chargeback_cases c WHERE c.order_id = p_order_id), '-')
    || '#' ||
    COALESCE((SELECT s.status || ':' || s.creator_net FROM public.split_entries s
               WHERE s.order_id = p_order_id), '-')
  );
$$;

-- ── Política de reserva: dados NÃO versionados em migration (ver BLOQUEADOR B1)
CREATE OR REPLACE FUNCTION qa4b.seed_reserve_policy() RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.fee_config (plan_type, reserve_percent, reserve_hold_days, description)
  VALUES ('creator', 10, 30, 'qa4b'), ('creator_pro', 10, 15, 'qa4b')
  ON CONFLICT (plan_type) DO UPDATE
    SET reserve_percent = EXCLUDED.reserve_percent,
        reserve_hold_days = EXCLUDED.reserve_hold_days;
$$;

-- ── Fábricas ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qa4b.mk_user(p_label text DEFAULT 'u') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES (v_id, 'qa4b+' || p_label || '.' || left(v_id::text, 8) || '@example.invalid');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION qa4b.mk_workspace(p_plan text DEFAULT 'FREE', p_owner uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid(); v_owner uuid := p_owner;
BEGIN
  IF v_owner IS NULL THEN v_owner := qa4b.mk_user('owner'); END IF;
  INSERT INTO public.workspaces (id, name, slug, plan)
  VALUES (v_id, 'qa4b ' || left(v_id::text, 8), 'qa4b-' || left(v_id::text, 8), p_plan);
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_id, v_owner, 'OWNER');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION qa4b.owner_of(p_workspace_id uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT user_id FROM public.workspace_members
   WHERE workspace_id = p_workspace_id AND role = 'OWNER' LIMIT 1;
$$;

-- p_gross_cents em CENTAVOS (orders.total_amount é REAIS).
CREATE OR REPLACE FUNCTION qa4b.mk_order(
  p_workspace_id uuid, p_gross_cents integer, p_method text DEFAULT 'credit_card')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.orders (
    id, workspace_id, customer_email, total_amount, status, paid_at, payment_method)
  VALUES (
    v_id, p_workspace_id, 'qa4b.buyer.' || left(v_id::text, 8) || '@example.invalid',
    p_gross_cents::numeric / 100, 'COMPLETED', now(), p_method);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION qa4b.mk_payment(p_order_id uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid(); v_o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_o FROM public.orders WHERE id = p_order_id;
  INSERT INTO public.payments (id, workspace_id, order_id, method, amount, status)
  VALUES (v_id, v_o.workspace_id, p_order_id,
          COALESCE(v_o.payment_method, 'credit_card'), v_o.total_amount, 'CONFIRMED');
  RETURN v_id;
END;
$$;

-- Cenário completo: workspace + pedido pago + pagamento + liquidação atômica.
-- p_gateway_fee_cents explícito para aritmética determinística.
CREATE OR REPLACE FUNCTION qa4b.mk_settled_order(
  p_plan text DEFAULT 'FREE',
  p_gross_cents integer DEFAULT 10000,
  p_gateway_fee_cents integer DEFAULT 349,
  p_method text DEFAULT 'credit_card')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_ws uuid; v_order uuid; v_payment uuid; v_res jsonb;
BEGIN
  PERFORM qa4b.seed_reserve_policy();
  v_ws := qa4b.mk_workspace(p_plan);
  v_order := qa4b.mk_order(v_ws, p_gross_cents, p_method);
  v_payment := qa4b.mk_payment(v_order);
  v_res := public.settle_order_atomic(v_order, p_gateway_fee_cents);
  RETURN jsonb_build_object(
    'workspace_id', v_ws, 'order_id', v_order, 'payment_id', v_payment,
    'charge_cents', p_gross_cents, 'settlement', v_res,
    'creator_net_cents', qa4b.creator_net(v_order),
    'reserve_cents', qa4b.reserve_amount(v_order));
END;
$$;

-- ── Leituras derivadas ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qa4b.creator_net(p_order_id uuid) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(creator_net, 0)::bigint FROM public.split_entries WHERE order_id = p_order_id;
$$;

CREATE OR REPLACE FUNCTION qa4b.reserve_amount(p_order_id uuid) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(amount, 0)::bigint FROM public.reserve_entries WHERE order_id = p_order_id;
$$;

CREATE OR REPLACE FUNCTION qa4b.reserve_status(p_order_id uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT status FROM public.reserve_entries WHERE order_id = p_order_id;
$$;

-- Reserva ainda retida (0 quando liberada/revertida).
CREATE OR REPLACE FUNCTION qa4b.reserve_held(p_order_id uuid) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN status = 'held' THEN COALESCE(amount, 0)::bigint ELSE 0::bigint END
    FROM public.reserve_entries WHERE order_id = p_order_id;
$$;

CREATE OR REPLACE FUNCTION qa4b.total_balance(p_workspace_id uuid) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT total_balance FROM public.get_wallet_balance(p_workspace_id);
$$;

CREATE OR REPLACE FUNCTION qa4b.available_balance(p_workspace_id uuid) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT available_balance FROM public.get_wallet_balance(p_workspace_id);
$$;

-- Invariante central da Onda 4A: saldo total + reserva retida = creator_net.
CREATE OR REPLACE FUNCTION qa4b.assert_reserve_invariant(p_order_id uuid, p_msg text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_ws uuid; v_net bigint; v_held bigint; v_total bigint;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.orders WHERE id = p_order_id;
  v_net := qa4b.creator_net(p_order_id);
  v_held := qa4b.reserve_held(p_order_id);
  v_total := qa4b.total_balance(v_ws);
  PERFORM qa4b.eq(v_total + v_held, v_net,
    p_msg || ' — total_balance(' || v_total || ') + reserva_retida(' || v_held ||
    ') deve igualar creator_net');
END;
$$;

-- Impersonação para testes de RLS (stub em cluster efêmero; JWT real na branch).
CREATE OR REPLACE FUNCTION qa4b.act_as(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', p_role)::text, true);
END;
$$;
