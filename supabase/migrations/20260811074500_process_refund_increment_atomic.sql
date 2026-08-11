-- ============================================================================
-- Onda 3 / P0 FI-REFUND-V2 — reembolso incremental atômico (hardening final)
--
-- FONTE ÚNICA VERSIONADA deste SQL. Substitui e apaga
-- docs/pending-migrations/20260811064500_process_refund_increment_atomic.sql
-- (pasta removida neste commit).
--
-- POR QUE NÃO ESTÁ EM supabase/migrations/: a plataforma bloqueia escrita
-- direta nessa pasta ("managed by the migration system"); o único caminho para
-- criar arquivo lá é a ferramenta de migration, que APLICA o SQL na hora. Esta
-- rodada é explicitamente "sem aplicação", então o arquivo fica aqui já com o
-- TIMESTAMP CANÔNICO de destino (posterior ao último aplicado, 20260811070000).
-- Ao autorizar, aplicar este conteúdo integral via ferramenta de migration como
--   20260811074500_process_refund_increment_atomic.sql
--
-- ORDEM OBRIGATÓRIA DE ROLLOUT: migration ANTES do deploy do webhook-asaas.
-- Sem a RPC o handler falha fechado (500/retry) e nenhum reembolso é processado
-- pela metade — nunca o contrário.
--
-- ── MODELAGEM REAL (verificada por leitura do schema em produção) ───────────
-- Unidades (misturadas no schema legado; a RPC converte explicitamente):
--   payments.amount          numeric  → REAIS
--   orders.total_amount      numeric  → REAIS
--   refunds.amount           numeric  → REAIS
--   wallet_ledger.amount     integer  → CENTAVOS
--   split_entries.*          integer  → CENTAVOS
--   reserve_entries.amount   bigint   → CENTAVOS
--   security_reserves.amount integer  → CENTAVOS
--
-- Constraints que ditam o desenho:
--   • ux_wallet_ledger_order_type = UNIQUE (order_id, type) WHERE order_id IS
--     NOT NULL. Existe NO MÁXIMO UMA linha type='refund' por pedido: é
--     IMPOSSÍVEL lançar uma linha de ledger por incremento. Cada incremento faz
--     UPSERT dessa linha única com o valor ACUMULADO (não o delta), o que a
--     torna auto-corretiva e idempotente.
--   • split_entries: um split por pedido.
--   • wallet_ledger_status_check: pending | available | settled | canceled.
--   • wallet_ledger_type_check: sale | fee | refund | withdrawal | adjustment |
--     chargeback. NÃO existe tipo para "gateway" nem "plataforma".
--   • orders_status_check NÃO tem 'PARTIALLY_REFUNDED': parcial preserva o
--     status do pedido.
--   • reserve_entries.status: held | released | forfeited.
--   • commissions: CHECK amount >= 0.
--
-- Semântica de saldo (public.get_wallet_balance, verificada):
--   available = SUM(amount) WHERE status IN ('available','settled')
--   pending   = SUM(amount) WHERE status = 'pending'
--   total     = available + pending;  'canceled' é EXCLUÍDO de tudo.
--   A linha 'sale' vale creator_net (a fatia do produtor), não o bruto.
--
-- ── O QUE É REVERSÃO REAL E O QUE NÃO É (sem contabilidade fictícia) ────────
-- • Produtor: efeito de caixa real na linha única type='refund' do
--   wallet_ledger, sempre no MESMO estágio da venda (ver abaixo).
-- • gateway_fee / platform_fee / affiliate_fee / creator_net: o registro
--   contábil real desses componentes é public.split_entries, consumido por
--   public.get_creator_balance (SUM de gross/fees/net WHERE status IN
--   ('pending','settled')). A reversão é GRAVADA reduzindo essas colunas no
--   parcial e marcando status='refunded' no total (o split sai do relatório).
--   Efeito observável, não alocação informativa.
-- • A linha wallet_ledger type='fee' (taxa do Asaas, valor negativo, settled)
--   NÃO é tocada: o Asaas não devolve a própria taxa em reembolso, então
--   estorná-la criaria caixa que não existe. Decisão explícita e documentada.
-- • Comissão de afiliado: reduzida proporcionalmente enquanto não paga; se já
--   PAID, não há modelo de clawback → falha fechado (55000), sem escrita.
--
-- ── ESTÁGIO ESPELHADO (evita saldo disponível negativo) ─────────────────────
-- O débito do produtor herda status e available_at da linha 'sale':
--   sale 'pending'         → refund 'pending' com o MESMO available_at. O job
--                            release-holds seleciona pending vencido SEM
--                            filtrar por type: crédito e reversão são
--                            liberados JUNTOS.
--   sale available/settled → refund 'available'.
--   sale 'canceled'        → 55000 (reconciliação): debitar venda anulada
--                            dobraria a perda.
--   sem linha 'sale'       → sem caixa do produtor a reverter.
-- No fechamento TOTAL, 'sale' E 'refund' vão para 'canceled': a venda deixa de
-- existir para o saldo e o débito acumulado vai com ela. Venda 100, parcial 30
-- e total final 70 resulta em 0 disponível / 0 pendente / 0 total — sem -30
-- residual (defeito da versão anterior, que só cancelava a venda e deixava o
-- débito parcial 'available').
--
-- ── ATOMICIDADE INCREMENTAL ────────────────────────────────────────────────
-- Um webhook pode trazer VÁRIOS reembolsos novos. Cada chamada da RPC é uma
-- transação própria (atomicidade POR INCREMENTO), não uma transação para o
-- payload inteiro. Consequência assumida e testada: se o 2º incremento falha,
-- o 1º permanece aplicado e íntegro, o webhook responde 500 sem marcar
-- PROCESSED, e o reenvio do Asaas reconhece o 1º como duplicate e conclui só o
-- 2º. Nenhum estado meio-aplicado DENTRO de um incremento é possível.
-- ============================================================================

