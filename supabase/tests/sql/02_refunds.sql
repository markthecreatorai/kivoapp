-- ============================================================================
-- T-4B-14..20 — Refund parcial, parciais sucessivos, replay, colisão e total
-- Transacional: BEGIN … ROLLBACK. Nada persiste.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;
SELECT qa4b.assert_not_production();
SET LOCAL client_min_messages TO notice;

-- ── T-4B-14a: refund parcial único ────────────────────────────────────────
DO $t$
DECLARE s jsonb; o uuid; p uuid; r jsonb; v_net_before bigint;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;
  v_net_before := qa4b.creator_net(o);

  r := public.process_refund_increment(o, p, 'qa4b-ref-1', 2000, 10000);
  PERFORM qa4b.ok(r ->> 'outcome' IS DISTINCT FROM 'duplicate',
    'T-4B-14a primeiro refund nao e duplicate');
  PERFORM qa4b.eq((r ->> 'refund_total')::boolean, false, 'T-4B-14a parcial');
  PERFORM qa4b.eq((r ->> 'accumulated_cents')::int, 2000, 'T-4B-14a acumulado 2000');
  PERFORM qa4b.ok(qa4b.creator_net(o) < v_net_before,
    'T-4B-14a creator_net reduzido');
  PERFORM qa4b.assert_reserve_invariant(o, 'T-4B-14a pos-refund parcial');
END;
$t$;

-- ── T-4B-14b: dois refunds parciais sucessivos são CUMULATIVOS ─────────────
DO $t$
DECLARE s jsonb; o uuid; p uuid; r1 jsonb; r2 jsonb;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;

  r1 := public.process_refund_increment(o, p, 'qa4b-ref-a', 2000, 10000);
  r2 := public.process_refund_increment(o, p, 'qa4b-ref-b', 2000, 10000);

  PERFORM qa4b.eq((r1 ->> 'accumulated_cents')::int, 2000, 'T-4B-14b acumulado 1 = 2000');
  PERFORM qa4b.eq((r2 ->> 'accumulated_cents')::int, 4000, 'T-4B-14b acumulado 2 = 4000');
  PERFORM qa4b.eq((SELECT round(sum(amount) * 100)::int FROM public.refunds
                    WHERE order_id = o AND status = 'PROCESSED'), 4000,
    'T-4B-14b soma persistida = 4000 centavos');
  PERFORM qa4b.eq((r2 ->> 'refund_total')::boolean, false, 'T-4B-14b ainda parcial');
  PERFORM qa4b.assert_reserve_invariant(o, 'T-4B-14b pos dois parciais');
END;
$t$;

-- ── T-4B-16: replay idêntico converge (reparo, nunca duplicidade) ──────────
DO $t$
DECLARE s jsonb; o uuid; p uuid; v_hash text; r jsonb;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;

  PERFORM public.process_refund_increment(o, p, 'qa4b-ref-dup', 3000, 10000);
  v_hash := qa4b.snapshot_hash(o);

  r := public.process_refund_increment(o, p, 'qa4b-ref-dup', 3000, 10000);
  PERFORM qa4b.eq(r ->> 'outcome', 'duplicate', 'T-4B-16 replay retorna duplicate');
  PERFORM qa4b.eq((r ->> 'accumulated_cents')::int, 3000,
    'T-4B-16 acumulado nao dobra');
  PERFORM qa4b.eq((SELECT count(*) FROM public.refunds
                    WHERE order_id = o AND gateway_refund_id = 'qa4b-ref-dup'),
    1::bigint, 'T-4B-16 uma unica linha de refund');
  PERFORM qa4b.eq(qa4b.snapshot_hash(o), v_hash,
    'T-4B-16 replay convergente: estado identico');
  PERFORM qa4b.assert_reserve_invariant(o, 'T-4B-16 pos-replay');
END;
$t$;

-- ── T-4B-16b: replay REPARA reserva desalinhada (convergência real) ────────
DO $t$
DECLARE s jsonb; o uuid; p uuid; r jsonb; v_res bigint; v_net bigint;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;
  PERFORM public.process_refund_increment(o, p, 'qa4b-ref-rep', 4000, 10000);

  -- Simula o desenho antigo: reserva "esquecida" no valor original.
  UPDATE public.reserve_entries
     SET amount = original_amount, status = 'held'
   WHERE order_id = o;

  r := public.process_refund_increment(o, p, 'qa4b-ref-rep', 4000, 10000);
  PERFORM qa4b.eq(r ->> 'outcome', 'duplicate', 'T-4B-16b replay reconhecido');
  v_res := qa4b.reserve_amount(o);
  v_net := qa4b.creator_net(o);
  PERFORM qa4b.eq(v_res, public.reserve_amount_cents(v_net, 10),
    'T-4B-16b reserva reparada para 10% do remanescente');
