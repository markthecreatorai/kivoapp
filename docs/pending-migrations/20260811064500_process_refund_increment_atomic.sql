-- ============================================================================
-- PENDENTE DE APLICAÇÃO — Onda 3 / P0 FI-REFUND-PARTIAL (reabertura)
--
-- Nome-alvo ao aplicar: 20260811064500_process_refund_increment_atomic.sql
-- Não está em supabase/migrations porque a plataforma só permite criar arquivos
-- naquela pasta através da ferramenta de migration, que APLICA o SQL — e esta
-- rodada é explicitamente "sem migration aplicada". Aplicar depois via a
-- ferramenta de migration, com este conteúdo integral.
--
-- Contexto do defeito reaberto:
--   • O handler de reembolso fazia várias escritas financeiras independentes
--     (refunds, wallet_ledger, split_entries, reserve_entries, commissions,
--     entitlements, orders). Sem transação única, uma falha no meio deixava o
--     financeiro inconsistente e ainda assim mexia em parte dos componentes.
--   • Reembolso parcial debitava apenas o produtor, mantendo gateway, plataforma,
--     afiliado e reserva intactos — o produtor absorvia 100% da devolução.
--   • Idempotência era por "primeiro id de refunds[]", ignorando ou duplicando
--     eventos com histórico cumulativo de múltiplos parciais.
--
-- Esta migration cria a fronteira transacional única usada pelo webhook:
--   public.process_refund_increment(...)
-- Tudo (auditoria + reversão proporcional + fechamento no total) acontece em
-- UMA chamada, portanto UMA transação: qualquer erro aborta o conjunto e o
-- webhook devolve 500 para retry, sem marcar PROCESSED.
--
-- Enquanto não aplicada, a RPC não existe e o handler falha fechado (retry) —
-- nunca escreve financeiro pela metade.
-- ============================================================================

-- ─── 1. Idempotência real por reembolso do gateway ───────────────────────────
-- Sem esta unique, "cada ID entra uma vez" seria só uma intenção no código.
CREATE UNIQUE INDEX IF NOT EXISTS refunds_order_gateway_refund_id_key
  ON public.refunds (order_id, gateway_refund_id)
  WHERE gateway_refund_id IS NOT NULL;

-- ─── 2. RPC transacional ─────────────────────────────────────────────────────
-- Contrato:
--   p_order_id           pedido correlacionado (obrigatório)
--   p_payment_id         payments.id correlacionado (obrigatório)
--   p_gateway_refund_id  id do reembolso no Asaas (obrigatório, não o id da cobrança)
--   p_amount_cents       valor DESTE reembolso, em centavos (> 0)
--   p_charge_cents       valor da cobrança, em centavos (> 0), para travar o teto
--
-- Retorno jsonb:
--   { outcome: 'applied' | 'duplicate',
--     refund_total: bool, accumulated_cents: int, charge_cents: int,
--     reversed: { gateway, platform, affiliate, creator, reserve } }
--
-- Erros (todos abortam a transação inteira):
--   22023 payload inválido
--   23514 over-refund / cobrança divergente
--   55000 reversão não suportada pela modelagem atual (comissão já paga)
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
SET search_path TO 'public'
AS $$
DECLARE
  v_order        public.orders;
  v_payment      public.payments;
  v_split        public.split_entries;
  v_inserted     integer;
  v_prev_cents   integer;
  v_acc_cents    integer;
  v_is_total     boolean;
  -- reversões acumuladas (baseadas no acumulado, evita drift de arredondamento)
  v_gw_prev int; v_pf_prev int; v_af_prev int; v_cr_prev int;
  v_gw_acc  int; v_pf_acc  int; v_af_acc  int; v_cr_acc  int;
  v_gw_d int := 0; v_pf_d int := 0; v_af_d int := 0; v_cr_d int := 0;
  v_reserve_cents bigint := 0;
  v_paid_commission integer;
