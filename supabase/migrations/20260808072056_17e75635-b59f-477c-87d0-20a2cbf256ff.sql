-- 1) wallet_ledger: permitir o tipo 'chargeback' (o webhook já grava esse tipo,
--    mas o CHECK antigo o rejeitava silenciosamente).
ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_type_check;
ALTER TABLE public.wallet_ledger ADD CONSTRAINT wallet_ledger_type_check
  CHECK (type = ANY (ARRAY['sale','fee','refund','withdrawal','adjustment','chargeback']));

-- 2) get_wallet_balance — regra canônica única de saldo.
--    Status reais em wallet_ledger: 'pending', 'available', 'settled', 'canceled'.
--      pending   -> em hold (entra em pendente; se available_at já passou, conta como disponível)
--      available -> liberado (entra no disponível)
--      settled   -> lançamento informativo já refletido em outro ponto
--                   (taxa Asaas já descontada no creator_net; reembolso/chargeback já
--                    cancelam o crédito 'sale'), portanto NÃO afeta saldo — evita dupla contagem
--      canceled  -> ignorado
--    Sinal: 'withdrawal' e amount negativo SEMPRE subtraem.
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_workspace_id uuid)
RETURNS TABLE(available_balance bigint, pending_balance bigint, total_balance bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH signed AS (
    SELECT
      status,
      available_at,
      CASE
        WHEN type IN ('withdrawal','fee','refund','chargeback') THEN -abs(amount)
        WHEN amount < 0 THEN amount
        ELSE amount
      END AS signed_amount
    FROM wallet_ledger
    WHERE workspace_id = p_workspace_id
      AND status IN ('pending','available')
  )
  SELECT
    COALESCE(SUM(CASE WHEN status = 'available' OR (status = 'pending' AND available_at IS NOT NULL AND available_at <= now()) THEN signed_amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN status = 'pending' AND (available_at IS NULL OR available_at > now()) THEN signed_amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(signed_amount), 0)::bigint
  FROM signed;
$function$;

-- 3) get_creator_balance — bruto/taxas vêm de split_entries (status reais:
--    'pending', 'settled', 'refunded'); disponível/pendente vêm do wallet_ledger
--    (fonte de verdade), e saques abertos que ainda não debitaram o ledger travam saldo.
--    Status reais de payout_requests: pending, in_review, approved, processing, completed, failed.
CREATE OR REPLACE FUNCTION public.get_creator_balance(p_workspace_id uuid)
RETURNS TABLE(total_gross bigint, total_fees bigint, total_net bigint, available_balance bigint, pending_balance bigint, total_payouts bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH split AS (
    SELECT
      COALESCE(SUM(gross_amount), 0)::bigint AS gross,
      COALESCE(SUM(gateway_fee + platform_fee + affiliate_fee), 0)::bigint AS fees,
      COALESCE(SUM(creator_net), 0)::bigint AS net
    FROM split_entries
    WHERE workspace_id = p_workspace_id
      AND status IN ('pending','settled')
  ),
  wallet AS (
    SELECT available_balance, pending_balance FROM get_wallet_balance(p_workspace_id)
  ),
  locked AS (
    SELECT COALESCE(SUM(pr.amount), 0)::bigint AS amount
    FROM payout_requests pr
    WHERE pr.workspace_id = p_workspace_id
      AND pr.status IN ('pending','in_review','approved','processing')
      AND NOT EXISTS (
        SELECT 1 FROM wallet_ledger wl
        WHERE wl.workspace_id = pr.workspace_id
          AND wl.type = 'withdrawal'
          AND wl.description = 'Saque ' || pr.id::text
          AND wl.status <> 'canceled'
      )
  ),
  paid AS (
    SELECT COALESCE(SUM(net_amount), 0)::bigint AS amount
    FROM payout_requests
    WHERE workspace_id = p_workspace_id AND status = 'completed'
  )
  SELECT split.gross, split.fees, split.net,
         (wallet.available_balance - locked.amount)::bigint,
         wallet.pending_balance,
         paid.amount
  FROM split, wallet, locked, paid;
$function$;