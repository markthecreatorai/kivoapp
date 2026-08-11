-- ============================================================================
-- Onda 4 — Carteira, saques, reservas e chargebacks (hardening)
-- NÃO APLICADA nesta rodada (homologação sem migration aplicada).
--
-- Achados que esta migration corrige:
--
-- P0-WA-01  Regressão da regra canônica de saldo. A migration de hardening de
--           RPC 20260811033030 reescreveu public.get_wallet_balance com
--           `SUM(amount)` cru e `settled` somando no disponível, revertendo
--           silenciosamente a regra canônica de 20260808072056 (a mesma que
--           supabase/functions/_shared/wallet-balance.ts implementa).
--           Efeito real: como create-payout-request grava o débito de saque com
--           amount POSITIVO ("tipo withdrawal é tratado como débito"), o saque
--           passou a SOMAR no saldo disponível — cada saque inflava a carteira
--           em vez de reduzi-la. Idem para 'fee', 'refund' e 'chargeback'.
--
-- P0-WA-02  Duas convenções de sinal convivendo: a Edge Function grava
--           withdrawal positivo e o CashOutModal (escrita direta do cliente)
--           gravava negativo. Sem normalização, qualquer soma está errada em um
--           dos dois caminhos. Passa a existir UMA convenção no banco.
--
-- P0-WA-03  `withdrawals` aceitava INSERT direto do cliente (tabela legada, sem
--           validação de saldo, sem posse da conta bancária e sem processador).
--           Vira somente leitura: o fluxo oficial é payout_requests.
--
-- P0-WA-04  Criação de saque não era transacional (SELECT saldo → INSERT).
--           Duas requisições concorrentes liam o mesmo saldo e criavam dois
--           saques. Agora há advisory lock por workspace + recálculo dentro da
--           transação + débito no ledger no mesmo commit.
--
-- P1-WA-05  Aprovação/rejeição de saque pelo admin era UPDATE direto do
--           cliente, bloqueado por RLS (a tabela só tem política de SELECT):
--           o botão "aprovar" era um no-op silencioso. Agora é RPC server-side,
--           somente admin, revisor ≠ solicitante, transições válidas.
--
-- P1-WA-06  `calculate_payout_risk` filtrava payout_requests por status
--           inexistentes ('requested','paid') — a trava de velocidade nunca via
--           os saques reais (pending/in_review/approved/completed).
--
-- P0-WA-09  Resolução de chargeback era uma sequência de writes do cliente
--           (chargeback_cases → chargeback_timeline → split_entries →
--           wallet_ledger), sem atomicidade, sem checagem de admin no servidor,
--           sem transição válida e sem idempotência — e bloqueada pela RLS, que
--           só permite SELECT nessas tabelas. Pior: ao GANHAR a disputa o fluxo
--           restaurava split_entries e cancelava o débito de chargeback, mas
--           deixava o crédito da venda como 'canceled' (o webhook o cancela) e a
--           reserva como 'forfeited' — o produtor ficava sem o dinheiro mesmo
--           vencendo. Agora é RPC transacional que devolve venda e reserva.
--
-- P1-WA-07  Grants excessivos: anon com DML completo em withdrawals, refunds,
--           payout_items e chargeback_cases (bloqueado apenas pela RLS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Convenção única de sinal no wallet_ledger
--    Débitos ('withdrawal','fee','refund','chargeback') são SEMPRE armazenados
--    com valor absoluto e subtraídos na leitura. Créditos ('sale','adjustment')
--    mantêm o sinal informado (adjustment negativo continua sendo débito).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_wallet_ledger_normalize_sign()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.type IN ('withdrawal', 'fee', 'refund', 'chargeback') THEN
    NEW.amount := abs(NEW.amount);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_ledger_normalize_sign ON public.wallet_ledger;
CREATE TRIGGER trg_wallet_ledger_normalize_sign
  BEFORE INSERT OR UPDATE OF amount, type ON public.wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.fn_wallet_ledger_normalize_sign();

-- Normaliza o histórico (base atual é de homologação; idempotente).
UPDATE public.wallet_ledger
   SET amount = abs(amount)
 WHERE type IN ('withdrawal', 'fee', 'refund', 'chargeback')
   AND amount < 0;

-- ---------------------------------------------------------------------------
-- 2. get_wallet_balance — regra canônica restaurada (espelha wallet-balance.ts)
--    Status reais: pending | available | settled | canceled
--      pending   -> em hold; se available_at já venceu, conta como disponível
--      available -> liberado
--      settled   -> informativo (já refletido em outro lançamento) → não soma
--      canceled  -> ignorado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_workspace_id uuid)
RETURNS TABLE(available_balance bigint, pending_balance bigint, total_balance bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- service_role (chamadas internas) não tem auth.uid(); usuário precisa de membership
  IF auth.uid() IS NOT NULL AND NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado ao workspace';
  END IF;

  RETURN QUERY
  WITH signed AS (
    SELECT
      wl.status,
      wl.available_at,
      CASE
        WHEN wl.type IN ('withdrawal', 'fee', 'refund', 'chargeback') THEN -abs(wl.amount)
        ELSE wl.amount
      END AS signed_amount
    FROM public.wallet_ledger wl
    WHERE wl.workspace_id = p_workspace_id
      AND wl.status IN ('pending', 'available')
  )
  SELECT
    COALESCE(SUM(CASE
      WHEN status = 'available'
        OR (status = 'pending' AND available_at IS NOT NULL AND available_at <= now())
      THEN signed_amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE
      WHEN status = 'pending' AND (available_at IS NULL OR available_at > now())
      THEN signed_amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(signed_amount), 0)::bigint
  FROM signed;
END;
$$;

REVOKE ALL ON FUNCTION public.get_wallet_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. calculate_payout_risk — status reais de payout_requests
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_payout_risk(p_workspace_id uuid)
RETURNS TABLE(risk_score integer, risk_flags jsonb, recent_chargebacks bigint,
              refund_ratio numeric, payout_count_today bigint, payout_total_today bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chargebacks bigint;
  v_refunded bigint;
  v_total bigint;
  v_payout_cnt bigint;
  v_payout_total bigint;
  v_score integer := 0;
  v_flags jsonb := '[]'::jsonb;
  v_ratio numeric := 0;
BEGIN
  SELECT COUNT(*) INTO v_chargebacks FROM split_entries
    WHERE workspace_id = p_workspace_id AND status = 'refunded'
      AND refunded_at > now() - interval '30 days';

  SELECT COUNT(*) FILTER (WHERE status = 'refunded'), COUNT(*)
    INTO v_refunded, v_total
    FROM split_entries WHERE workspace_id = p_workspace_id;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_payout_cnt, v_payout_total
    FROM payout_requests
    WHERE workspace_id = p_workspace_id
      -- status reais: pending | in_review | approved | processing | completed | failed
      AND status IN ('pending','in_review','approved','processing','completed')
      AND created_at::date = CURRENT_DATE;

  IF v_chargebacks > 3 THEN v_score := v_score + 40;
  ELSIF v_chargebacks > 0 THEN v_score := v_score + 20; END IF;

  IF v_total > 0 THEN
    v_ratio := ROUND(v_refunded::numeric / v_total, 4);
    IF v_ratio > 0.15 THEN v_score := v_score + 30;
    ELSIF v_ratio > 0.05 THEN v_score := v_score + 15; END IF;
  END IF;

  IF v_payout_cnt >= 3 THEN v_score := v_score + 20;
  ELSIF v_payout_cnt >= 2 THEN v_score := v_score + 10; END IF;

  IF v_chargebacks > 0 THEN
    v_flags := v_flags || jsonb_build_object('flag', 'recent_chargebacks', 'count', v_chargebacks);
  END IF;
  IF v_ratio > 0.05 THEN
    v_flags := v_flags || jsonb_build_object('flag', 'high_refund_ratio', 'ratio', v_ratio);
  END IF;
  IF v_payout_cnt >= 2 THEN
    v_flags := v_flags || jsonb_build_object('flag', 'velocity_limit', 'count', v_payout_cnt);
  END IF;

  RETURN QUERY SELECT v_score, v_flags, v_chargebacks, v_ratio, v_payout_cnt, v_payout_total;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_payout_risk(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_payout_risk(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Idempotência do débito de saque no ledger
--    Um único lançamento 'withdrawal' por payout_request (chave na description).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_ledger_withdrawal_description
  ON public.wallet_ledger (workspace_id, description)
  WHERE type = 'withdrawal';

-- ---------------------------------------------------------------------------
-- 5. create_payout_request_atomic — criação de saque em UMA transação
--    Advisory lock por workspace: elimina a corrida entre validar saldo e
--    inserir o saque (dois cliques simultâneos criavam dois saques).
--    Retorna jsonb discriminado; nunca lança para erro de negócio esperado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_payout_request_atomic(
  p_workspace_id uuid,
  p_bank_account_id uuid,
  p_requested_by uuid,
  p_amount integer,
  p_fee integer,
  p_net_amount integer,
  p_auto_approve boolean,
  p_idempotency_key text,
  p_review_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_available bigint;
  v_locked bigint;
  v_spendable bigint;
  v_existing public.payout_requests;
  v_row public.payout_requests;
  v_status text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('outcome', 'INVALID_AMOUNT');
  END IF;
  IF p_net_amount IS NULL OR p_net_amount <= 0 THEN
    RETURN jsonb_build_object('outcome', 'FEE_EXCEEDS_AMOUNT');
  END IF;

  -- Serializa saques do mesmo workspace dentro da transação.
  PERFORM pg_advisory_xact_lock(hashtextextended('payout:' || p_workspace_id::text, 0));

  -- Replay pela chave de idempotência.
  SELECT * INTO v_existing FROM public.payout_requests
   WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'DUPLICATE',
      'payout_request_id', v_existing.id,
      'status', v_existing.status
    );
  END IF;

  -- Conta bancária tem de ser do próprio workspace (fail-closed).
  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts
     WHERE id = p_bank_account_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('outcome', 'BANK_ACCOUNT_MISMATCH');
  END IF;

  -- Saldo disponível pela regra canônica, já dentro do lock.
  SELECT available_balance INTO v_available
    FROM public.get_wallet_balance(p_workspace_id);
  v_available := COALESCE(v_available, 0);

  -- Saques abertos que ainda não debitaram o ledger travam saldo.
  SELECT COALESCE(SUM(pr.amount), 0)::bigint INTO v_locked
    FROM public.payout_requests pr
   WHERE pr.workspace_id = p_workspace_id
     AND pr.status IN ('pending','in_review','approved','processing')
     AND NOT EXISTS (
       SELECT 1 FROM public.wallet_ledger wl
        WHERE wl.workspace_id = pr.workspace_id
          AND wl.type = 'withdrawal'
          AND wl.description = 'Saque ' || pr.id::text
          AND wl.status <> 'canceled'
     );

  v_spendable := v_available - COALESCE(v_locked, 0);
  IF p_amount > v_spendable THEN
    RETURN jsonb_build_object(
      'outcome', 'INSUFFICIENT_BALANCE',
      'available_balance_cents', v_available,
      'locked_in_review_cents', COALESCE(v_locked, 0),
      'spendable_cents', GREATEST(v_spendable, 0)
    );
  END IF;

  v_status := CASE WHEN p_auto_approve THEN 'approved' ELSE 'pending' END;

  INSERT INTO public.payout_requests (
    workspace_id, bank_account_id, requested_by, amount, fee, net_amount,
    status, idempotency_key, review_reason, reviewed_at
  ) VALUES (
    p_workspace_id, p_bank_account_id, p_requested_by, p_amount, p_fee, p_net_amount,
    v_status, p_idempotency_key,
    CASE WHEN p_auto_approve THEN NULL ELSE COALESCE(p_review_reason, 'Revisão manual (política padrão Kivo)') END,
    CASE WHEN p_auto_approve THEN now() ELSE NULL END
  )
  RETURNING * INTO v_row;

  -- Débito imediato só quando aprovado automaticamente; mesmo commit do saque.
  IF p_auto_approve THEN
    INSERT INTO public.wallet_ledger (
      workspace_id, type, amount, currency, status, available_at, description
    ) VALUES (
      p_workspace_id, 'withdrawal', p_amount, 'BRL', 'available', now(),
      'Saque ' || v_row.id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'CREATED',
    'payout_request_id', v_row.id,
    'status', v_row.status,
    'amount_cents', v_row.amount,
    'fee_cents', v_row.fee,
    'net_amount_cents', v_row.net_amount,
    'auto_approved', p_auto_approve,
    'available_balance_cents', CASE WHEN p_auto_approve THEN v_available - p_amount ELSE v_available END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_payout_request_atomic(uuid, uuid, uuid, integer, integer, integer, boolean, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payout_request_atomic(uuid, uuid, uuid, integer, integer, integer, boolean, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. review_payout_request — aprovação/rejeição server-side
--    Somente admin da plataforma (public.is_admin_user), revisor ≠ solicitante,
--    transições válidas e débito/estorno do ledger no mesmo commit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_payout_request(
  p_payout_request_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.payout_requests;
  v_desc text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('outcome', 'INVALID_ACTION');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('payout_review:' || p_payout_request_id::text, 0));

  SELECT * INTO v_req FROM public.payout_requests WHERE id = p_payout_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  -- Segregação de função: quem pediu não aprova.
  IF v_req.requested_by = v_uid THEN
    RETURN jsonb_build_object('outcome', 'SELF_REVIEW_FORBIDDEN');
  END IF;

  IF v_req.status NOT IN ('pending', 'in_review') THEN
    RETURN jsonb_build_object('outcome', 'INVALID_TRANSITION', 'status', v_req.status);
  END IF;

  v_desc := 'Saque ' || v_req.id::text;

  IF p_action = 'approve' THEN
    UPDATE public.payout_requests
       SET status = 'approved',
           reviewed_at = now(),
           reviewed_by = v_uid,
           review_reason = COALESCE(p_reason, review_reason)
     WHERE id = v_req.id;

    -- Débito idempotente (índice único cobre concorrência).
    IF NOT EXISTS (
      SELECT 1 FROM public.wallet_ledger
       WHERE workspace_id = v_req.workspace_id
         AND type = 'withdrawal'
         AND description = v_desc
         AND status <> 'canceled'
    ) THEN
      INSERT INTO public.wallet_ledger (
        workspace_id, type, amount, currency, status, available_at, description
      ) VALUES (
        v_req.workspace_id, 'withdrawal', v_req.amount, 'BRL', 'available', now(), v_desc
      )
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN jsonb_build_object('outcome', 'APPROVED', 'payout_request_id', v_req.id);
  END IF;

  UPDATE public.payout_requests
     SET status = 'failed',
         reviewed_at = now(),
         reviewed_by = v_uid,
         review_reason = COALESCE(p_reason, 'Rejeitado na revisão de risco'),
         failed_reason = COALESCE(p_reason, 'Rejeitado na revisão de risco')
   WHERE id = v_req.id;

  -- Rejeição devolve o saldo: cancela qualquer débito já lançado.
  UPDATE public.wallet_ledger
     SET status = 'canceled'
   WHERE workspace_id = v_req.workspace_id
     AND type = 'withdrawal'
     AND description = v_desc
     AND status <> 'canceled';

  RETURN jsonb_build_object('outcome', 'REJECTED', 'payout_request_id', v_req.id);
END;
$$;

REVOKE ALL ON FUNCTION public.review_payout_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_payout_request(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. `withdrawals` legada vira somente leitura
--    Nenhum job processa esta tabela; o INSERT direto do cliente criava
--    solicitações fantasma, sem saldo validado e sem contrapartida no ledger.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS withdrawals_insert_own_workspace ON public.withdrawals;
DROP POLICY IF EXISTS "Workspace admins can create withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Users can create withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS withdrawals_insert ON public.withdrawals;

REVOKE ALL ON TABLE public.withdrawals FROM anon, authenticated;
GRANT SELECT ON TABLE public.withdrawals TO authenticated;
GRANT ALL ON TABLE public.withdrawals TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Grants excessivos em tabelas financeiras (anon não escreve dinheiro)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.refunds FROM anon, authenticated;
GRANT SELECT ON TABLE public.refunds TO authenticated;
GRANT ALL ON TABLE public.refunds TO service_role;

REVOKE ALL ON TABLE public.chargeback_cases FROM anon, authenticated;
GRANT SELECT ON TABLE public.chargeback_cases TO authenticated;
GRANT ALL ON TABLE public.chargeback_cases TO service_role;

REVOKE ALL ON TABLE public.payout_items FROM anon, authenticated;
GRANT SELECT ON TABLE public.payout_items TO authenticated;
GRANT ALL ON TABLE public.payout_items TO service_role;


-- ---------------------------------------------------------------------------
-- 9. resolve_chargeback_case — resolução de disputa em UMA transação
--    Somente admin, transições válidas, idempotente por estado e devolvendo
--    TODOS os componentes financeiros quando a disputa é ganha.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_chargeback_case(
  p_case_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_case public.chargeback_cases;
  v_restored_sale integer := 0;
  v_canceled_debit integer := 0;
  v_restored_split integer := 0;
  v_restored_reserve integer := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_status NOT IN ('new', 'evidence_pending', 'submitted', 'won', 'lost') THEN
    RETURN jsonb_build_object('outcome', 'INVALID_STATUS');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('chargeback:' || p_case_id::text, 0));

  SELECT * INTO v_case FROM public.chargeback_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_FOUND');
  END IF;

  -- Caso encerrado não reabre nem reprocessa financeiro (idempotência de estado).
  IF v_case.status IN ('won', 'lost') THEN
    RETURN jsonb_build_object('outcome', 'ALREADY_RESOLVED', 'status', v_case.status);
  END IF;
  IF v_case.status = p_status THEN
    RETURN jsonb_build_object('outcome', 'NO_CHANGE', 'status', v_case.status);
  END IF;

  UPDATE public.chargeback_cases
     SET status = p_status,
         resolved_at = CASE WHEN p_status IN ('won', 'lost') THEN now() ELSE resolved_at END
   WHERE id = v_case.id;

  INSERT INTO public.chargeback_timeline (case_id, action, actor_id, note)
  VALUES (
    v_case.id,
    'status_changed_to_' || p_status,
    v_uid,
    COALESCE(p_note, 'Status alterado para ' || p_status)
  );

  IF p_status = 'won' AND v_case.order_id IS NOT NULL THEN
    -- 1) Split volta a valer
    UPDATE public.split_entries
       SET status = 'settled', refunded_at = NULL
     WHERE order_id = v_case.order_id AND status = 'refunded';
    GET DIAGNOSTICS v_restored_split = ROW_COUNT;

    -- 2) Débito do chargeback deixa de contar
    UPDATE public.wallet_ledger
       SET status = 'canceled'
     WHERE order_id = v_case.order_id AND type = 'chargeback' AND status <> 'canceled';
    GET DIAGNOSTICS v_canceled_debit = ROW_COUNT;

    -- 3) Crédito da venda é devolvido (o webhook o havia cancelado; sem isto o
    --    produtor ganhava a disputa e continuava sem o dinheiro)
    UPDATE public.wallet_ledger
       SET status = 'available', available_at = now()
     WHERE order_id = v_case.order_id AND type = 'sale' AND status = 'canceled';
    GET DIAGNOSTICS v_restored_sale = ROW_COUNT;

    -- 4) Reserva volta a ficar retida (protege o ciclo normal, não é perdida)
    UPDATE public.security_reserves
       SET status = 'held', released_at = NULL, release_at = now() + interval '30 days'
     WHERE order_id = v_case.order_id AND status = 'forfeited';
    GET DIAGNOSTICS v_restored_reserve = ROW_COUNT;

    UPDATE public.reserve_entries
       SET status = 'held', released_at = NULL, release_at = now() + interval '30 days'
     WHERE order_id = v_case.order_id AND status = 'forfeited';

    UPDATE public.transactions
       SET status = 'paid'
     WHERE order_id = v_case.order_id AND status = 'disputed';

    INSERT INTO public.chargeback_timeline (case_id, action, actor_id, note)
    VALUES (v_case.id, 'financial_reversed', v_uid,
            'Chargeback ganho — venda, split e reserva restaurados');
  END IF;

  INSERT INTO public.audit_logs (workspace_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (
    v_case.workspace_id, 'chargeback_case', v_case.id, 'chargeback_' || p_status, v_uid,
    jsonb_build_object(
      'note', p_note,
      'previous_status', v_case.status,
      'restored_sale_rows', v_restored_sale,
      'canceled_chargeback_rows', v_canceled_debit,
      'restored_split_rows', v_restored_split,
      'restored_reserve_rows', v_restored_reserve
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'UPDATED',
    'case_id', v_case.id,
    'status', p_status,
    'restored_sale_rows', v_restored_sale,
    'canceled_chargeback_rows', v_canceled_debit,
    'restored_split_rows', v_restored_split,
    'restored_reserve_rows', v_restored_reserve
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_chargeback_case(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_chargeback_case(uuid, text, text) TO authenticated, service_role;

-- Timeline e evidências de chargeback: escrita só via RPC/serviço.
REVOKE ALL ON TABLE public.chargeback_timeline FROM anon, authenticated;
GRANT SELECT ON TABLE public.chargeback_timeline TO authenticated;
GRANT ALL ON TABLE public.chargeback_timeline TO service_role;