BEGIN
  -- ── Validação estrutural: fail-closed antes de qualquer escrita ──
  IF p_order_id IS NULL OR p_payment_id IS NULL
     OR p_gateway_refund_id IS NULL OR btrim(p_gateway_refund_id) = '' THEN
    RAISE EXCEPTION 'refund payload incompleto (order/payment/gateway_refund_id)'
      USING ERRCODE = '22023';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'valor de reembolso inválido: %', p_amount_cents
      USING ERRCODE = '22023';
  END IF;
  IF p_charge_cents IS NULL OR p_charge_cents <= 0 THEN
    RAISE EXCEPTION 'valor de cobrança inválido: %', p_charge_cents
      USING ERRCODE = '22023';
  END IF;

  -- Serializa reembolsos concorrentes do mesmo pedido (dois parciais no mesmo instante).
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pedido % não encontrado', p_order_id USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.order_id <> p_order_id THEN
    RAISE EXCEPTION 'pagamento % não pertence ao pedido %', p_payment_id, p_order_id
      USING ERRCODE = '22023';
  END IF;

  -- Teto vem do banco, não do payload: o gateway não define o quanto pode voltar.
  IF round(v_payment.amount * 100)::int <> p_charge_cents THEN
    RAISE EXCEPTION 'cobrança divergente: payload=% banco=%',
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

  SELECT COALESCE(sum(round(amount * 100)), 0)::int INTO v_acc_cents
  FROM public.refunds
  WHERE order_id = p_order_id AND status = 'PROCESSED';

  IF v_inserted = 0 THEN
    -- Replay do mesmo reembolso: nada muda, e o chamador não deve retentar.
    RETURN jsonb_build_object(
      'outcome', 'duplicate',
      'refund_total', v_acc_cents >= p_charge_cents - 1,
      'accumulated_cents', v_acc_cents,
      'charge_cents', p_charge_cents
    );
  END IF;

  -- ── Over-refund: aborta e desfaz a inserção acima ──
  IF v_acc_cents > p_charge_cents + 1 THEN
    RAISE EXCEPTION 'over-refund no pedido %: acumulado % > cobrança %',
      p_order_id, v_acc_cents, p_charge_cents USING ERRCODE = '23514';
  END IF;

  v_prev_cents := v_acc_cents - p_amount_cents;
  -- Tolerância de 1 centavo para arredondamento do gateway.
  v_is_total := v_acc_cents >= p_charge_cents - 1;

  -- ── Reversão proporcional dos componentes do split original ──
  SELECT * INTO v_split FROM public.split_entries
  WHERE order_id = p_order_id
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Cumulativo esperado − cumulativo já revertido = delta deste evento.
    -- No total, o cumulativo esperado é o componente inteiro: fecha ao centavo.
    IF v_is_total THEN
      v_gw_acc := v_split.gateway_fee; v_pf_acc := v_split.platform_fee;
      v_af_acc := v_split.affiliate_fee; v_cr_acc := v_split.creator_net;
    ELSE
      v_gw_acc := round(v_split.gateway_fee::numeric  * v_acc_cents / p_charge_cents);
      v_pf_acc := round(v_split.platform_fee::numeric * v_acc_cents / p_charge_cents);
      v_af_acc := round(v_split.affiliate_fee::numeric* v_acc_cents / p_charge_cents);
      v_cr_acc := round(v_split.creator_net::numeric  * v_acc_cents / p_charge_cents);
    END IF;
    v_gw_prev := round(v_split.gateway_fee::numeric  * v_prev_cents / p_charge_cents);
    v_pf_prev := round(v_split.platform_fee::numeric * v_prev_cents / p_charge_cents);
    v_af_prev := round(v_split.affiliate_fee::numeric* v_prev_cents / p_charge_cents);
    v_cr_prev := round(v_split.creator_net::numeric  * v_prev_cents / p_charge_cents);

    v_gw_d := GREATEST(v_gw_acc - v_gw_prev, 0);
    v_pf_d := GREATEST(v_pf_acc - v_pf_prev, 0);
    v_af_d := GREATEST(v_af_acc - v_af_prev, 0);
    v_cr_d := GREATEST(v_cr_acc - v_cr_prev, 0);

    -- Produtor: debita SOMENTE a fatia dele. O restante é revertido nos
    -- respectivos componentes abaixo — nunca absorvido pelo produtor.
    IF v_cr_d > 0 THEN
      INSERT INTO public.wallet_ledger (
        workspace_id, order_id, type, amount, status, description
      ) VALUES (
        v_split.workspace_id, p_order_id, 'refund', -v_cr_d,
        CASE WHEN v_is_total THEN 'settled' ELSE 'available' END,
        'Reversão produtor · reembolso ' || p_gateway_refund_id
      );
    END IF;

    -- Afiliado: reduz proporcionalmente a comissão ainda não paga.
    IF v_af_d > 0 THEN
      SELECT count(*) INTO v_paid_commission
      FROM public.commissions
      WHERE order_id = p_order_id AND status = 'PAID';

      IF v_paid_commission > 0 THEN
        -- Não há modelo de clawback de comissão já paga: falha fechado para
        -- reconciliação manual em vez de improvisar quem absorve a perda.
        RAISE EXCEPTION 'reversão de comissão já paga não suportada (pedido %)', p_order_id
          USING ERRCODE = '55000';
      END IF;

      UPDATE public.commissions
      SET amount = GREATEST(amount - (v_af_d::numeric / 100), 0),
          updated_at = now()
      WHERE order_id = p_order_id AND status <> 'CANCELLED';
    END IF;

    -- Reserva de segurança: confiscada integralmente ao fechar o total.
    SELECT COALESCE(sum(amount), 0) INTO v_reserve_cents
    FROM public.reserve_entries
    WHERE order_id = p_order_id AND status = 'held';

    IF v_is_total AND v_reserve_cents > 0 THEN
      UPDATE public.reserve_entries
      SET status = 'forfeited', released_at = now()
      WHERE order_id = p_order_id AND status = 'held';
    END IF;

    IF v_is_total THEN
      UPDATE public.split_entries
      SET status = 'refunded', refunded_at = now()
      WHERE id = v_split.id;

      UPDATE public.wallet_ledger
      SET status = 'canceled'
      WHERE order_id = p_order_id AND type = 'sale';
    END IF;
  ELSIF v_is_total THEN
    UPDATE public.wallet_ledger
    SET status = 'canceled'
    WHERE order_id = p_order_id AND type = 'sale';
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
    WHERE order_id = p_order_id AND status <> 'CANCELLED';

    UPDATE public.transactions
    SET status = 'refunded', refunded_at = now()
    WHERE order_id = p_order_id AND status <> 'refunded';

    UPDATE public.security_reserves
    SET status = 'forfeited', released_at = now()
    WHERE order_id = p_order_id AND status = 'held';
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'applied',
    'refund_total', v_is_total,
    'accumulated_cents', v_acc_cents,
    'charge_cents', p_charge_cents,
    'reversed', jsonb_build_object(
      'gateway', v_gw_d,
      'platform', v_pf_d,
      'affiliate', v_af_d,
      'creator', v_cr_d,
      'reserve', CASE WHEN v_is_total THEN v_reserve_cents ELSE 0 END
    )
  );
END;
$$;

-- ─── 3. Grants mínimos por assinatura exata ──────────────────────────────────
REVOKE ALL ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) IS
  'Aplica um reembolso do Asaas de forma incremental e atômica: auditoria idempotente por gateway_refund_id, reversão proporcional de gateway/plataforma/afiliado/produtor/reserva e fechamento (entitlement/comissão/reserva/pedido) apenas quando o acumulado atinge a cobrança. Exclusiva do service_role.';