-- ─── 1. Guardas de pré-aplicação: aborta em vez de escolher um registro ─────
DO $$
DECLARE
  v_dups text;
  v_type text;
BEGIN
  -- 1a. Duplicados pré-existentes de (order_id, gateway_refund_id) fariam o
  -- índice único abaixo falhar no meio da migration. Aborta com mensagem clara.
  SELECT string_agg(order_id::text || '/' || gateway_refund_id, ', ')
    INTO v_dups
  FROM (
    SELECT order_id, gateway_refund_id
    FROM public.refunds
    WHERE gateway_refund_id IS NOT NULL
    GROUP BY order_id, gateway_refund_id
    HAVING count(*) > 1
  ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION
      'ABORTADO: public.refunds possui (order_id, gateway_refund_id) duplicados (%). Resolva manualmente antes de aplicar; esta migration nao escolhe um registro.',
      v_dups;
  END IF;

  -- 1b. Assertions de tipo/unidade. Se wallet_ledger virar numeric (reais) ou
  -- refunds virar integer (centavos), as conversoes /100 e *100 desta RPC
  -- passariam a errar por 100x silenciosamente. Falha fechado na aplicacao.
  SELECT data_type INTO v_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='refunds' AND column_name='amount';
  IF v_type <> 'numeric' THEN
    RAISE EXCEPTION 'ABORTADO: refunds.amount deveria ser numeric (REAIS), encontrado %', v_type;
  END IF;

  SELECT data_type INTO v_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='payments' AND column_name='amount';
  IF v_type <> 'numeric' THEN
    RAISE EXCEPTION 'ABORTADO: payments.amount deveria ser numeric (REAIS), encontrado %', v_type;
  END IF;

  SELECT data_type INTO v_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='wallet_ledger' AND column_name='amount';
  IF v_type <> 'integer' THEN
    RAISE EXCEPTION 'ABORTADO: wallet_ledger.amount deveria ser integer (CENTAVOS), encontrado %', v_type;
  END IF;

  SELECT data_type INTO v_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='split_entries' AND column_name='creator_net';
  IF v_type <> 'integer' THEN
    RAISE EXCEPTION 'ABORTADO: split_entries.creator_net deveria ser integer (CENTAVOS), encontrado %', v_type;
  END IF;

  -- 1c. A RPC faz UPSERT na linha unica de refund: sem esse indice parcial ela
  -- duplicaria o debito. Confirma que a constraint existe antes de prosseguir.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='ux_wallet_ledger_order_type'
  ) THEN
    RAISE EXCEPTION 'ABORTADO: indice ux_wallet_ledger_order_type ausente; o UPSERT do ledger depende dele.';
  END IF;
END $$;

-- ─── 2. Idempotência real por reembolso do gateway ──────────────────────────
-- Índice PARCIAL: gateway_refund_id é nullable e reembolsos manuais legados
-- podem não ter id de gateway; NULLs ficam fora da unicidade. O predicado
-- (WHERE gateway_refund_id IS NOT NULL) é o que permite ao ON CONFLICT da RPC
-- inferir este índice — mesmo padrão já em produção em process_order_commission
-- (ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL), o que prova a
-- validade sintática e semântica do recurso neste Postgres/Supabase.
CREATE UNIQUE INDEX IF NOT EXISTS refunds_order_gateway_refund_id_key
  ON public.refunds (order_id, gateway_refund_id)
  WHERE gateway_refund_id IS NOT NULL;

