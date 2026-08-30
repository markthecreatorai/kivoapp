-- ============================================================================
-- T-4B-28..33 — Grants das RPCs financeiras e isolamento de workspace (RLS)
-- Transacional: BEGIN … ROLLBACK. Nada persiste.
--
-- LIMITE DE VALIDADE: em cluster efêmero, auth.uid() é STUB (set_config). Os
-- resultados de RLS aqui valem como "integração local", NÃO como prova de
-- runtime PostgREST. Grants, ao contrário, são verdade absoluta do catálogo.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;
SELECT qa4b.assert_not_production();
SET LOCAL client_min_messages TO notice;

-- ── T-4B-28: nenhuma RPC financeira executável por PUBLIC/anon/authenticated
DO $t$
DECLARE
  v_sig text;
  v_fn text;
  v_role text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.settle_order_atomic(uuid,integer)',
    'public.process_refund_increment(uuid,uuid,text,integer,integer)',
    'public.resolve_chargeback_financials(uuid,uuid,text,integer,text,integer)',
    'public.reverse_reserve_entry(uuid,bigint,text,text)',
    'public.release_reserve_entry(uuid)',
    'public.reserve_policy_for_workspace(uuid)',
    'public.reserve_amount_cents(bigint,numeric)',
    'public.process_order_financials(uuid,integer,boolean)',
    'public.create_payout_request_atomic(uuid,uuid,uuid,integer,integer,integer,boolean,text,text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'ASSERT FALHOU: RPC financeira ausente: %', v_sig
        USING ERRCODE = '55000';
    END IF;

    FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
      PERFORM qa4b.eq(
        has_function_privilege(v_role, to_regprocedure(v_sig), 'EXECUTE'),
        false,
        format('T-4B-28 %s NAO executavel por %s', v_sig, v_role));
    END LOOP;

    PERFORM qa4b.eq(
      has_function_privilege('service_role', to_regprocedure(v_sig), 'EXECUTE'),
      true,
      format('T-4B-29 %s executavel por service_role', v_sig));
  END LOOP;
END;
$t$;

-- ── T-4B-30: tabelas financeiras com RLS habilitada ──────────────────────
DO $t$
DECLARE v_tab text;
BEGIN
  FOREACH v_tab IN ARRAY ARRAY[
    'wallet_ledger', 'reserve_entries', 'split_entries', 'refunds',
    'chargeback_cases', 'payout_requests', 'withdrawals', 'payments', 'orders'
  ] LOOP
    PERFORM qa4b.eq(
      (SELECT relrowsecurity FROM pg_class
        WHERE oid = ('public.' || v_tab)::regclass), true,
      format('T-4B-30 RLS habilitada em public.%s', v_tab));
    PERFORM qa4b.ok(
      EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = v_tab),
      format('T-4B-30 public.%s possui ao menos uma policy', v_tab));
  END LOOP;
END;
$t$;

-- ── T-4B-31: anon sem privilégio de leitura direta no ledger/reservas ────
DO $t$
DECLARE v_tab text; v_role text;
BEGIN
  FOREACH v_tab IN ARRAY ARRAY['wallet_ledger', 'reserve_entries', 'split_entries'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'public'] LOOP
      PERFORM qa4b.eq(
        has_table_privilege(v_role, ('public.' || v_tab)::regclass, 'SELECT'),
        false,
        format('T-4B-31 %s sem SELECT em public.%s', v_role, v_tab));
    END LOOP;
  END LOOP;
END;
$t$;

-- ── T-4B-32/33: isolamento cross-workspace sob RLS (integração local) ────
DO $t$
DECLARE
  s1 jsonb; s2 jsonb; ws1 uuid; ws2 uuid; u2 uuid; v_seen bigint;
BEGIN
  s1 := qa4b.mk_settled_order('FREE', 10000, 349);
  s2 := qa4b.mk_settled_order('FREE', 20000, 698);
  ws1 := (s1 ->> 'workspace_id')::uuid;
  ws2 := (s2 ->> 'workspace_id')::uuid;
  u2 := qa4b.owner_of(ws2);

  PERFORM qa4b.eq(public.is_workspace_member(ws1, u2), false,
    'T-4B-32 dono do ws2 nao e membro do ws1');
  PERFORM qa4b.eq(public.is_workspace_admin(ws2, u2), true,
    'T-4B-32 dono do ws2 e admin do proprio ws');

  -- Leitura com RLS forçada, impersonando o dono do ws2.
  PERFORM qa4b.act_as(u2);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_seen FROM public.wallet_ledger WHERE workspace_id = ws1;
    PERFORM qa4b.eq(v_seen, 0::bigint,
      'T-4B-33 ledger do ws1 invisivel para o dono do ws2');
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  — T-4B-33 leitura negada por privilegio (fail-closed)';
  END;
  RESET ROLE;
END;
$t$;

ROLLBACK;
