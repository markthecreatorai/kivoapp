-- ============================================================================
-- QA-4A-V7 — Fixtures do runner de CONCORRÊNCIA (commit real, banco descartável)
-- ----------------------------------------------------------------------------
-- Diferente dos arquivos 01..05, os cenários de concorrência precisam de COMMIT,
-- portanto exigem um banco DESCARTÁVEL com prefixo kivo_qa_conc*. Este arquivo
-- é aplicado UMA VEZ, após bootstrap + migrations + 10_fixtures.sql.
-- ============================================================================
\set ON_ERROR_STOP on

DO $guard$
BEGIN
  IF current_database() NOT LIKE 'kivo_qa_conc%' THEN
    RAISE EXCEPTION
      'ABORTADO: fixtures de concorrencia exigem banco kivo_qa_conc* (atual: %).',
      current_database();
  END IF;
END;
$guard$;

-- Contexto compartilhado entre as duas sessões psql do runner.
CREATE TABLE IF NOT EXISTS public.qa4b_ctx (
  workspace_id uuid,
  order_id uuid,
  payment_id uuid
);

CREATE OR REPLACE FUNCTION qa4b.conc_new_paid_order()
RETURNS TABLE (workspace_id uuid, order_id uuid, payment_id uuid)
LANGUAGE plpgsql AS $$
DECLARE v_ws uuid; v_o uuid; v_p uuid;
BEGIN
  PERFORM qa4b.seed_reserve_policy();
  v_ws := qa4b.mk_workspace('FREE');
  v_o := qa4b.mk_order(v_ws, 10000);
  v_p := qa4b.mk_payment(v_o);
  RETURN QUERY SELECT v_ws, v_o, v_p;
END;
$$;

CREATE OR REPLACE FUNCTION qa4b.conc_new_settled_order()
RETURNS TABLE (workspace_id uuid, order_id uuid, payment_id uuid)
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM qa4b.conc_new_paid_order();
  PERFORM public.settle_order_atomic(r.order_id, 349);
  RETURN QUERY SELECT r.workspace_id, r.order_id, r.payment_id;
END;
$$;

-- Saldo disponível sintético (sem reserva retida) para o cenário de saque.
CREATE OR REPLACE FUNCTION qa4b.conc_new_available_balance(p_cents integer)
RETURNS TABLE (workspace_id uuid, order_id uuid, payment_id uuid)
LANGUAGE plpgsql AS $$
DECLARE v_ws uuid; v_o uuid; v_p uuid;
BEGIN
  PERFORM qa4b.seed_reserve_policy();
  v_ws := qa4b.mk_workspace('FREE');
  v_o := qa4b.mk_order(v_ws, p_cents);
  v_p := qa4b.mk_payment(v_o);
  INSERT INTO public.wallet_ledger (
    workspace_id, order_id, type, amount, currency, status, available_at, description)
  VALUES (v_ws, v_o, 'sale', p_cents, 'BRL', 'available',
          now() - interval '1 day', 'qa4b saldo sintetico disponivel');
  RETURN QUERY SELECT v_ws, v_o, v_p;
END;
$$;

-- Pedido de saque usando o workspace corrente do contexto.
-- Cada chamada usa idempotency_key distinta: o teste prova que o LOCK de saldo
-- impede duplo gasto, não que a idempotência deduplica.
CREATE OR REPLACE FUNCTION qa4b.conc_request_withdrawal(p_cents integer)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_ws uuid; v_user uuid; v_bank uuid;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.qa4b_ctx LIMIT 1;
  v_user := qa4b.owner_of(v_ws);

  SELECT id INTO v_bank FROM public.bank_accounts WHERE workspace_id = v_ws LIMIT 1;
  IF v_bank IS NULL THEN
    INSERT INTO public.bank_accounts (
      workspace_id, bank_code, bank_name, account_type, agency, account_number,
      holder_name, holder_document)
    VALUES (v_ws, '001', 'qa4b Bank', 'CHECKING', '0001', '123456-7',
            'QA4B Holder', '00000000000')
    RETURNING id INTO v_bank;
  END IF;

  RETURN public.create_payout_request_atomic(
    p_workspace_id    => v_ws,
    p_bank_account_id => v_bank,
    p_requested_by    => v_user,
    p_amount          => p_cents,
    p_fee             => 0,
    p_net_amount      => p_cents,
    p_auto_approve    => false,
    p_idempotency_key => 'qa4b-conc-' || gen_random_uuid()::text
  );
END;
$$;

-- Invariante global: para todo pedido liquidado, saldo + reserva retida = net.
CREATE OR REPLACE FUNCTION qa4b.conc_invariant_ok() RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT order_id FROM public.qa4b_ctx WHERE order_id IS NOT NULL LOOP
    BEGIN
      PERFORM qa4b.assert_reserve_invariant(r.order_id, 'concorrencia');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'invariante violada no pedido %: %', r.order_id, SQLERRM;
      RETURN false;
    END;
  END LOOP;
  RETURN true;
END;
$$;

-- Nenhum workspace do contexto pode ficar com saldo negativo.
CREATE OR REPLACE FUNCTION qa4b.conc_no_overdraft() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.qa4b_ctx c
     WHERE qa4b.total_balance(c.workspace_id) < 0
        OR qa4b.available_balance(c.workspace_id) < 0
  );
$$;
