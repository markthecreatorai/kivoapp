-- ============================================================================
-- QA-4A-V5-RESERVE-MODEL — modelo canônico da reserva de segurança
--
-- POLÍTICA APROVADA (fechada com o produto):
--   • public.reserve_entries é a ÚNICA fonte canônica da reserva.
--     public.security_reserves fica congelada: histórico preservado, NOVAS
--     escritas bloqueadas por trigger fail-closed.
--   • Reserva = reserve_percent (10%) de split_entries.creator_net, em CENTAVOS,
--     com arredondamento determinístico para BAIXO (divisão inteira):
--         reserve_cents   = (creator_net * round(percent*100)) / 10000   [floor]
--         available_cents = creator_net - reserve_cents
--     Logo available + reserve = creator_net EXATAMENTE, sempre, inclusive em
--     valores pequenos (creator_net = 5 → reserva 0, disponível 5).
--   • FREE: 10% por 30 dias, explicitado em reserve_policy_for_workspace().
--     FREE e CREATOR compartilham a linha fee_config 'creator' (10/30);
--     CREATOR_PRO usa 'creator_pro' (10/15). Drift na configuração é
--     FAIL-CLOSED: a função levanta exceção em vez de reservar valor errado.
--   • Reserva só existe em CARTÃO (PIX/boleto não têm risco de chargeback).
--
-- CONTABILIDADE (a correção central do P0 "criação de dinheiro"):
--   Na origem, o settlement credita creator_net INTEGRAL no wallet_ledger.
--   Esta migration passa a SEGREGAR a fatia reservada no MESMO commit em que a
--   reserva é criada: wallet_ledger recebe um débito 'adjustment' negativo de
--   -reserve com reserve_role='segregation_debit'. A liberação (D+30) insere o
--   crédito espelho 'release_credit'. Débito + crédito = 0 → nenhum centavo é
--   criado nem destruído; a reserva apenas deixa de ser sacável até vencer.
--
--   Equações (creator_net = N, reserva = R, pct = 10%):
--     t0 .. t30-   saldo do produtor = N - R    (R segregado, não sacável)
--     t30+         saldo do produtor = N        (R liberado)
--     refund parcial (reembolsado = X) → R' = floor((N - X) * pct)
--                                        crédito de reversão = R - R'
--                                        saldo = (N - X) - R'
--     refund total / chargeback perdido → R' = 0, crédito de reversão = R,
--                                        venda cancelada → saldo fecha em 0
--     chargeback ganho → reserva volta a 'held' com o débito intacto
--
-- CHAVES DE IDEMPOTÊNCIA (estruturais, nunca `description`):
--     reserve_entries: UNIQUE(order_id), UNIQUE(split_entry_id)
--     wallet_ledger:   UNIQUE(reserve_entry_id, reserve_role) WHERE ativo
--   O ciclo NUNCA grava order_id nas linhas de reserva do ledger, porque
--   ux_wallet_ledger_order_type = UNIQUE(order_id, type) colidiria com
--   qualquer outro 'adjustment' do mesmo pedido (regressão silenciosa da v3).
--
-- LEGADO: existe exatamente 1 reserve_entry histórica (held, sem débito de
--   segregação, criada quando o settlement já havia creditado 100% ao produtor).
--   Ela é marcada 'reconciled_legacy' SEM crédito e SEM débito retroativo:
--   o valor já foi integralmente recebido; qualquer lançamento agora seria
--   duplicidade. A marcação é auditável (reconciliation_note).
--
-- NÃO APLICADA. Compatível com 20260811074500 e 20260811090000 (pendentes).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. reserve_entries — colunas de vínculo contábil e status ampliado
-- ---------------------------------------------------------------------------
ALTER TABLE public.reserve_entries
  ADD COLUMN IF NOT EXISTS split_entry_id uuid,
  ADD COLUMN IF NOT EXISTS ledger_debit_id uuid,
  ADD COLUMN IF NOT EXISTS ledger_credit_id uuid,
  ADD COLUMN IF NOT EXISTS reserve_hold_days integer,
  ADD COLUMN IF NOT EXISTS original_amount bigint,
  ADD COLUMN IF NOT EXISTS reconciliation_note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reserve_entries_split_entry_fk') THEN
    ALTER TABLE public.reserve_entries
      ADD CONSTRAINT reserve_entries_split_entry_fk
      FOREIGN KEY (split_entry_id) REFERENCES public.split_entries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reserve_entries_ledger_debit_fk') THEN
    ALTER TABLE public.reserve_entries
      ADD CONSTRAINT reserve_entries_ledger_debit_fk
      FOREIGN KEY (ledger_debit_id) REFERENCES public.wallet_ledger(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reserve_entries_ledger_credit_fk') THEN
    ALTER TABLE public.reserve_entries
      ADD CONSTRAINT reserve_entries_ledger_credit_fk
      FOREIGN KEY (ledger_credit_id) REFERENCES public.wallet_ledger(id);
  END IF;
END;
$mig$;

-- Status canônicos: held | released | forfeited | reversed | reconciled_legacy
ALTER TABLE public.reserve_entries DROP CONSTRAINT IF EXISTS reserve_entries_status_check;
ALTER TABLE public.reserve_entries
  ADD CONSTRAINT reserve_entries_status_check
  CHECK (status IN ('held', 'released', 'forfeited', 'reversed', 'reconciled_legacy'));

ALTER TABLE public.reserve_entries DROP CONSTRAINT IF EXISTS reserve_entries_amount_check;
ALTER TABLE public.reserve_entries
  ADD CONSTRAINT reserve_entries_amount_check CHECK (amount >= 0);

-- PREFLIGHT FAIL-CLOSED: duplicidade histórica impediria os índices únicos.
DO $mig$
DECLARE v_dups integer;
BEGIN
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT order_id FROM public.reserve_entries
     WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(*) > 1) d;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT: % pedido(s) com mais de uma reserva. Reconcilie antes de aplicar.', v_dups;
  END IF;
