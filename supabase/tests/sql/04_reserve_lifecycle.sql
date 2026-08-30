-- ============================================================================
-- T-4B-08..13, 25..27 — Política de reserva, relógio do hold e ciclo de vida
-- Transacional: BEGIN … ROLLBACK. Nada persiste.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;
SELECT qa4b.assert_not_production();
SET LOCAL client_min_messages TO notice;

-- ── T-4B-08: plano FREE = 10% / 30 dias a partir de settled_at ────────────
DO $t$
DECLARE s jsonb; o uuid; v_pol record; v_row public.reserve_entries%ROWTYPE;
BEGIN
  s := qa4b.mk_settled_order('FREE', 100000, 3490);
  o := (s ->> 'order_id')::uuid;

  SELECT * INTO v_pol FROM public.reserve_policy_for_workspace((s ->> 'workspace_id')::uuid);
  PERFORM qa4b.eq(v_pol.fee_tier, 'creator', 'T-4B-08 FREE mapeia para tier creator');
  PERFORM qa4b.eq(v_pol.reserve_percent, 10::numeric, 'T-4B-08 FREE = 10%');
  PERFORM qa4b.eq(v_pol.reserve_hold_days, 30, 'T-4B-08 FREE = 30 dias');

  SELECT * INTO v_row FROM public.reserve_entries WHERE order_id = o;
  PERFORM qa4b.eq(v_row.reserve_percent, 10::numeric, 'T-4B-08 percentual persistido');
  PERFORM qa4b.eq(v_row.reserve_hold_days, 30, 'T-4B-08 dias persistidos');
  PERFORM qa4b.eq(v_row.release_at, v_row.settled_at + interval '30 days',
    'T-4B-08 release_at = settled_at + 30 dias');
  PERFORM qa4b.ok(v_row.settled_at >= now() - interval '1 minute',
    'T-4B-08 relogio comeca no settlement, nao antes');
  PERFORM qa4b.eq(v_row.amount, public.reserve_amount_cents(qa4b.creator_net(o), 10),
    'T-4B-08 valor = 10% do creator_net');
END;
$t$;

-- ── T-4B-09: CREATOR_PRO = 10% / 15 dias ─────────────────────────────────
DO $t$
DECLARE s jsonb; v_pol record;
BEGIN
  s := qa4b.mk_settled_order('CREATOR_PRO', 100000, 3490);
  SELECT * INTO v_pol FROM public.reserve_policy_for_workspace((s ->> 'workspace_id')::uuid);
  PERFORM qa4b.eq(v_pol.fee_tier, 'creator_pro', 'T-4B-09 tier creator_pro');
  PERFORM qa4b.eq(v_pol.reserve_hold_days, 15, 'T-4B-09 CREATOR_PRO = 15 dias');
  PERFORM qa4b.eq((SELECT reserve_hold_days FROM public.reserve_entries
                    WHERE order_id = (s ->> 'order_id')::uuid), 15,
    'T-4B-09 dias persistidos na reserva');
END;
$t$;

-- ── T-4B-10: drift de política falha fechado (nunca 0%) ──────────────────
DO $t$
DECLARE v_ws uuid;
BEGIN
  PERFORM qa4b.seed_reserve_policy();
  v_ws := qa4b.mk_workspace('FREE');
  UPDATE public.fee_config SET reserve_percent = 0 WHERE plan_type = 'creator';
  PERFORM qa4b.raises(
    format('SELECT * FROM public.reserve_policy_for_workspace(%L::uuid)', v_ws),
    'RESERVE_POLICY_DRIFT', 'T-4B-10 percentual fora de 10/30 aborta');

  UPDATE public.fee_config SET reserve_percent = NULL, reserve_hold_days = NULL
   WHERE plan_type = 'creator';
  PERFORM qa4b.raises(
    format('SELECT * FROM public.reserve_policy_for_workspace(%L::uuid)', v_ws),
    'ausente/incompleto', 'T-4B-10 fee_config incompleto aborta');
  PERFORM qa4b.seed_reserve_policy();
END;
$t$;

-- ── T-4B-11: release ANTES do release_at mantém held ─────────────────────
DO $t$
DECLARE s jsonb; o uuid; ws uuid; v_id uuid; r jsonb; v_before bigint;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; ws := (s ->> 'workspace_id')::uuid;
  SELECT id INTO v_id FROM public.reserve_entries WHERE order_id = o;
  v_before := qa4b.total_balance(ws);

  r := public.release_reserve_entry(v_id);
  PERFORM qa4b.eq(r ->> 'outcome', 'NOT_DUE', 'T-4B-11 release antecipado recusado');
  PERFORM qa4b.eq(qa4b.reserve_status(o), 'held', 'T-4B-11 reserva segue held');
  PERFORM qa4b.eq(qa4b.total_balance(ws), v_before, 'T-4B-11 nenhum credito emitido');
  PERFORM qa4b.assert_reserve_invariant(o, 'T-4B-11');
END;
$t$;

