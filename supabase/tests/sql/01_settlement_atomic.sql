-- ============================================================================
-- T-4B-01..07 — Settlement atômico, replay e invariante centavo a centavo
-- Transacional: BEGIN … ROLLBACK. Nada persiste.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;
SELECT qa4b.assert_not_production();
SET LOCAL client_min_messages TO notice;

-- ── T-4B-01: settlement cria venda, taxa, reserva e débito de segregação ────
DO $t$
DECLARE s jsonb; v_order uuid; v_ws uuid; v_res jsonb;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  v_order := (s ->> 'order_id')::uuid;
  v_ws := (s ->> 'workspace_id')::uuid;
  v_res := (s -> 'settlement') -> 'reserve';

  PERFORM qa4b.eq(((s -> 'settlement') ->> 'ok')::boolean, true, 'T-4B-01 settlement ok');
  PERFORM qa4b.eq(v_res ->> 'outcome', 'CREATED', 'T-4B-01 reserva criada');

  PERFORM qa4b.ok(EXISTS (SELECT 1 FROM public.wallet_ledger
     WHERE order_id = v_order AND type = 'sale'), 'T-4B-01 ledger sale presente');
  PERFORM qa4b.ok(EXISTS (SELECT 1 FROM public.wallet_ledger
     WHERE reserve_role = 'segregation_debit' AND workspace_id = v_ws AND amount < 0),
     'T-4B-01 debito de segregacao presente e negativo');
  PERFORM qa4b.ok(EXISTS (SELECT 1 FROM public.reserve_entries
     WHERE order_id = v_order AND status = 'held' AND ledger_debit_id IS NOT NULL),
     'T-4B-01 reserva held vinculada ao debito');
  PERFORM qa4b.ok((SELECT settled_at IS NOT NULL FROM public.reserve_entries
     WHERE order_id = v_order), 'T-4B-01 settled_at gravado no settlement');
END;
$t$;

-- ── T-4B-02: replay idêntico de settlement não duplica nada ─────────────────
DO $t$
DECLARE s jsonb; v_order uuid; v_before text; v_again jsonb;
BEGIN
  s := qa4b.mk_settled_order('FREE', 25000, 872);
  v_order := (s ->> 'order_id')::uuid;
  v_before := qa4b.snapshot_hash(v_order);

  v_again := public.settle_order_atomic(v_order, 872);
  PERFORM qa4b.eq((v_again -> 'reserve') ->> 'outcome', 'ALREADY_PROCESSED',
    'T-4B-02 replay reconhece reserva existente');
  PERFORM qa4b.eq(qa4b.snapshot_hash(v_order), v_before,
    'T-4B-02 replay nao altera estado financeiro');
  PERFORM qa4b.eq((SELECT count(*) FROM public.wallet_ledger
     WHERE order_id = v_order AND type = 'sale'), 1::bigint,
    'T-4B-02 exatamente uma linha de venda');
  PERFORM qa4b.eq((SELECT count(*) FROM public.reserve_entries WHERE order_id = v_order),
    1::bigint, 'T-4B-02 exatamente uma reserva');
  PERFORM qa4b.assert_reserve_invariant(v_order, 'T-4B-02 pos-replay');
END;
$t$;

-- ── T-4B-03: settlement fail-closed quando não há split possível ────────────
--    Pedido não pago não gera nem venda nem reserva (rollback integral).
DO $t$
DECLARE v_ws uuid; v_order uuid; v_before bigint;
BEGIN
  PERFORM qa4b.seed_reserve_policy();
  v_ws := qa4b.mk_workspace('FREE');
  v_order := qa4b.mk_order(v_ws, 10000);
  UPDATE public.orders SET status = 'PENDING', paid_at = NULL WHERE id = v_order;
  PERFORM qa4b.mk_payment(v_order);
  v_before := (SELECT count(*) FROM public.wallet_ledger WHERE workspace_id = v_ws);

  PERFORM qa4b.raises(
    format('SELECT public.settle_order_atomic(%L::uuid, 349)', v_order),
    'SETTLE_ATOMIC', 'T-4B-03 pedido nao pago aborta o settlement');

  PERFORM qa4b.eq((SELECT count(*) FROM public.wallet_ledger WHERE workspace_id = v_ws),
    v_before, 'T-4B-03 nenhum lancamento criado');
  PERFORM qa4b.eq((SELECT count(*) FROM public.reserve_entries WHERE order_id = v_order),
    0::bigint, 'T-4B-03 nenhuma reserva criada');
END;
$t$;

-- ── T-4B-05/06: invariante centavo a centavo em varredura de valores ────────
DO $t$
DECLARE
  v_gross integer;
  s jsonb; v_order uuid; v_net bigint; v_reserve bigint; v_expected bigint;
BEGIN
  FOREACH v_gross IN ARRAY ARRAY[1, 3, 7, 99, 101, 999, 1001, 3333, 12345, 99999, 100000] LOOP
    s := qa4b.mk_settled_order('FREE', v_gross, GREATEST(round(v_gross * 0.0349)::int, 0));
    v_order := (s ->> 'order_id')::uuid;
    v_net := qa4b.creator_net(v_order);
    v_reserve := qa4b.reserve_amount(v_order);
    v_expected := public.reserve_amount_cents(v_net, 10);

    PERFORM qa4b.eq(v_reserve, v_expected,
      format('T-4B-05 gross=%s reserva = floor(10%% de creator_net)', v_gross));
    PERFORM qa4b.ok(v_net - v_reserve >= 0,
      format('T-4B-06 gross=%s disponivel nunca negativo', v_gross));
    PERFORM qa4b.assert_reserve_invariant(v_order,
      format('T-4B-05 gross=%s', v_gross));
  END LOOP;
END;
$t$;

-- ── T-4B-07: get_wallet_balance vs soma manual do ledger ───────────────────
DO $t$
DECLARE s jsonb; v_ws uuid; v_manual bigint;
BEGIN
  s := qa4b.mk_settled_order('FREE', 50000, 1745);
  v_ws := (s ->> 'workspace_id')::uuid;
  SELECT COALESCE(sum(CASE WHEN type IN ('withdrawal','fee','refund','chargeback')
                           THEN -abs(amount) ELSE amount END), 0)
    INTO v_manual
    FROM public.wallet_ledger
   WHERE workspace_id = v_ws AND status IN ('pending', 'available');
  PERFORM qa4b.eq(qa4b.total_balance(v_ws), v_manual,
    'T-4B-07 get_wallet_balance espelha a regra canonica de sinal/status');
END;
$t$;

ROLLBACK;