END;
$mig$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_reserve_entries_order
  ON public.reserve_entries (order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reserve_entries_split_entry
  ON public.reserve_entries (split_entry_id) WHERE split_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reserve_entries_due
  ON public.reserve_entries (status, release_at);

-- ---------------------------------------------------------------------------
-- 2. wallet_ledger — vínculo estruturado com a reserva canônica
--    (convive com security_reserve_id/reserve_role criados em 20260811090000)
-- ---------------------------------------------------------------------------
ALTER TABLE public.wallet_ledger
  ADD COLUMN IF NOT EXISTS reserve_entry_id uuid,
  ADD COLUMN IF NOT EXISTS reserve_role text;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_ledger_reserve_entry_fk') THEN
    ALTER TABLE public.wallet_ledger
      ADD CONSTRAINT wallet_ledger_reserve_entry_fk
      FOREIGN KEY (reserve_entry_id) REFERENCES public.reserve_entries(id);
  END IF;
END;
$mig$;

-- O CHECK anterior (v3) exigia security_reserve_id; agora aceita também o
-- vínculo canônico reserve_entry_id e o papel 'reversal_credit'.
DO $mig$
DECLARE v_has_sr boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'wallet_ledger'
       AND column_name = 'security_reserve_id') INTO v_has_sr;

  ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_reserve_role_check;

  IF v_has_sr THEN
    ALTER TABLE public.wallet_ledger
      ADD CONSTRAINT wallet_ledger_reserve_role_check CHECK (
        reserve_role IS NULL
        OR (reserve_role IN ('segregation_debit', 'release_credit', 'reversal_credit')
            AND (security_reserve_id IS NOT NULL OR reserve_entry_id IS NOT NULL)));
  ELSE
    ALTER TABLE public.wallet_ledger
      ADD CONSTRAINT wallet_ledger_reserve_role_check CHECK (
        reserve_role IS NULL
        OR (reserve_role IN ('segregation_debit', 'release_credit', 'reversal_credit')
            AND reserve_entry_id IS NOT NULL));
  END IF;
END;
$mig$;