-- ─── 3. RPC transacional ────────────────────────────────────────────────────
-- Contrato:
--   p_order_id           pedido correlacionado (obrigatório)
--   p_payment_id         payments.id correlacionado (obrigatório)
--   p_gateway_refund_id  id DO REEMBOLSO no Asaas (não o id da cobrança)
--   p_amount_cents       valor DESTE reembolso, em CENTAVOS (> 0)
--   p_charge_cents       valor da cobrança, em CENTAVOS (> 0), conferido no banco
--
-- Retorno jsonb:
--   { outcome: 'applied' | 'duplicate', refund_total: bool,
--     accumulated_cents, charge_cents, creator_debit_cents,
--     ledger_status, split_reversal: {...}, reserve_forfeited_cents }
--
-- Erros (abortam a transação inteira):
--   22023 payload/correlação inválidos
--   23514 over-refund ou cobrança divergente do banco
--   55000 reversão não suportada pela modelagem (comissão paga / venda anulada)
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
  v_order       public.orders;
  v_payment     public.payments;
  v_split       public.split_entries;
  v_sale        public.wallet_ledger;
  v_has_split   boolean := false;
  v_inserted    integer;
  v_prev_cents  integer;
  v_acc_cents   integer;
  v_is_total    boolean;
  v_rem_charge   int := 0;   -- cobranca ainda nao reembolsada antes deste evento
  v_cr_remaining int := 0;   -- fatia do produtor que sobra apos esta reversao
  v_gw_d int := 0; v_pf_d int := 0; v_af_d int := 0; v_cr_d int := 0;
  v_ledger_status text := NULL;
  v_ledger_available_at timestamptz := NULL;
  v_creator_debit int := 0;
  v_reserve_cents bigint := 0;
  v_paid_commission integer := 0;
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

  -- Serializa reembolsos concorrentes do mesmo pedido.
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
  -- refunds.amount é em REAIS (numeric): centavos / 100.
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

  IF v_inserted = 0 THEN
    -- Replay do mesmo reembolso: nenhuma escrita, e não é erro.
    RETURN jsonb_build_object(
      'outcome', 'duplicate',
      'refund_total', v_acc_cents >= p_charge_cents - 1,
      'accumulated_cents', v_acc_cents,
      'charge_cents', p_charge_cents
    );
  END IF;

  -- ── Over-refund: aborta e desfaz a inserção acima (mesma transação) ──
  IF v_acc_cents > p_charge_cents + 1 THEN
    RAISE EXCEPTION 'over-refund no pedido %: acumulado % > cobranca %',
      p_order_id, v_acc_cents, p_charge_cents USING ERRCODE = '23514';
  END IF;

  v_prev_cents := v_acc_cents - p_amount_cents;
  -- Tolerância de 1 centavo para arredondamento do gateway.
  v_is_total := v_acc_cents >= p_charge_cents - 1;

  -- ── Reversão contábil: split_entries é o registro real dos componentes ──
  SELECT * INTO v_split FROM public.split_entries
  WHERE order_id = p_order_id
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;
  v_has_split := FOUND;

  IF v_has_split THEN
    -- DELTA deste evento derivado do REMANESCENTE, não de um "cumulativo"
    -- recalculado sobre a base original.
    --
    -- Por que: as colunas do split são REDUZIDAS a cada parcial. Recalcular
    -- "cumulativo esperado = componente * acumulado / cobranca" leria uma base
    -- já reduzida e produziria drift (ex.: cobranca 19990, dois parciais de
    -- 6663 debitavam 8884 em vez de 13326 no produtor). Delta sobre o
    -- remanescente é exato e fecha em zero no total, sem drift.
    v_rem_charge := GREATEST(p_charge_cents - v_prev_cents, 1);

    IF v_is_total THEN
      -- Fechamento: reverte o que AINDA resta de cada componente.
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

    -- Fatia do produtor que SOBRA após esta reversão (0 no total). O débito
    -- acumulado do ledger é derivado dela, o que impede drift entre eventos.
    v_cr_remaining := CASE WHEN v_is_total THEN 0
                           ELSE GREATEST(v_split.creator_net - v_cr_d, 0) END;


    -- Comissão já paga: sem modelo de clawback. Falha ANTES de qualquer escrita
    -- financeira (a única escrita até aqui é a auditoria, desfeita no rollback).
    IF v_af_d > 0 THEN
      SELECT count(*) INTO v_paid_commission
      FROM public.commissions
      WHERE order_id = p_order_id AND status = 'PAID';

      IF v_paid_commission > 0 THEN
        RAISE EXCEPTION 'reversao de comissao ja paga nao suportada (pedido %); reconciliacao manual', p_order_id
          USING ERRCODE = '55000';
      END IF;
    END IF;

    -- Efeito REAL nos componentes: reduz as colunas do split (consumidas por
    -- get_creator_balance). No total o split sai do relatório via status.
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

  IF FOUND THEN
    IF v_sale.status = 'canceled' THEN
      -- Venda já anulada (ex.: chargeback): debitar de novo dobraria a perda.
      RAISE EXCEPTION 'venda do pedido % ja cancelada no ledger; reembolso exige reconciliacao', p_order_id
        USING ERRCODE = '55000';
    END IF;

    -- Débito ACUMULADO derivado do remanescente (sem drift entre eventos) e
    -- limitado ao crédito original: nunca inverte o sinal do saldo.
    -- Com split: acumulado = crédito original − fatia que ainda resta.
    -- Sem split: acumulado = total reembolsado confirmado.
    v_creator_debit := CASE
      WHEN v_has_split THEN GREATEST(LEAST(v_sale.amount - v_cr_remaining, v_sale.amount), 0)
      ELSE LEAST(v_acc_cents, v_sale.amount)
    END;

    IF v_is_total THEN
      -- Fechamento: crédito e débito saem juntos do saldo → líquido exato 0.
      v_ledger_status := 'canceled';
      v_ledger_available_at := v_sale.available_at;
    ELSE
      -- Parcial no MESMO estágio da venda: se o crédito ainda está retido, o
      -- débito também fica 'pending' com o mesmo available_at e o release-holds
      -- (que não filtra por type) libera os dois juntos — nunca available < 0.
      v_ledger_status := CASE WHEN v_sale.status = 'pending' THEN 'pending' ELSE 'available' END;
      v_ledger_available_at := v_sale.available_at;
    END IF;

    IF v_creator_debit > 0 THEN
      -- UPSERT com o valor ACUMULADO: ux_wallet_ledger_order_type permite
      -- apenas UMA linha 'refund' por pedido, então o incremento atualiza a
      -- mesma linha em vez de inserir outra (auto-corretivo e idempotente).
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
      -- A venda deixa de contar; o débito acumulado vai com ela (líquido 0).
      UPDATE public.wallet_ledger SET status = 'canceled'
      WHERE order_id = p_order_id AND type IN ('sale', 'refund');
    END IF;
  ELSIF v_is_total THEN
    -- Sem linha de venda não há caixa do produtor a reverter; ainda assim
    -- garante que nenhum resíduo de refund fique ativo.
    UPDATE public.wallet_ledger SET status = 'canceled'
    WHERE order_id = p_order_id AND type IN ('sale', 'refund');
  END IF;

  -- ── Reserva de segurança: confiscada apenas no fechamento total ──
  SELECT COALESCE(sum(amount), 0) INTO v_reserve_cents
  FROM public.reserve_entries
  WHERE order_id = p_order_id AND status = 'held';

  IF v_is_total AND v_reserve_cents > 0 THEN
    UPDATE public.reserve_entries
    SET status = 'forfeited', released_at = now()
    WHERE order_id = p_order_id AND status = 'held';
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
    'split_reversal', jsonb_build_object(
      'gateway', v_gw_d,
      'platform', v_pf_d,
      'affiliate', v_af_d,
      'creator', v_cr_d,
      -- Onde a reversão desses componentes fica registrada DE FATO.
      'recorded_in', CASE WHEN NOT v_has_split THEN 'none:no_split_entry'
                          WHEN v_is_total THEN 'split_entries.status=refunded'
                          ELSE 'split_entries.columns_reduced' END
    ),
    'reserve_forfeited_cents', CASE WHEN v_is_total THEN v_reserve_cents ELSE 0 END
  );
END;
$$;

-- ─── 4. Grants mínimos por assinatura exata ─────────────────────────────────
REVOKE ALL ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) IS
  'Aplica UM reembolso do Asaas de forma atomica (atomicidade por incremento): auditoria idempotente por gateway_refund_id, reversao real em split_entries/commissions, debito do produtor na linha unica wallet_ledger type=refund no mesmo estagio da venda, e fechamento (pedido/entitlement/comissao/reserva + cancelamento conjunto de sale e refund) apenas quando o acumulado atinge a cobranca. Nao estorna a taxa do gateway porque o Asaas nao a devolve. Exclusiva do service_role.';
