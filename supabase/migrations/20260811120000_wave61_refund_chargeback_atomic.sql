-- ============================================================================
-- QA-4A-V6.1/V6.2 — REFUND E CHARGEBACK EM UMA ÚNICA TRANSAÇÃO
--
-- Base: 20260811110000_wave6_reserve_atomicity.sql (pendente de aplicação).
-- Esta migration NÃO reescreve nenhuma migration aplicada: apenas
-- CREATE OR REPLACE de public.process_refund_increment (mesma assinatura da
-- versão versionada em 20260811074500) e criação de
-- public.resolve_chargeback_financials.
--
-- ── P0-1 — REFUND NÃO ERA ATÔMICO ──────────────────────────────────────────
-- Antes: _shared/refunds.ts chamava process_refund_increment e, em uma SEGUNDA
-- transação RPC, reverse_reserve_entry. Se a segunda falhasse:
--   • refund/split/ledger já estavam confirmados;
--   • o webhook devolvia 500;
--   • no reenvio, o Edge Function via o gateway_refund_id como conhecido e
--     retornava REFUND_REPLAY ANTES de reparar a reserva.
-- Resultado: débito de segregação sem o crédito de reversão correspondente,
-- permanentemente. Janela real, não teórica.
--
-- Agora: a reversão da reserva acontece DENTRO de process_refund_increment,
-- após determinar o creator_net remanescente já persistido. Qualquer falha
-- levanta exceção e o incremento inteiro (auditoria + split + comissões +
-- ledger + reserva) faz rollback. O retorno inclui 'reserve_adjustment'.
--
-- Convergência no replay: o caminho 'duplicate' NÃO é mais um early return
-- cego. Ele recalcula o remanescente a partir do estado PERSISTIDO e chama
-- public.reverse_reserve_entry de novo. A RPC é monotônica e idempotente
-- (crédito = original_amount - reserva alvo), então:
--   • se a tentativa anterior já convergiu, o delta é 0 e nada muda;
--   • se ficou desalinhada por qualquer motivo, o replay REPARA.
--
-- ── P0-2 — CHARGEBACK ERA MULTI-WRITE ──────────────────────────────────────
-- Antes: handleChargeback fazia insert de case/timeline, update de order,
-- update de split, reverse_reserve_entry, cancelamento da venda e insert de
-- chargeback no ledger em chamadas separadas, com a maioria dos erros apenas
-- logados. Não havia atomicidade nem idempotência pelo id de disputa.
--
-- Agora: public.resolve_chargeback_financials concentra o NÚCLEO FINANCEIRO
-- (case + order + split + comissões + transactions + ledger + reserva) em uma
-- transação, idempotente por chargeback_cases.gateway_dispute_id. Timeline,
-- alertas, política de risco e notificação continuam fora — são não
-- financeiros — e não podem mascarar falha do núcleo: o Edge Function propaga
-- erro do núcleo ANTES de executá-los.
--
-- ── POLÍTICA CONTÁBIL DO CHARGEBACK (explícita, sem aproximação) ────────────
-- wallet_ledger.type='sale' vale creator_net (a fatia do produtor), como já
-- documentado em 20260811074500. A responsabilidade contábil do produtor no
-- ledger é, portanto, creator_net — NUNCA o bruto da cobrança.
-- O efeito econômico é obtido CANCELANDO a linha 'sale' (status='canceled' sai
-- de available/pending/total). Inserir, além disso, uma linha 'chargeback'
-- negativa e ATIVA dobraria o débito — era exatamente o defeito anterior
-- (cancelava a venda E lançava -bruto como 'settled').
-- Portanto a linha type='chargeback' é gravada com status='canceled':
-- trilha de auditoria do valor bruto contestado, ZERO efeito em saldo.
--
-- Equação (chargeback perdido, com reserva):
--   sale(+creator_net, canceled) + refund(canceled, se houver)
--   + segregation_debit(-reserve) + reversal_credit(+reserve)
--   + chargeback(-bruto, canceled)
--   = 0 disponível, 0 pendente, 0 total.
--
-- DECISÃO EXTERNA NECESSÁRIA (fail-closed até então): a diferença
-- bruto − creator_net (taxas de gateway/plataforma retidas em chargeback) NÃO é
-- debitada do produtor. Não existe política de clawback de taxa definida no
-- repositório (base de cálculo, teto, tratamento de saldo negativo). Enquanto
-- não houver decisão escrita, o núcleo NÃO debita além de creator_net.
--
-- ── CORREÇÃO DE DOCUMENTAÇÃO ───────────────────────────────────────────────
-- Comentários anteriores afirmavam que reverse_reserve_entry "cancela o débito
-- de segregação". FALSO: a RPC emite/atualiza uma linha
-- reserve_role='reversal_credit' que COMPENSA o débito; o débito original
-- permanece no ledger como trilha. Corrigido aqui e no código das functions.
--
-- NÃO APLICADA. Sem deploy. Sem chamada externa. Sem movimentação real.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Idempotência estrutural do chargeback pelo id de disputa do gateway
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_dups text;
BEGIN
  SELECT string_agg(gateway_dispute_id, ', ')
    INTO v_dups
  FROM (
    SELECT gateway_dispute_id
      FROM public.chargeback_cases
     WHERE gateway_dispute_id IS NOT NULL
     GROUP BY gateway_dispute_id
    HAVING count(*) > 1
  ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION
      'ABORTADO: public.chargeback_cases possui gateway_dispute_id duplicado (%). Reconcilie manualmente antes de aplicar.',
      v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_chargeback_cases_gateway_dispute_id
  ON public.chargeback_cases (gateway_dispute_id)
  WHERE gateway_dispute_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. process_refund_increment — reserva DENTRO da mesma transação
--    Mesma assinatura da versão de 20260811074500 (CREATE OR REPLACE).
--    search_path = '' com todas as relações/funções qualificadas por schema.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_refund_increment(
  p_order_id uuid,
  p_payment_id uuid,
  p_gateway_refund_id text,
  p_amount_cents integer,
  p_charge_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_order       public.orders%ROWTYPE;
  v_payment     public.payments%ROWTYPE;
  v_split       public.split_entries%ROWTYPE;
  v_sale        public.wallet_ledger%ROWTYPE;
  v_has_split   boolean := false;
  v_has_sale    boolean := false;
  v_inserted    integer;
  v_prev_cents  integer;
  v_acc_cents   integer;
  v_is_total    boolean;
  v_rem_charge   int := 0;
  v_cr_remaining int := 0;
  v_gw_d int := 0; v_pf_d int := 0; v_af_d int := 0; v_cr_d int := 0;
  v_ledger_status text := NULL;
  v_ledger_available_at timestamptz := NULL;
  v_creator_debit int := 0;
  v_paid_commission integer := 0;
  v_reserve jsonb;
  v_reserve_outcome text;
  v_remaining_net bigint := 0;
BEGIN
  -- ── Validação estrutural: fail-closed antes de QUALQUER escrita ──
  IF p_order_id IS NULL OR p_payment_id IS NULL
     OR p_gateway_refund_id IS NULL OR btrim(p_gateway_refund_id) = '' THEN
    RAISE EXCEPTION 'refund payload incompleto (order/payment/gateway_refund_id)'
      USING ERRCODE = '22023';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'valor de reembolso invalido: %', p_amount_cents USING ERRCODE = '22023';
  END IF;
  IF p_charge_cents IS NULL OR p_charge_cents <= 0 THEN
    RAISE EXCEPTION 'valor de cobranca invalido: %', p_charge_cents USING ERRCODE = '22023';
  END IF;

  -- Ordem de locks estável do módulo: orders → payments → split_entries →
  -- reserve_entries (dentro de reverse_reserve_entry) → wallet_ledger.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pedido % nao encontrado', p_order_id USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.order_id <> p_order_id THEN
    RAISE EXCEPTION 'pagamento % nao pertence ao pedido %', p_payment_id, p_order_id
      USING ERRCODE = '22023';
  END IF;

  -- Teto vem do BANCO (payments.amount em reais → centavos), não do payload.
  IF round(v_payment.amount * 100)::int <> p_charge_cents THEN
    RAISE EXCEPTION 'cobranca divergente: payload=% banco=%',
      p_charge_cents, round(v_payment.amount * 100)::int USING ERRCODE = '23514';
  END IF;

  -- ── Auditoria idempotente: cada gateway_refund_id entra exatamente uma vez ──
  INSERT INTO public.refunds (
    order_id, payment_id, amount, status, processed_at, gateway_refund_id, reason
  ) VALUES (
    p_order_id, p_payment_id, p_amount_cents::numeric / 100, 'PROCESSED', now(),
    p_gateway_refund_id, 'Asaas refund'
  )
  ON CONFLICT (order_id, gateway_refund_id) WHERE gateway_refund_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Acumulado confirmado = soma PERSISTIDA (reais → centavos), nunca o payload.
  SELECT COALESCE(sum(round(amount * 100)), 0)::int INTO v_acc_cents
  FROM public.refunds
  WHERE order_id = p_order_id AND status = 'PROCESSED';

  -- Tolerância de 1 centavo para arredondamento do gateway.
  v_is_total := v_acc_cents >= p_charge_cents - 1;

  IF v_inserted = 0 THEN
    -- ── REPLAY: convergência garantida, não early return cego ──
    -- O incremento original já foi aplicado. Aqui recalculamos o remanescente a
    -- partir do estado PERSISTIDO e reexecutamos a reversão da reserva.
    -- reverse_reserve_entry é monotônica e idempotente: delta 0 quando já
    -- convergido, REPARO quando desalinhado (ex.: falha da segunda RPC no
    -- desenho antigo).
    SELECT * INTO v_split FROM public.split_entries
     WHERE order_id = p_order_id ORDER BY created_at LIMIT 1 FOR UPDATE;
    v_has_split := FOUND;

    v_remaining_net := CASE
      WHEN NOT v_has_split THEN 0
      WHEN v_is_total OR v_split.status = 'refunded' THEN 0
      ELSE GREATEST(COALESCE(v_split.creator_net, 0), 0)::bigint
    END;

    v_reserve := public.reverse_reserve_entry(
      p_order_id            => p_order_id,
      p_remaining_net_cents => v_remaining_net,
      p_reason              => CASE WHEN v_is_total THEN 'refund_total_replay'
                                    ELSE 'refund_partial_replay' END,
      p_final_status        => 'reversed'
    );
    v_reserve_outcome := COALESCE(v_reserve ->> 'outcome', 'UNKNOWN');
    IF v_reserve_outcome NOT IN ('NO_RESERVE', 'REDUCED', 'REVERSED',
                                 'FORFEITED', 'ALREADY_PROCESSED') THEN
      RAISE EXCEPTION 'REFUND_RESERVE: desfecho inesperado no replay (%) pedido % : %',
        v_reserve_outcome, p_order_id, v_reserve USING ERRCODE = '55000';
    END IF;

    RETURN jsonb_build_object(
      'outcome', 'duplicate',
      'refund_total', v_is_total,
      'accumulated_cents', v_acc_cents,
      'charge_cents', p_charge_cents,
      'remaining_net_cents', v_remaining_net,
      'reserve_adjustment', v_reserve
    );
  END IF;

  -- ── Over-refund: aborta e desfaz a inserção acima (mesma transação) ──
  IF v_acc_cents > p_charge_cents + 1 THEN
    RAISE EXCEPTION 'over-refund no pedido %: acumulado % > cobranca %',
      p_order_id, v_acc_cents, p_charge_cents USING ERRCODE = '23514';
  END IF;

  v_prev_cents := v_acc_cents - p_amount_cents;

  -- ── Reversão contábil: split_entries é o registro real dos componentes ──
  SELECT * INTO v_split FROM public.split_entries
  WHERE order_id = p_order_id
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;
  v_has_split := FOUND;

  IF v_has_split THEN
    -- DELTA deste evento derivado do REMANESCENTE (as colunas do split são
    -- reduzidas a cada parcial); recalcular sobre a base original daria drift.
    v_rem_charge := GREATEST(p_charge_cents - v_prev_cents, 1);

    IF v_is_total THEN
      v_gw_d := GREATEST(v_split.gateway_fee, 0);
      v_pf_d := GREATEST(v_split.platform_fee, 0);
      v_af_d := GREATEST(v_split.affiliate_fee, 0);
      v_cr_d := GREATEST(v_split.creator_net, 0);
    ELSE
      v_gw_d := LEAST(round(v_split.gateway_fee::numeric   * p_amount_cents / v_rem_charge), v_split.gateway_fee);
      v_pf_d := LEAST(round(v_split.platform_fee::numeric  * p_amount_cents / v_rem_charge), v_split.platform_fee);
      v_af_d := LEAST(round(v_split.affiliate_fee::numeric * p_amount_cents / v_rem_charge), v_split.affiliate_fee);
      v_cr_d := LEAST(round(v_split.creator_net::numeric   * p_amount_cents / v_rem_charge), v_split.creator_net);
    END IF;
    v_gw_d := GREATEST(v_gw_d, 0);
    v_pf_d := GREATEST(v_pf_d, 0);
    v_af_d := GREATEST(v_af_d, 0);
    v_cr_d := GREATEST(v_cr_d, 0);

    -- Fatia do produtor que SOBRA após esta reversão (0 no total).
    v_cr_remaining := CASE WHEN v_is_total THEN 0
                           ELSE GREATEST(v_split.creator_net - v_cr_d, 0) END;

    -- Comissão já paga: sem modelo de clawback. Falha antes de escrita financeira.
    IF v_af_d > 0 THEN
      SELECT count(*) INTO v_paid_commission
      FROM public.commissions
      WHERE order_id = p_order_id AND status = 'PAID';

      IF v_paid_commission > 0 THEN
        RAISE EXCEPTION 'reversao de comissao ja paga nao suportada (pedido %); reconciliacao manual', p_order_id
          USING ERRCODE = '55000';
      END IF;
    END IF;

    IF v_is_total THEN
      UPDATE public.split_entries
      SET status = 'refunded', refunded_at = now()
      WHERE id = v_split.id;
    ELSE
      UPDATE public.split_entries
      SET gross_amount  = GREATEST(gross_amount  - p_amount_cents, 0),
          gateway_fee   = GREATEST(gateway_fee   - v_gw_d, 0),
          platform_fee  = GREATEST(platform_fee  - v_pf_d, 0),
          affiliate_fee = GREATEST(affiliate_fee - v_af_d, 0),
          creator_net   = GREATEST(creator_net   - v_cr_d, 0),
          refunded_at   = now()
      WHERE id = v_split.id;
    END IF;

    -- Afiliado: reduz proporcionalmente a comissão ainda não paga (em REAIS).
    IF v_af_d > 0 THEN
      UPDATE public.commissions
      SET amount = GREATEST(amount - (v_af_d::numeric / 100), 0),
          updated_at = now()
      WHERE order_id = p_order_id AND status NOT IN ('CANCELLED', 'PAID');
    END IF;
  END IF;

  -- ── Caixa do produtor: linha ÚNICA type='refund', estágio espelhado ──
  SELECT * INTO v_sale FROM public.wallet_ledger
  WHERE order_id = p_order_id AND type = 'sale'
  FOR UPDATE;
  v_has_sale := FOUND;

  IF v_has_sale THEN
    IF v_sale.status = 'canceled' THEN
      RAISE EXCEPTION 'venda do pedido % ja cancelada no ledger; reembolso exige reconciliacao', p_order_id
        USING ERRCODE = '55000';
    END IF;

    v_creator_debit := CASE
      WHEN v_has_split THEN GREATEST(LEAST(v_sale.amount - v_cr_remaining, v_sale.amount), 0)
      ELSE LEAST(v_acc_cents, v_sale.amount)
    END;

    IF v_is_total THEN
      v_ledger_status := 'canceled';
      v_ledger_available_at := v_sale.available_at;
    ELSE
      v_ledger_status := CASE WHEN v_sale.status = 'pending' THEN 'pending' ELSE 'available' END;
      v_ledger_available_at := v_sale.available_at;
    END IF;

    IF v_creator_debit > 0 THEN
      INSERT INTO public.wallet_ledger (
        workspace_id, order_id, type, amount, currency, status, available_at, description
      ) VALUES (
        v_sale.workspace_id, p_order_id, 'refund', -v_creator_debit,
        COALESCE(v_sale.currency, 'BRL'), v_ledger_status, v_ledger_available_at,
        'Reversao produtor - reembolso acumulado ' || v_acc_cents::text || '/' || p_charge_cents::text
      )
      ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL
      DO UPDATE SET
        amount       = -v_creator_debit,
        status       = v_ledger_status,
        available_at = v_ledger_available_at,
        description  = 'Reversao produtor - reembolso acumulado '
                       || v_acc_cents::text || '/' || p_charge_cents::text;
    END IF;

    IF v_is_total THEN
      UPDATE public.wallet_ledger SET status = 'canceled'
      WHERE order_id = p_order_id AND type IN ('sale', 'refund');
    END IF;
  ELSIF v_is_total THEN
    UPDATE public.wallet_ledger SET status = 'canceled'
    WHERE order_id = p_order_id AND type IN ('sale', 'refund');
  END IF;

  -- ── Reserva de segurança: MESMA transação (P0-1 desta rodada) ──
  -- O remanescente vem do estado JÁ PERSISTIDO acima (split reduzido no
  -- parcial, 'refunded' no total): reverse_reserve_entry recalcula a reserva
  -- alvo = pct × creator_net remanescente e grava o crédito CUMULATIVO
  -- correspondente. 100 → 80 → 60 ⇒ crédito acumulado 40, sem centavo preso.
  -- Sem reserva registrada, devolve NO_RESERVE (nenhuma escrita).
  v_remaining_net := CASE WHEN v_is_total THEN 0
                          WHEN v_has_split THEN GREATEST(v_cr_remaining, 0)::bigint
                          ELSE 0 END;

  v_reserve := public.reverse_reserve_entry(
    p_order_id            => p_order_id,
    p_remaining_net_cents => v_remaining_net,
    p_reason              => CASE WHEN v_is_total THEN 'refund_total' ELSE 'refund_partial' END,
    p_final_status        => 'reversed'
  );
  v_reserve_outcome := COALESCE(v_reserve ->> 'outcome', 'UNKNOWN');

  -- Allowlist explícita: qualquer desfecho estrutural/inesperado aborta o
  -- incremento INTEIRO (auditoria, split, comissões, ledger e reserva).
  IF v_reserve_outcome NOT IN ('NO_RESERVE', 'REDUCED', 'REVERSED',
                               'FORFEITED', 'ALREADY_PROCESSED') THEN
    RAISE EXCEPTION 'REFUND_RESERVE: desfecho inesperado (%) no pedido % : %',
      v_reserve_outcome, p_order_id, v_reserve USING ERRCODE = '55000';
  END IF;

  -- ── Fechamento: só no total, e exatamente uma vez ──
  IF v_is_total THEN
    UPDATE public.orders SET status = 'REFUNDED', updated_at = now()
    WHERE id = p_order_id AND status <> 'REFUNDED';

    UPDATE public.entitlements SET revoked_at = now()
    WHERE order_id = p_order_id AND revoked_at IS NULL;

    UPDATE public.commissions
    SET status = 'CANCELLED', cancelled_at = now(),
        cancel_reason = 'Pedido reembolsado', updated_at = now()
    WHERE order_id = p_order_id AND status NOT IN ('CANCELLED', 'PAID');

    UPDATE public.transactions
    SET status = 'refunded', refunded_at = now()
    WHERE order_id = p_order_id AND status <> 'refunded';

    -- Tabela legada congelada para INSERT; aqui apenas o histórico é fechado.
    UPDATE public.security_reserves
    SET status = 'forfeited', released_at = now(), updated_at = now()
    WHERE order_id = p_order_id AND status = 'held';
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'applied',
    'refund_total', v_is_total,
    'accumulated_cents', v_acc_cents,
    'charge_cents', p_charge_cents,
    'creator_debit_cents', v_creator_debit,
    'ledger_status', v_ledger_status,
    'remaining_net_cents', v_remaining_net,
    'split_reversal', jsonb_build_object(
      'gateway', v_gw_d,
      'platform', v_pf_d,
      'affiliate', v_af_d,
      'creator', v_cr_d,
      'recorded_in', CASE WHEN NOT v_has_split THEN 'none:no_split_entry'
                          WHEN v_is_total THEN 'split_entries.status=refunded'
                          ELSE 'split_entries.columns_reduced' END
    ),
    -- Ajuste da reserva feito NESTA transação (crédito cumulativo).
    'reserve_adjustment', v_reserve
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) IS
  'QA-4A-V6.1: aplica UM reembolso do Asaas em UMA transacao — auditoria idempotente por gateway_refund_id, reversao real em split_entries/commissions, debito do produtor na linha unica wallet_ledger type=refund no mesmo estagio da venda, reversao CUMULATIVA da reserva (reverse_reserve_entry no mesmo commit) e fechamento total unico. O caminho de replay reexecuta a reversao da reserva para garantir convergencia. Exclusiva do service_role.';

-- ---------------------------------------------------------------------------
-- 3. resolve_chargeback_financials — núcleo financeiro atômico do chargeback
--    Idempotente por chargeback_cases.gateway_dispute_id. Sem duplicação de
--    débito e sem criação de saldo em replay.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_chargeback_financials(
  p_order_id uuid,
  p_payment_id uuid,
  p_gateway_dispute_id text,
  p_amount_cents integer,
  p_reason text DEFAULT 'Chargeback',
  p_sla_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_order    public.orders%ROWTYPE;
  v_payment  public.payments%ROWTYPE;
  v_split    public.split_entries%ROWTYPE;
  v_sale     public.wallet_ledger%ROWTYPE;
  v_existing_case public.chargeback_cases%ROWTYPE;
  v_case_id  uuid;
  v_creator_net bigint := 0;
  v_payment_amount_cents bigint;
  v_reserve  jsonb;
  v_reserve_outcome text;
  v_already  boolean := false;
BEGIN
  IF p_order_id IS NULL OR p_payment_id IS NULL THEN
    RAISE EXCEPTION 'CHARGEBACK: order/payment obrigatorios' USING ERRCODE = '22023';
  END IF;
  IF p_gateway_dispute_id IS NULL OR btrim(p_gateway_dispute_id) = '' THEN
    -- Sem id de disputa não existe chave de idempotência: falha fechado em vez
    -- de arriscar débito duplicado no reenvio do gateway.
    RAISE EXCEPTION 'CHARGEBACK: gateway_dispute_id obrigatorio para idempotencia'
      USING ERRCODE = '22023';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'CHARGEBACK: valor invalido %', p_amount_cents USING ERRCODE = '22023';
  END IF;
  IF p_sla_days IS NULL OR p_sla_days <= 0 OR p_sla_days > 30 THEN
    RAISE EXCEPTION 'CHARGEBACK: SLA invalido % (permitido: 1..30 dias)', p_sla_days
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('resolve_chargeback_financials:' || p_order_id::text, 0));

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHARGEBACK: pedido % nao encontrado', p_order_id USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.order_id <> p_order_id THEN
    RAISE EXCEPTION 'CHARGEBACK: pagamento % nao pertence ao pedido %', p_payment_id, p_order_id
      USING ERRCODE = '22023';
  END IF;
  IF v_payment.workspace_id IS DISTINCT FROM v_order.workspace_id THEN
    RAISE EXCEPTION 'CHARGEBACK: OWNERSHIP_MISMATCH pedido % / pagamento %',
      p_order_id, p_payment_id USING ERRCODE = '22023';
  END IF;
  v_payment_amount_cents := round(v_payment.amount * 100)::bigint;
  -- Sem tolerância: payments.amount é a fonte persistida do bruto e ambos os
  -- lados são comparados em centavos inteiros.
  IF p_amount_cents::bigint <> v_payment_amount_cents THEN
    RAISE EXCEPTION 'CHARGEBACK: valor divergente: payload=% banco=% centavos',
      p_amount_cents, v_payment_amount_cents USING ERRCODE = '22023';
  END IF;

  -- ── Idempotência: o case é a chave. Insert perdido = replay. ──
  INSERT INTO public.chargeback_cases (
    workspace_id, order_id, payment_id, gateway_dispute_id, amount, reason,
    status, sla_deadline_at, financial_impact
  ) VALUES (
    v_order.workspace_id, p_order_id, p_payment_id, p_gateway_dispute_id,
    p_amount_cents, COALESCE(p_reason, 'Chargeback'),
    'new', now() + (p_sla_days::text || ' days')::interval,
    p_amount_cents::numeric / 100
  )
  ON CONFLICT (gateway_dispute_id) WHERE gateway_dispute_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_case_id;

  IF v_case_id IS NULL THEN
    v_already := true;
    SELECT * INTO v_existing_case
      FROM public.chargeback_cases
     WHERE gateway_dispute_id = p_gateway_dispute_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CHARGEBACK: disputa % conflitou mas o caso não foi localizado',
        p_gateway_dispute_id USING ERRCODE = '55000';
    END IF;
    -- V6.2: um dispute ID só é idempotente quando TODOS os vínculos coincidem.
    -- A exceção aborta a transação antes de qualquer efeito financeiro.
    IF v_existing_case.order_id IS DISTINCT FROM p_order_id
       OR v_existing_case.payment_id IS DISTINCT FROM p_payment_id
       OR v_existing_case.workspace_id IS DISTINCT FROM v_order.workspace_id
       OR v_existing_case.amount IS DISTINCT FROM p_amount_cents::bigint THEN
      RAISE EXCEPTION
        'CHARGEBACK: DISPUTE_CORRELATION_MISMATCH disputa % (order/payment/workspace/amount divergente)',
        p_gateway_dispute_id USING ERRCODE = '22023';
    END IF;
    v_case_id := v_existing_case.id;
  END IF;

  SELECT * INTO v_split FROM public.split_entries
   WHERE order_id = p_order_id ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_split.workspace_id IS DISTINCT FROM v_order.workspace_id THEN
      RAISE EXCEPTION 'CHARGEBACK: OWNERSHIP_MISMATCH split do pedido %', p_order_id
        USING ERRCODE = '22023';
    END IF;
    v_creator_net := GREATEST(COALESCE(v_split.creator_net, 0), 0);

    UPDATE public.split_entries
       SET status = 'refunded', refunded_at = COALESCE(refunded_at, now())
     WHERE id = v_split.id AND status <> 'refunded';
  END IF;

  -- ── Caixa do produtor ──
  -- O efeito econômico é o CANCELAMENTO da linha 'sale' (e de eventual linha
  -- 'refund' acumulada). Nenhum débito adicional ATIVO: seria dobrado.
  UPDATE public.wallet_ledger SET status = 'canceled'
   WHERE order_id = p_order_id AND type IN ('sale', 'refund') AND status <> 'canceled';

  SELECT * INTO v_sale FROM public.wallet_ledger
   WHERE order_id = p_order_id AND type = 'sale' LIMIT 1;

  -- Trilha de auditoria do bruto contestado, SEM efeito em saldo
  -- (status='canceled'). Linha única por pedido: ux_wallet_ledger_order_type.
  INSERT INTO public.wallet_ledger (
    workspace_id, order_id, type, amount, currency, status, description
  ) VALUES (
    v_order.workspace_id, p_order_id, 'chargeback', -p_amount_cents,
    COALESCE(v_sale.currency, 'BRL'), 'canceled',
    'Chargeback (auditoria, sem efeito em saldo) disputa ' || p_gateway_dispute_id
  )
  ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL
  DO UPDATE SET
    amount      = EXCLUDED.amount,
    status      = 'canceled',
    description = EXCLUDED.description;

  -- ── Reserva: crédito de reversão CUMULATIVO. Ele COMPENSA o débito de
  -- segregação; o débito original permanece no ledger como trilha (a RPC não
  -- "cancela" o débito — documentação anterior estava errada). ──
  v_reserve := public.reverse_reserve_entry(
    p_order_id            => p_order_id,
    p_remaining_net_cents => 0,
    p_reason              => 'chargeback_lost',
    p_final_status        => 'forfeited'
  );
  v_reserve_outcome := COALESCE(v_reserve ->> 'outcome', 'UNKNOWN');
  IF v_reserve_outcome NOT IN ('NO_RESERVE', 'REDUCED', 'REVERSED',
                               'FORFEITED', 'ALREADY_PROCESSED') THEN
    RAISE EXCEPTION 'CHARGEBACK_RESERVE: desfecho inesperado (%) no pedido % : %',
      v_reserve_outcome, p_order_id, v_reserve USING ERRCODE = '55000';
  END IF;

  -- ── Estados correlatos (idempotentes por predicado) ──
  UPDATE public.orders SET status = 'DISPUTED', updated_at = now()
   WHERE id = p_order_id AND status <> 'DISPUTED';

  UPDATE public.transactions SET status = 'disputed'
   WHERE order_id = p_order_id AND status <> 'disputed';

  UPDATE public.commissions
     SET status = 'CANCELLED', cancelled_at = now(),
         cancel_reason = 'Chargeback aberto', updated_at = now()
   WHERE order_id = p_order_id AND status IN ('PENDING', 'APPROVED');

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', CASE WHEN v_already THEN 'ALREADY_PROCESSED' ELSE 'APPLIED' END,
    'case_id', v_case_id,
    'order_id', p_order_id,
    'workspace_id', v_order.workspace_id,
    'gross_cents', p_amount_cents,
    -- Responsabilidade contábil do produtor: creator_net, nunca o bruto.
    'creator_net_cents', v_creator_net,
    'ledger_effect', 'sale_canceled',
    'reserve_adjustment', v_reserve
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_chargeback_financials(uuid, uuid, text, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_chargeback_financials(uuid, uuid, text, integer, text, integer) TO service_role;

COMMENT ON FUNCTION public.resolve_chargeback_financials(uuid, uuid, text, integer, text, integer) IS
  'QA-4A-V6.2: nucleo financeiro do chargeback em UMA transacao; replay exige correlacao exata de dispute/order/payment/workspace/amount, valor deve coincidir com payments.amount e SLA deve estar entre 1 e 30 dias. Debita apenas creator_net por cancelamento da venda; nunca o bruto. Exclusiva do service_role.';