-- Um lançamento ativo por (reserva, papel): replay do worker não duplica nada.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_ledger_reserve_entry_role
  ON public.wallet_ledger (reserve_entry_id, reserve_role)
  WHERE reserve_entry_id IS NOT NULL AND reserve_role IS NOT NULL AND status <> 'canceled';

-- ---------------------------------------------------------------------------
-- 3. Política canônica de reserva por workspace (FREE explícito)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_policy_for_workspace(p_workspace_id uuid)
RETURNS TABLE(reserve_percent numeric, reserve_hold_days integer, fee_tier text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_plan text;
  v_tier text;
  v_pct  numeric;
  v_days integer;
BEGIN
  SELECT upper(COALESCE(plan, 'FREE')) INTO v_plan
    FROM public.workspaces WHERE id = p_workspace_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'RESERVE_POLICY: workspace % inexistente', p_workspace_id;
  END IF;

  -- FREE e CREATOR → tier 'creator' (10% / 30 dias). CREATOR_PRO → 10% / 15 dias.
  v_tier := CASE WHEN v_plan = 'CREATOR_PRO' THEN 'creator_pro' ELSE 'creator' END;

  SELECT fc.reserve_percent, fc.reserve_hold_days INTO v_pct, v_days
    FROM public.fee_config fc WHERE fc.plan_type = v_tier;

  IF v_pct IS NULL OR v_days IS NULL THEN
    RAISE EXCEPTION 'RESERVE_POLICY: fee_config % ausente/incompleto', v_tier;
  END IF;

  -- FAIL-CLOSED: política fechada para FREE/CREATOR é 10% por 30 dias.
  IF v_tier = 'creator' AND (v_pct <> 10 OR v_days <> 30) THEN
    RAISE EXCEPTION 'RESERVE_POLICY_DRIFT: tier creator esperado 10/30, encontrado %/%', v_pct, v_days;
  END IF;

  RETURN QUERY SELECT v_pct, v_days, v_tier;
END;
$fn$;

REVOKE ALL ON FUNCTION public.reserve_policy_for_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_policy_for_workspace(uuid) TO service_role;

-- Arredondamento determinístico (floor por divisão inteira em basis points).
CREATE OR REPLACE FUNCTION public.reserve_amount_cents(p_creator_net bigint, p_percent numeric)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT CASE
    WHEN p_creator_net IS NULL OR p_creator_net <= 0 OR COALESCE(p_percent, 0) <= 0 THEN 0::bigint
    ELSE least(p_creator_net, (p_creator_net * round(p_percent * 100)::bigint) / 10000)
  END;
$fn$;

REVOKE ALL ON FUNCTION public.reserve_amount_cents(bigint, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_amount_cents(bigint, numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. settle_order_reserve — cria reserva + débito de segregação NO MESMO COMMIT
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
  v_release_at timestamptz;
BEGIN
  -- Ordem de locks estável em todo o módulo: orders → split_entries →
  -- reserve_entries → wallet_ledger. Evita deadlock com refund/chargeback.
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

  v_release_at := COALESCE(v_split.created_at, now()) + make_interval(days => v_days);

  INSERT INTO public.reserve_entries (
    workspace_id, order_id, split_entry_id, amount, original_amount,
    reserve_percent, reserve_hold_days, release_at, status
  ) VALUES (
    v_order.workspace_id, p_order_id, v_split.id, v_amount, v_amount,
    v_pct, v_days, v_release_at, 'held'
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
    'release_at', v_release_at
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.settle_order_reserve(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_reserve(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. release_reserve_entry — libera uma vez, após 30 dias, sem antecipar caixa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_reserve_entry(p_reserve_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_res       public.reserve_entries%ROWTYPE;
  v_debit     public.wallet_ledger%ROWTYPE;
  v_credit_id uuid;
  v_status    text;
  v_avail     timestamptz;
  v_replayed  boolean := false;
  v_cb        integer;
  v_refunded  integer;
BEGIN
  SELECT * INTO v_res FROM public.reserve_entries WHERE id = p_reserve_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND', 'reserve_id', p_reserve_id);
  END IF;

  IF v_res.status <> 'held' THEN
    RETURN jsonb_build_object('outcome', 'ALREADY_PROCESSED', 'status', v_res.status,
                              'reserve_id', p_reserve_id);
  END IF;

  IF v_res.release_at > now() THEN
    RETURN jsonb_build_object('outcome', 'NOT_DUE', 'release_at', v_res.release_at);
  END IF;

  IF v_res.ledger_debit_id IS NULL THEN
    -- Sem prova estruturada de segregação, creditar inventaria dinheiro.
    RETURN jsonb_build_object('outcome', 'NEEDS_PRODUCT_DECISION',
      'reason', 'reserva sem debito de segregacao na origem', 'reserve_id', p_reserve_id);
  END IF;

  IF v_res.order_id IS NOT NULL THEN
    -- Chargeback ativo → prorroga 30 dias, mantém retida.
    SELECT count(*) INTO v_cb FROM public.chargeback_cases
     WHERE order_id = v_res.order_id
       AND status IN ('new', 'evidence_pending', 'submitted');
    IF v_cb > 0 THEN
      UPDATE public.reserve_entries
         SET release_at = now() + interval '30 days', updated_at = now()
       WHERE id = p_reserve_id;
      RETURN jsonb_build_object('outcome', 'HELD_CHARGEBACK', 'reserve_id', p_reserve_id);
    END IF;

    -- Pedido já reembolsado/estornado: a reversão da reserva é do fluxo de
    -- refund/chargeback, não da liberação.
    SELECT count(*) INTO v_refunded FROM public.orders
     WHERE id = v_res.order_id AND status IN ('REFUNDED', 'CHARGEBACK', 'CANCELLED');
    IF v_refunded > 0 THEN
      RETURN jsonb_build_object('outcome', 'ORDER_NOT_ELIGIBLE', 'reserve_id', p_reserve_id);
    END IF;
  END IF;

  SELECT * INTO v_debit FROM public.wallet_ledger WHERE id = v_res.ledger_debit_id FOR UPDATE;
  IF NOT FOUND OR v_debit.status = 'canceled' THEN
    RETURN jsonb_build_object('outcome', 'DEBIT_INVALID', 'reserve_id', p_reserve_id);
  END IF;
  IF v_debit.workspace_id <> v_res.workspace_id THEN
    RETURN jsonb_build_object('outcome', 'OWNERSHIP_MISMATCH', 'reserve_id', p_reserve_id);
  END IF;

  -- Nunca antecipar liquidez: o crédito herda o estágio do débito de origem.
  IF v_debit.status = 'pending' AND v_debit.available_at IS NOT NULL
     AND v_debit.available_at > now() THEN
    v_status := 'pending';
    v_avail  := v_debit.available_at;
  ELSE
    v_status := 'available';
    v_avail  := now();
  END IF;

  INSERT INTO public.wallet_ledger (
    workspace_id, order_id, type, amount, currency, status, available_at,
    reserve_entry_id, reserve_role, description
  ) VALUES (
    v_res.workspace_id, NULL, 'adjustment', v_res.amount,
    COALESCE(v_debit.currency, 'BRL'), v_status, v_avail,
    p_reserve_id, 'release_credit',
    'Liberacao de reserva de seguranca ' || p_reserve_id::text
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_credit_id;

  -- ON CONFLICT DO NOTHING sem RETURNING ⇒ crédito já existia: é replay
  -- (segunda execução do cron ou dois workers concorrentes). Nada é creditado
  -- de novo e o chamador é informado para não contar o valor duas vezes.
  IF v_credit_id IS NULL THEN
    v_replayed := true;
    SELECT id INTO v_credit_id FROM public.wallet_ledger
     WHERE reserve_entry_id = p_reserve_id AND reserve_role = 'release_credit'
       AND status <> 'canceled' LIMIT 1;
  END IF;

  UPDATE public.reserve_entries
     SET status = 'released', released_at = now(),
         ledger_credit_id = v_credit_id, updated_at = now()
   WHERE id = p_reserve_id;

  RETURN jsonb_build_object(
    'outcome', 'RELEASED', 'reserve_id', p_reserve_id,
    'workspace_id', v_res.workspace_id, 'amount_cents', v_res.amount,
    'ledger_credit_id', v_credit_id, 'credit_status', v_status,
    'credit_replayed', v_replayed);
END;
$fn$;

REVOKE ALL ON FUNCTION public.release_reserve_entry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_reserve_entry(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. reverse_reserve_entry — refund parcial/total, chargeback perdido, cancelamento
--    p_remaining_net_cents = creator_net que PERMANECE com o produtor.
--    Recalcula a reserva sobre o remanescente e devolve a diferença ao ledger.
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
  v_res     public.reserve_entries%ROWTYPE;
  v_debit   public.wallet_ledger%ROWTYPE;
  v_target  bigint;
  v_delta   bigint;
  v_status  text;
  v_avail   timestamptz;
  v_credit  uuid;
BEGIN
  IF p_final_status NOT IN ('reversed', 'forfeited') THEN
    RAISE EXCEPTION 'RESERVE_REVERSAL: status final invalido %', p_final_status;
  END IF;

  SELECT * INTO v_res FROM public.reserve_entries WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NO_RESERVE', 'order_id', p_order_id);
  END IF;

  -- Reversível quando ainda retida OU quando outro fluxo
  -- (process_refund_increment / resolve_chargeback_case) já marcou
  -- forfeited/reversed SEM emitir o crédito de reversão: sem esse crédito o
  -- débito de segregação ficaria órfão e o saldo não fecharia em 0. Assim a
  -- ordem de chegada dos eventos não importa.
  IF v_res.status NOT IN ('held', 'forfeited', 'reversed') THEN
    RETURN jsonb_build_object('outcome', 'ALREADY_PROCESSED', 'status', v_res.status,
                              'reserve_id', v_res.id);
  END IF;

  IF v_res.status <> 'held' AND EXISTS (
    SELECT 1 FROM public.wallet_ledger
     WHERE reserve_entry_id = v_res.id AND reserve_role = 'reversal_credit'
       AND status <> 'canceled') THEN
    RETURN jsonb_build_object('outcome', 'ALREADY_PROCESSED', 'status', v_res.status,
                              'reserve_id', v_res.id);
  END IF;

  v_target := public.reserve_amount_cents(greatest(COALESCE(p_remaining_net_cents, 0), 0),
                                          v_res.reserve_percent);
  v_target := least(v_target, v_res.amount);
  v_delta  := v_res.amount - v_target;

  IF v_res.ledger_debit_id IS NOT NULL THEN
    SELECT * INTO v_debit FROM public.wallet_ledger WHERE id = v_res.ledger_debit_id FOR UPDATE;
  END IF;

  IF v_delta > 0 AND v_res.ledger_debit_id IS NOT NULL AND COALESCE(v_debit.status, 'canceled') <> 'canceled' THEN
    -- Devolve ao ledger a fatia que deixou de ser reservada, no MESMO estágio
    -- econômico do débito (nunca cria disponível antes do hold da venda).
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
      v_res.workspace_id, NULL, 'adjustment', v_delta,
      COALESCE(v_debit.currency, 'BRL'), v_status, v_avail,
      v_res.id, 'reversal_credit',
      'Reversao de reserva (' || p_reason || ') ' || v_res.id::text
    )
    ON CONFLICT (reserve_entry_id, reserve_role)
      WHERE reserve_entry_id IS NOT NULL AND reserve_role IS NOT NULL AND status <> 'canceled'
    DO UPDATE SET amount = v_delta, status = v_status, available_at = v_avail
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
    'outcome', CASE WHEN v_target > 0 THEN 'REDUCED' ELSE upper(p_final_status) END,
    'reserve_id', v_res.id, 'previous_amount_cents', v_res.amount,
    'new_amount_cents', v_target, 'reversal_credit_cents', v_delta,
    'ledger_credit_id', v_credit);
END;
$fn$;

REVOKE ALL ON FUNCTION public.reverse_reserve_entry(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_reserve_entry(uuid, bigint, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. restore_reserve_entry — chargeback GANHO devolve a reserva ao ciclo normal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_reserve_entry(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_res public.reserve_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.reserve_entries WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NO_RESERVE', 'order_id', p_order_id);
  END IF;
  IF v_res.status NOT IN ('forfeited', 'reversed') THEN
    RETURN jsonb_build_object('outcome', 'ALREADY_PROCESSED', 'status', v_res.status);
  END IF;

  -- Cancela o crédito de reversão emitido na perda/estorno e devolve o valor
  -- original à retenção — débito de segregação permanece intacto.
  UPDATE public.wallet_ledger SET status = 'canceled'
   WHERE reserve_entry_id = v_res.id AND reserve_role = 'reversal_credit'
     AND status <> 'canceled';

  UPDATE public.reserve_entries
     SET amount = COALESCE(original_amount, amount), status = 'held',
         released_at = NULL, updated_at = now()
   WHERE id = v_res.id;

  RETURN jsonb_build_object('outcome', 'RESTORED', 'reserve_id', v_res.id,
                            'amount_cents', COALESCE(v_res.original_amount, v_res.amount));
END;
$fn$;

REVOKE ALL ON FUNCTION public.restore_reserve_entry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_reserve_entry(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. security_reserves — congelamento auditável (histórico preservado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_security_reserves_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION
    'SECURITY_RESERVES_DEPRECATED: use public.reserve_entries (QA-4A-V5). Tabela congelada para leitura historica.';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_security_reserves_frozen ON public.security_reserves;
CREATE TRIGGER trg_security_reserves_frozen
  BEFORE INSERT ON public.security_reserves
  FOR EACH ROW EXECUTE FUNCTION public.fn_security_reserves_frozen();

REVOKE ALL ON TABLE public.security_reserves FROM anon, authenticated;
GRANT SELECT ON TABLE public.security_reserves TO authenticated;
GRANT ALL ON TABLE public.security_reserves TO service_role;

COMMENT ON TABLE public.security_reserves IS
  'CONGELADA (QA-4A-V5). Fonte canonica da reserva e public.reserve_entries. Somente leitura historica.';

-- ---------------------------------------------------------------------------
-- 9. Reconciliação da reserva legada — SEM crédito e SEM débito retroativo
--    Reservas criadas antes deste modelo não têm débito de segregação: o
--    produtor JÁ recebeu 100% do creator_net. Creditar agora duplicaria o
--    valor; debitar agora cobraria retroativamente. Marcamos como
--    'reconciled_legacy' com nota auditável e o ciclo novo ignora essas linhas.
-- ---------------------------------------------------------------------------
UPDATE public.reserve_entries
   SET status = 'reconciled_legacy',
       released_at = COALESCE(released_at, now()),
       reconciliation_note = 'QA-4A-V5: reserva anterior ao modelo canonico, sem debito de '
         || 'segregacao na origem; creator_net ja foi recebido integralmente. Sem lancamento '
         || 'retroativo (nem credito nem debito).',
       updated_at = now()
 WHERE status = 'held'
   AND ledger_debit_id IS NULL;

-- ---------------------------------------------------------------------------
-- 10. RLS e grants mínimos em reserve_entries
--     Escrita SOMENTE via RPCs SECURITY DEFINER acima (service_role).
-- ---------------------------------------------------------------------------
ALTER TABLE public.reserve_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reserve_entries FROM anon, authenticated;
GRANT SELECT ON TABLE public.reserve_entries TO authenticated;
GRANT ALL ON TABLE public.reserve_entries TO service_role;

DROP POLICY IF EXISTS "workspace_read_reserves" ON public.reserve_entries;
CREATE POLICY reserve_entries_select_own_workspace ON public.reserve_entries
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_admin_user());

COMMENT ON FUNCTION public.settle_order_reserve(uuid) IS
  'QA-4A-V5: cria reserve_entry e o debito de segregacao no mesmo commit (available + reserva = creator_net).';
COMMENT ON FUNCTION public.release_reserve_entry(uuid) IS
  'QA-4A-V5: libera a reserva uma unica vez apos release_at, herdando o estagio economico do debito.';
COMMENT ON FUNCTION public.reverse_reserve_entry(uuid, bigint, text, text) IS
  'QA-4A-V5: recalcula/estorna a reserva em refund parcial, refund total, chargeback perdido ou cancelamento.';
