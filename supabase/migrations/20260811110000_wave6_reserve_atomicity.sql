-- ============================================================================
-- QA-4A-V6-RESERVE-ATOMICITY — corrige os três P0 do modelo canônico da reserva
--
-- Base: 20260811100000_wave5_reserve_model_canonical.sql (pendente de aplicação).
-- Esta migration NÃO reescreve migrations aplicadas: apenas CREATE OR REPLACE
-- das RPCs do módulo de reserva e uma coluna nova em reserve_entries.
--
-- P0-1 — REVERSÃO CUMULATIVA (refunds parciais sucessivos)
--   V5 gravava no crédito de reversão apenas o DELTA da chamada corrente
--   (ON CONFLICT ... DO UPDATE SET amount = v_delta). Em refunds sucessivos
--   (reserva 100 → 80 → 60) o crédito ficava 20 em vez de 40 e 20 centavos
--   ficavam presos: o débito de segregação (-100) não era compensado.
--   V6 grava o crédito ACUMULADO, derivado sempre da reserva ORIGINAL:
--       cumulative_credit = original_amount - target_reserve
--       reserva retida    = original_amount - cumulative_credit
--   Monotônico (nunca reduz crédito já emitido) e idempotente por
--   UNIQUE(reserve_entry_id, reserve_role) WHERE status <> 'canceled'.
--
-- P0-2 — SETTLEMENT + SEGREGAÇÃO EM UMA ÚNICA TRANSAÇÃO
--   Antes: a Edge Function chamava process_order_financials (crédito integral de
--   creator_net) e, em outra transação, settle_order_reserve. Entre as duas
--   havia janela real em que 100% de creator_net estava disponível — e uma falha
--   no meio deixava o estado inconsistente permanentemente.
--   V6 introduz public.settle_order_atomic(uuid, integer): advisory lock por
--   pedido + financials + reserva/débito no MESMO commit. Qualquer etapa que
--   falhe levanta exceção e faz rollback integral. Passa a ser o ÚNICO caminho
--   de liquidação chamado pelo código.
--
-- P0-3 — RELÓGIO DO HOLD A PARTIR DO SETTLEMENT ECONÔMICO
--   V5 calculava release_at = split_entries.created_at + N dias, o que podia
--   antecipar a liberação (split criado antes da confirmação do pagamento).
--   V6 grava reserve_entries.settled_at = now() (instante do settlement, dentro
--   da transação que cria o crédito) e release_at = settled_at + N dias.
--
-- Invariantes preservados:
--   reserve  = floor(creator_net * round(pct*100) / 10000)
--   available + reserve = creator_net  (exato, em centavos, em todo caminho)
--   debito_segregacao + creditos_de_reserva + reserva_retida = 0
--
-- NÃO APLICADA. Sem deploy. Sem movimentação financeira.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. settled_at — origem canônica do relógio de hold
-- ---------------------------------------------------------------------------
ALTER TABLE public.reserve_entries
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

COMMENT ON COLUMN public.reserve_entries.settled_at IS
  'QA-4A-V6: instante do settlement economico efetivo. release_at = settled_at + reserve_hold_days.';