-- ── T-4B-12/26: release DEPOIS do release_at credita uma única vez ────────
DO $t$
DECLARE s jsonb; o uuid; ws uuid; v_id uuid; r jsonb; v_net bigint; r2 jsonb;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; ws := (s ->> 'workspace_id')::uuid;
  v_net := qa4b.creator_net(o);
  SELECT id INTO v_id FROM public.reserve_entries WHERE order_id = o;

  -- Envelhece o relógio (settled_at/release_at), sem mexer no dinheiro.
  UPDATE public.reserve_entries
     SET settled_at = now() - interval '31 days',
         release_at = now() - interval '1 day'
   WHERE id = v_id;
  -- Torna a venda já disponível para que o crédito não fique preso em hold.
  UPDATE public.wallet_ledger SET available_at = now() - interval '1 day'
   WHERE workspace_id = ws;

  r := public.release_reserve_entry(v_id);
  PERFORM qa4b.eq(r ->> 'outcome', 'RELEASED', 'T-4B-12 reserva liberada');
  PERFORM qa4b.eq(qa4b.reserve_status(o), 'released', 'T-4B-26 status released');
  PERFORM qa4b.eq(qa4b.total_balance(ws), v_net,
    'T-4B-12 saldo volta a creator_net integral');

  r2 := public.release_reserve_entry(v_id);
  PERFORM qa4b.eq(r2 ->> 'outcome', 'ALREADY_PROCESSED', 'T-4B-12 replay do release');
  PERFORM qa4b.eq(qa4b.total_balance(ws), v_net, 'T-4B-12 credito nao duplica');
END;
$t$;

-- ── T-4B-13: reserva LEGADA (sem débito de segregação) fica retida ───────
DO $t$
DECLARE s jsonb; o uuid; ws uuid; v_id uuid; r jsonb; v_before bigint;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; ws := (s ->> 'workspace_id')::uuid;
  SELECT id INTO v_id FROM public.reserve_entries WHERE order_id = o;

  -- Simula o legado: reserva sem vínculo de débito.
  DELETE FROM public.wallet_ledger WHERE reserve_entry_id = v_id;
  UPDATE public.reserve_entries
     SET ledger_debit_id = NULL, release_at = now() - interval '1 day'
   WHERE id = v_id;
  v_before := qa4b.total_balance(ws);

  r := public.release_reserve_entry(v_id);
  PERFORM qa4b.eq(r ->> 'outcome', 'NEEDS_PRODUCT_DECISION',
    'T-4B-13 reserva legada nao credita');
  PERFORM qa4b.eq(qa4b.reserve_status(o), 'held', 'T-4B-13 permanece retida');
  PERFORM qa4b.eq(qa4b.total_balance(ws), v_before, 'T-4B-13 saldo inalterado');
END;
$t$;

-- ── T-4B-11b: release bloqueado por chargeback ativo ─────────────────────
DO $t$
DECLARE s jsonb; o uuid; p uuid; ws uuid; v_id uuid; r jsonb;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;
  ws := (s ->> 'workspace_id')::uuid;
  SELECT id INTO v_id FROM public.reserve_entries WHERE order_id = o;

  INSERT INTO public.chargeback_cases (workspace_id, order_id, payment_id, amount, status)
  VALUES (ws, o, p, 100.00, 'new');

  UPDATE public.reserve_entries SET release_at = now() - interval '1 day' WHERE id = v_id;
  r := public.release_reserve_entry(v_id);
  PERFORM qa4b.ok(r ->> 'outcome' IN ('HELD_CHARGEBACK', 'ORDER_NOT_ELIGIBLE'),
    'T-4B-11b chargeback ativo prorroga a reserva (outcome=' || (r ->> 'outcome') || ')');
  PERFORM qa4b.eq(qa4b.reserve_status(o), 'held', 'T-4B-11b segue retida');
END;
$t$;

-- ── T-4B-25/27: reserva parcialmente revertida e depois reconciliada ─────
DO $t$
DECLARE s jsonb; o uuid; p uuid; v_orig bigint; v_after bigint;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;
  v_orig := qa4b.reserve_amount(o);

  PERFORM qa4b.eq(qa4b.reserve_status(o), 'held', 'T-4B-25 reserva ativa');

  PERFORM public.process_refund_increment(o, p, 'qa4b-ref-lc', 5000, 10000);
  v_after := qa4b.reserve_amount(o);
  PERFORM qa4b.ok(v_after < v_orig AND v_after > 0,
    'T-4B-25 reserva parcialmente revertida (' || v_orig || ' -> ' || v_after || ')');
  PERFORM qa4b.assert_reserve_invariant(o, 'T-4B-25 pos-reversao parcial');

  -- Reversão total (segundo parcial fecha a cobrança)
  PERFORM public.process_refund_increment(o, p, 'qa4b-ref-lc2', 5000, 10000);
  PERFORM qa4b.eq(qa4b.reserve_held(o), 0::bigint, 'T-4B-27 reserva zerada');
  PERFORM qa4b.ok(qa4b.reserve_status(o) IN ('reversed', 'forfeited'),
    'T-4B-27 status final terminal (' || qa4b.reserve_status(o) || ')');
END;
$t$;

-- ── T-4B-27b: reserva já reconciliada não é reprocessada ─────────────────
DO $t$
DECLARE s jsonb; o uuid; v_id uuid; r jsonb;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid;
  SELECT id INTO v_id FROM public.reserve_entries WHERE order_id = o;
  UPDATE public.reserve_entries
     SET status = 'reconciled_legacy', reconciliation_note = 'qa4b'
   WHERE id = v_id;

  r := public.release_reserve_entry(v_id);
  PERFORM qa4b.eq(r ->> 'outcome', 'ALREADY_PROCESSED',
    'T-4B-27b reconciliada nao reprocessa');
END;
$t$;

ROLLBACK;
