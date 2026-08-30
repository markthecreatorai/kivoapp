-- ============================================================================
-- T-4B-21..24 — Chargeback novo, replay idêntico e colisão divergente
-- Transacional: BEGIN … ROLLBACK. Nada persiste.
--
-- NOTA: a política do gap (bruto − creator_net) NÃO é decidida aqui. Os testes
-- apenas fixam o comportamento vigente: débito econômico limitado a creator_net
-- (cancelamento da venda) e trilha do bruto em status 'canceled'.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;
SELECT qa4b.assert_not_production();
SET LOCAL client_min_messages TO notice;

-- ── T-4B-21: chargeback novo ───────────────────────────────────────────────
DO $t$
DECLARE s jsonb; o uuid; p uuid; ws uuid; r jsonb;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;
  ws := (s ->> 'workspace_id')::uuid;

  r := public.resolve_chargeback_financials(o, p, 'qa4b-disp-1', 10000, 'Chargeback qa4b', 7);

  PERFORM qa4b.eq(r ->> 'outcome', 'APPLIED', 'T-4B-21 chargeback aplicado');
  PERFORM qa4b.eq((SELECT amount FROM public.chargeback_cases
                    WHERE gateway_dispute_id = 'qa4b-disp-1'), 100.00::numeric,
    'T-4B-21 chargeback_cases.amount em REAIS');
  PERFORM qa4b.eq((SELECT status FROM public.wallet_ledger
                    WHERE order_id = o AND type = 'sale'), 'canceled',
    'T-4B-21 venda cancelada');
  PERFORM qa4b.eq((SELECT status FROM public.wallet_ledger
                    WHERE order_id = o AND type = 'chargeback'), 'canceled',
    'T-4B-21 trilha do bruto sem efeito em saldo');
  PERFORM qa4b.eq(qa4b.total_balance(ws), 0::bigint,
    'T-4B-21 debito economico limitado a creator_net (saldo zero, sem dobra)');
  PERFORM qa4b.eq(qa4b.reserve_held(o), 0::bigint, 'T-4B-21 reserva nao mais retida');
  PERFORM qa4b.eq((SELECT status FROM public.orders WHERE id = o), 'DISPUTED',
    'T-4B-21 pedido em DISPUTED');
END;
$t$;

-- ── T-4B-22: replay idêntico é idempotente ────────────────────────────────
DO $t$
DECLARE s jsonb; o uuid; p uuid; ws uuid; v_hash text; r jsonb;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;
  ws := (s ->> 'workspace_id')::uuid;

  PERFORM public.resolve_chargeback_financials(o, p, 'qa4b-disp-2', 10000);
  v_hash := qa4b.snapshot_hash(o);

  r := public.resolve_chargeback_financials(o, p, 'qa4b-disp-2', 10000);
  PERFORM qa4b.eq(r ->> 'outcome', 'ALREADY_PROCESSED', 'T-4B-22 replay idempotente');
  PERFORM qa4b.eq((SELECT count(*) FROM public.chargeback_cases
                    WHERE gateway_dispute_id = 'qa4b-disp-2'), 1::bigint,
    'T-4B-22 um unico caso');
  PERFORM qa4b.eq(qa4b.snapshot_hash(o), v_hash, 'T-4B-22 estado identico');
  PERFORM qa4b.eq(qa4b.total_balance(ws), 0::bigint, 'T-4B-22 saldo nao dobra');
END;
$t$;

-- ── T-4B-23: colisão divergente falha fechado (order/payment/amount) ──────
DO $t$
DECLARE
  s1 jsonb; s2 jsonb; o1 uuid; p1 uuid; o2 uuid; p2 uuid; v_hash text;
BEGIN
  s1 := qa4b.mk_settled_order('FREE', 10000, 349);
  o1 := (s1 ->> 'order_id')::uuid; p1 := (s1 ->> 'payment_id')::uuid;
  s2 := qa4b.mk_settled_order('FREE', 10000, 349);
  o2 := (s2 ->> 'order_id')::uuid; p2 := (s2 ->> 'payment_id')::uuid;

  PERFORM public.resolve_chargeback_financials(o1, p1, 'qa4b-disp-col', 10000);
  v_hash := qa4b.snapshot_hash(o2);

  -- pedido/pagamento/workspace divergentes com o mesmo dispute id
  PERFORM qa4b.raises(
    format('SELECT public.resolve_chargeback_financials(%L::uuid, %L::uuid, %L, 10000)',
           o2, p2, 'qa4b-disp-col'),
    'DISPUTE_CORRELATION_MISMATCH', 'T-4B-23a order/workspace divergente falha fechado');

  -- valor divergente para o mesmo dispute id e mesmo pedido
  UPDATE public.payments SET amount = 90.00 WHERE id = p1;
  PERFORM qa4b.raises(
    format('SELECT public.resolve_chargeback_financials(%L::uuid, %L::uuid, %L, 9000)',
           o1, p1, 'qa4b-disp-col'),
    'DISPUTE_CORRELATION_MISMATCH', 'T-4B-23b valor divergente falha fechado');
  UPDATE public.payments SET amount = 100.00 WHERE id = p1;

  PERFORM qa4b.eq(qa4b.snapshot_hash(o2), v_hash,
    'T-4B-23 nenhuma escrita no pedido invadido');
END;
$t$;

-- ── T-4B-24: guardas de payload ───────────────────────────────────────────
DO $t$
DECLARE s jsonb; o uuid; p uuid;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;

  PERFORM qa4b.raises(
    format('SELECT public.resolve_chargeback_financials(%L::uuid, %L::uuid, NULL, 10000)', o, p),
    'gateway_dispute_id obrigatorio', 'T-4B-24a dispute id ausente falha fechado');

  PERFORM qa4b.raises(
    format('SELECT public.resolve_chargeback_financials(%L::uuid, %L::uuid, %L, 9999)',
           o, p, 'qa4b-disp-x'),
    'valor divergente', 'T-4B-24b valor != payments.amount falha fechado');

  PERFORM qa4b.raises(
    format('SELECT public.resolve_chargeback_financials(%L::uuid, %L::uuid, %L, 10000, %L, 31)',
           o, p, 'qa4b-disp-y', 'Chargeback'),
    'SLA invalido', 'T-4B-24c SLA fora de 1..30 falha fechado');

  PERFORM qa4b.eq((SELECT count(*) FROM public.chargeback_cases WHERE order_id = o),
    0::bigint, 'T-4B-24 nenhum caso criado pelos payloads invalidos');
END;
$t$;

-- ── T-4B-24d: chargeback após refund parcial não dobra o débito ───────────
DO $t$
DECLARE s jsonb; o uuid; p uuid; ws uuid;
BEGIN
  s := qa4b.mk_settled_order('FREE', 10000, 349);
  o := (s ->> 'order_id')::uuid; p := (s ->> 'payment_id')::uuid;
  ws := (s ->> 'workspace_id')::uuid;

  PERFORM public.process_refund_increment(o, p, 'qa4b-ref-cb', 3000, 10000);
  PERFORM public.resolve_chargeback_financials(o, p, 'qa4b-disp-3', 10000);

  PERFORM qa4b.eq(qa4b.total_balance(ws), 0::bigint,
    'T-4B-24d refund parcial + chargeback = saldo zero, sem debito dobrado');
END;
$t$;

ROLLBACK;