END;
$t$;

-- ── T-4B-18/19/20: colisão de gateway_refund_id falha ANTES de efeitos ─────
DO $t$
DECLARE
  s jsonb; o uuid; p uuid; p_other uuid; v_hash text; v_ws uuid; o2 uuid;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;
  v_ws := (s ->> 'workspace_id')::uuid;
  PERFORM public.process_refund_increment(o, p, 'qa4b-ref-col', 2500, 10000);
  v_hash := qa4b.snapshot_hash(o);

  -- (18) payment_id divergente para o mesmo refund id do mesmo pedido
  o2 := qa4b.mk_order(v_ws, 10000);
  p_other := qa4b.mk_payment(o2);
  UPDATE public.payments SET order_id = o WHERE id = p_other;
  PERFORM qa4b.raises(
    format('SELECT public.process_refund_increment(%L::uuid, %L::uuid, %L, 2500, 10000)',
           o, p_other, 'qa4b-ref-col'),
    'REFUND_CORRELATION_MISMATCH', 'T-4B-18 payment divergente falha fechado');

  -- (19) valor divergente
  PERFORM qa4b.raises(
    format('SELECT public.process_refund_increment(%L::uuid, %L::uuid, %L, 2400, 10000)',
           o, p, 'qa4b-ref-col'),
    'REFUND_CORRELATION_MISMATCH', 'T-4B-19 valor divergente falha fechado');

  -- (20) status divergente do registro persistido
  UPDATE public.refunds SET status = 'PENDING'
   WHERE order_id = o AND gateway_refund_id = 'qa4b-ref-col';
  PERFORM qa4b.raises(
    format('SELECT public.process_refund_increment(%L::uuid, %L::uuid, %L, 2500, 10000)',
           o, p, 'qa4b-ref-col'),
    'REFUND_CORRELATION_MISMATCH', 'T-4B-20 status != PROCESSED falha fechado');
  UPDATE public.refunds SET status = 'PROCESSED'
   WHERE order_id = o AND gateway_refund_id = 'qa4b-ref-col';

  PERFORM qa4b.eq(qa4b.snapshot_hash(o), v_hash,
    'T-4B-18/19/20 nenhuma escrita sobreviveu as colisoes');
END;
$t$;

-- ── T-4B-15: over-refund aborta (rollback do incremento) ──────────────────
DO $t$
DECLARE s jsonb; o uuid; p uuid; v_hash text;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;
  PERFORM public.process_refund_increment(o, p, 'qa4b-ref-o1', 6000, 10000);
  v_hash := qa4b.snapshot_hash(o);

  PERFORM qa4b.raises(
    format('SELECT public.process_refund_increment(%L::uuid, %L::uuid, %L, 6000, 10000)',
           o, p, 'qa4b-ref-o2'),
    'over-refund', 'T-4B-15 over-refund levanta excecao');
  PERFORM qa4b.eq(qa4b.snapshot_hash(o), v_hash,
    'T-4B-15 estado inalterado apos over-refund');
  PERFORM qa4b.eq((SELECT count(*) FROM public.refunds
                    WHERE order_id = o AND gateway_refund_id = 'qa4b-ref-o2'),
    0::bigint, 'T-4B-15 linha de auditoria do over-refund revertida');
END;
$t$;

-- ── T-4B-17: refund total após parcial cancela a venda e reverte a reserva ─
DO $t$
DECLARE s jsonb; o uuid; p uuid; r jsonb; v_ws uuid;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;
  v_ws := (s ->> 'workspace_id')::uuid;

  PERFORM public.process_refund_increment(o, p, 'qa4b-ref-t1', 3000, 10000);
  r := public.process_refund_increment(o, p, 'qa4b-ref-t2', 7000, 10000);

  PERFORM qa4b.eq((r ->> 'refund_total')::boolean, true, 'T-4B-17 detecta total');
  PERFORM qa4b.eq((r ->> 'accumulated_cents')::int, 10000, 'T-4B-17 acumulado = cobranca');
  PERFORM qa4b.eq(qa4b.reserve_held(o), 0::bigint, 'T-4B-17 reserva nao mais retida');
  PERFORM qa4b.eq(qa4b.total_balance(v_ws), 0::bigint,
    'T-4B-17 saldo do workspace volta a zero');
END;
$t$;

ROLLBACK;