-- ---------------------------------------------------------------------------
-- 2. settle_order_reserve — relógio a partir do settlement (P0-3)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_order_reserve(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_order      public.orders%ROWTYPE;
  v_split      public.split_entries%ROWTYPE;
  v_existing   public.reserve_entries%ROWTYPE;
  v_pct        numeric;
  v_days       integer;
  v_tier       text;
  v_amount     bigint;
  v_method     text;
  v_sale       public.wallet_ledger%ROWTYPE;
  v_debit_id   uuid;
  v_reserve_id uuid;
  v_settled_at timestamptz;
  v_release_at timestamptz;
BEGIN
  -- Ordem de locks estável no módulo: orders → split_entries → reserve_entries
  -- → wallet_ledger. Evita deadlock com refund/chargeback/release.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'ORDER_NOT_FOUND', 'order_id', p_order_id);
  END IF;

  SELECT * INTO v_split FROM public.split_entries
   WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'SPLIT_NOT_FOUND', 'order_id', p_order_id);
  END IF;

  IF v_split.workspace_id <> v_order.workspace_id THEN
    RETURN jsonb_build_object('outcome', 'OWNERSHIP_MISMATCH', 'order_id', p_order_id);
  END IF;

  SELECT * INTO v_existing FROM public.reserve_entries
   WHERE order_id = p_order_id FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'ALREADY_PROCESSED', 'reserve_id', v_existing.id,
      'amount_cents', v_existing.amount, 'status', v_existing.status);
  END IF;

  IF v_split.status = 'refunded' OR v_order.status IN ('REFUNDED', 'CANCELLED', 'CHARGEBACK') THEN
    RETURN jsonb_build_object('outcome', 'ORDER_NOT_ELIGIBLE', 'order_status', v_order.status);
  END IF;

  v_method := lower(COALESCE(v_order.payment_method, 'credit_card'));
  IF v_method IN ('pix', 'boleto') THEN
    RETURN jsonb_build_object('outcome', 'NOT_APPLICABLE', 'payment_method', v_method);
  END IF;

  IF COALESCE(v_split.creator_net, 0) <= 0 THEN
    RETURN jsonb_build_object('outcome', 'NOT_APPLICABLE', 'reason', 'creator_net<=0');
  END IF;

  SELECT rp.reserve_percent, rp.reserve_hold_days, rp.fee_tier
    INTO v_pct, v_days, v_tier
    FROM public.reserve_policy_for_workspace(v_order.workspace_id) rp;

  v_amount := public.reserve_amount_cents(v_split.creator_net::bigint, v_pct);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('outcome', 'NOT_APPLICABLE', 'reason', 'reserve rounds to 0',
                              'creator_net_cents', v_split.creator_net);
  END IF;

  -- Estágio econômico da venda: o débito NUNCA pode ser mais líquido que ela.
  SELECT * INTO v_sale FROM public.wallet_ledger
   WHERE order_id = p_order_id AND type = 'sale' AND status <> 'canceled'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'SALE_LEDGER_MISSING', 'order_id', p_order_id);
  END IF;

  -- P0-3: o relógio do hold começa NO SETTLEMENT (esta transação), nunca em
  -- split_entries.created_at nem em qualquer data anterior.
  v_settled_at := now();
  v_release_at := v_settled_at + make_interval(days => v_days);

  INSERT INTO public.reserve_entries (
    workspace_id, order_id, split_entry_id, amount, original_amount,
    reserve_percent, reserve_hold_days, settled_at, release_at, status
  ) VALUES (
    v_order.workspace_id, p_order_id, v_split.id, v_amount, v_amount,
    v_pct, v_days, v_settled_at, v_release_at, 'held'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_reserve_id;

  IF v_reserve_id IS NULL THEN
    -- Corrida: outra transação criou a reserva entre o SELECT e o INSERT.
    SELECT id INTO v_reserve_id FROM public.reserve_entries WHERE order_id = p_order_id;
    RETURN jsonb_build_object('outcome', 'ALREADY_PROCESSED', 'reserve_id', v_reserve_id);
  END IF;

  -- Débito de segregação: mesmo estágio (status/available_at) da venda.
  -- order_id fica NULL de propósito (ux_wallet_ledger_order_type).
  INSERT INTO public.wallet_ledger (
    workspace_id, order_id, type, amount, currency, status, available_at,
    reserve_entry_id, reserve_role, description
  ) VALUES (
    v_order.workspace_id, NULL, 'adjustment', -v_amount,
    COALESCE(v_sale.currency, 'BRL'), v_sale.status, v_sale.available_at,
    v_reserve_id, 'segregation_debit',
    'Segregacao de reserva de seguranca ' || v_reserve_id::text
  )
  RETURNING id INTO v_debit_id;

  UPDATE public.reserve_entries
     SET ledger_debit_id = v_debit_id, updated_at = now()
   WHERE id = v_reserve_id;

  RETURN jsonb_build_object(
    'outcome', 'CREATED',
    'reserve_id', v_reserve_id,
    'ledger_debit_id', v_debit_id,
    'amount_cents', v_amount,
    'creator_net_cents', v_split.creator_net,
    'available_cents', v_split.creator_net - v_amount,
    'reserve_percent', v_pct,
    'reserve_hold_days', v_days,
    'fee_tier', v_tier,
    'settled_at', v_settled_at,
    'release_at', v_release_at
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.settle_order_reserve(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_reserve(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. reverse_reserve_entry — crédito de reversão CUMULATIVO (P0-1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_reserve_entry(
  p_order_id uuid,
  p_remaining_net_cents bigint,
  p_reason text DEFAULT 'refund',
  p_final_status text DEFAULT 'reversed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_res      public.reserve_entries%ROWTYPE;
  v_debit    public.wallet_ledger%ROWTYPE;
  v_base     bigint;   -- reserva ORIGINAL (base do débito de segregação)
  v_target   bigint;   -- reserva que deve permanecer retida
  v_prev     bigint;   -- crédito de reversão já emitido (cumulativo)
  v_cum      bigint;   -- crédito de reversão que DEVE existir ao final
  v_delta    bigint;   -- incremento desta chamada (apenas para relatório)
  v_status   text;
  v_avail    timestamptz;
  v_credit   uuid;
BEGIN
  IF p_final_status NOT IN ('reversed', 'forfeited') THEN
    RAISE EXCEPTION 'RESERVE_REVERSAL: status final invalido %', p_final_status;
  END IF;

  SELECT * INTO v_res FROM public.reserve_entries WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NO_RESERVE', 'order_id', p_order_id);
  END IF;

  -- Reversível quando retida OU quando outro fluxo já marcou forfeited/reversed
  -- (a ordem de chegada dos eventos não pode prender centavos).
  IF v_res.status NOT IN ('held', 'forfeited', 'reversed') THEN
    RETURN jsonb_build_object('outcome', 'ALREADY_PROCESSED', 'status', v_res.status,
                              'reserve_id', v_res.id);
  END IF;

  v_base   := greatest(COALESCE(v_res.original_amount, v_res.amount), 0);
  v_target := public.reserve_amount_cents(greatest(COALESCE(p_remaining_net_cents, 0), 0),
                                          v_res.reserve_percent);
  v_target := least(v_target, v_base);

  -- Crédito cumulativo já emitido para esta reserva (0 se nenhum).
  SELECT COALESCE(sum(amount), 0) INTO v_prev
    FROM public.wallet_ledger
   WHERE reserve_entry_id = v_res.id
     AND reserve_role = 'reversal_credit'
     AND status <> 'canceled';

  -- P0-1: o crédito é sempre derivado da reserva ORIGINAL, jamais do delta
  -- isolado da chamada. Monotônico: nunca devolve valor já creditado.
  v_cum    := greatest(v_base - v_target, v_prev);
  v_target := v_base - v_cum;
  v_delta  := v_cum - v_prev;

  IF v_res.ledger_debit_id IS NOT NULL THEN
    SELECT * INTO v_debit FROM public.wallet_ledger WHERE id = v_res.ledger_debit_id FOR UPDATE;
  END IF;

  IF v_cum > 0 AND v_res.ledger_debit_id IS NOT NULL
     AND COALESCE(v_debit.status, 'canceled') <> 'canceled' THEN
    -- Mesmo estágio econômico do débito: nunca cria disponível antes do hold.
    IF v_debit.status = 'pending' AND v_debit.available_at IS NOT NULL
       AND v_debit.available_at > now() THEN
      v_status := 'pending'; v_avail := v_debit.available_at;
    ELSE
      v_status := 'available'; v_avail := now();
    END IF;

    INSERT INTO public.wallet_ledger (
      workspace_id, order_id, type, amount, currency, status, available_at,
      reserve_entry_id, reserve_role, description
    ) VALUES (
      v_res.workspace_id, NULL, 'adjustment', v_cum,
      COALESCE(v_debit.currency, 'BRL'), v_status, v_avail,
      v_res.id, 'reversal_credit',
      'Reversao de reserva (' || p_reason || ') ' || v_res.id::text
    )
    ON CONFLICT (reserve_entry_id, reserve_role)
      WHERE reserve_entry_id IS NOT NULL AND reserve_role IS NOT NULL AND status <> 'canceled'
    DO UPDATE SET
      amount       = EXCLUDED.amount,          -- cumulativo, nunca o delta
      status       = EXCLUDED.status,
      available_at = EXCLUDED.available_at,
      description  = EXCLUDED.description
    RETURNING id INTO v_credit;
  END IF;

  IF v_target > 0 THEN
    UPDATE public.reserve_entries
       SET amount = v_target, updated_at = now()
     WHERE id = v_res.id;
  ELSE
    UPDATE public.reserve_entries
       SET amount = 0, status = p_final_status, released_at = now(), updated_at = now()
     WHERE id = v_res.id;
  END IF;

  RETURN jsonb_build_object(
    'outcome', CASE
                 WHEN v_target > 0 AND v_delta = 0 THEN 'ALREADY_PROCESSED'
                 WHEN v_target > 0 THEN 'REDUCED'
                 ELSE upper(p_final_status)
               END,
    'reserve_id', v_res.id,
    'original_amount_cents', v_base,
    'previous_amount_cents', v_res.amount,
    'new_amount_cents', v_target,
    'reversal_credit_cents', v_cum,          -- ACUMULADO
    'reversal_credit_delta_cents', v_delta,  -- incremento desta chamada
    'ledger_credit_id', v_credit);
END;
$fn$;

REVOKE ALL ON FUNCTION public.reverse_reserve_entry(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_reserve_entry(uuid, bigint, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. settle_order_atomic — settlement + segregação no MESMO commit (P0-2)
--    Caminho único de liquidação. Idempotente (delegado às RPCs internas) e
--    serializado por advisory lock transacional por pedido.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_order_atomic(
  p_order_id uuid,
  p_gateway_fee_cents integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_fin     jsonb;
  v_res     jsonb;
  v_outcome text;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'SETTLE_ATOMIC: p_order_id obrigatorio';
  END IF;

  -- Serializa liquidações concorrentes/replays do mesmo pedido dentro da
  -- transação (liberado automaticamente no commit/rollback).
  PERFORM pg_advisory_xact_lock(hashtextextended('settle_order_atomic:' || p_order_id::text, 0));

  -- Etapa 1: split/comissão/ledger (crédito de creator_net).
  v_fin := public.process_order_commission(
    p_order_id := p_order_id,
    p_gateway_fee_cents := p_gateway_fee_cents,
    p_settle := true
  );

  IF COALESCE((v_fin ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'SETTLE_ATOMIC: financials recusados para % : %', p_order_id, v_fin;
  END IF;

  -- Etapa 2: reserva + débito de segregação, no MESMO commit do crédito.
  v_res := public.settle_order_reserve(p_order_id);
  v_outcome := COALESCE(v_res ->> 'outcome', 'UNKNOWN');

  -- Fail-closed: qualquer desfecho que deixaria creator_net integral disponível
  -- (ou indicaria inconsistência estrutural) aborta TUDO por rollback.
  IF v_outcome IN ('ORDER_NOT_FOUND', 'SPLIT_NOT_FOUND', 'OWNERSHIP_MISMATCH',
                   'SALE_LEDGER_MISSING', 'UNKNOWN') THEN
    RAISE EXCEPTION 'SETTLE_ATOMIC: segregacao da reserva falhou (%) para % : %',
      v_outcome, p_order_id, v_res;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'financials', v_fin,
    'reserve', v_res);
END;
$fn$;

REVOKE ALL ON FUNCTION public.settle_order_atomic(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_atomic(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.settle_order_atomic(uuid, integer) IS
  'QA-4A-V6: caminho unico de liquidacao. process_order_commission + settle_order_reserve na MESMA transacao, fail-closed com rollback integral.';
COMMENT ON FUNCTION public.reverse_reserve_entry(uuid, bigint, text, text) IS
  'QA-4A-V6: reversao CUMULATIVA da reserva (credito = original_amount - reserva alvo), monotonica e idempotente.';
COMMENT ON FUNCTION public.settle_order_reserve(uuid) IS
  'QA-4A-V6: cria reserva + debito de segregacao no mesmo commit; release_at = settled_at (settlement) + reserve_hold_days.';
