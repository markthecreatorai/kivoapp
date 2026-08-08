CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_workspace_id uuid)
RETURNS TABLE(available_balance bigint, pending_balance bigint, total_balance bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH signed AS (
    SELECT
      status,
      available_at,
      CASE
        WHEN type IN ('withdrawal', 'debit') THEN -abs(amount)
        ELSE amount
      END AS signed_amount
    FROM wallet_ledger
    WHERE workspace_id = p_workspace_id AND status <> 'canceled'
  )
  SELECT
    COALESCE(SUM(CASE WHEN status = 'available' OR (status = 'pending' AND available_at <= now()) THEN signed_amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN status = 'pending' AND available_at > now() THEN signed_amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN status IN ('pending', 'available') THEN signed_amount ELSE 0 END), 0)::bigint
  FROM signed;
$$;

CREATE OR REPLACE FUNCTION public.get_creator_balance(p_workspace_id uuid)
RETURNS TABLE(total_gross bigint, total_fees bigint, total_net bigint, available_balance bigint, pending_balance bigint, total_payouts bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(se.gross_amount), 0)::bigint,
    COALESCE(SUM(se.gateway_fee + se.platform_fee + se.affiliate_fee), 0)::bigint,
    COALESCE(SUM(se.creator_net), 0)::bigint,
    COALESCE(SUM(CASE WHEN se.status = 'available' OR (se.status = 'pending' AND se.available_at <= now()) THEN se.creator_net ELSE 0 END), 0)::bigint
      - COALESCE((SELECT SUM(pr.amount) FROM payout_requests pr WHERE pr.workspace_id = p_workspace_id AND pr.status IN ('pending','in_review','approved','processing')), 0)::bigint,
    COALESCE(SUM(CASE WHEN se.status = 'pending' AND se.available_at > now() THEN se.creator_net ELSE 0 END), 0)::bigint,
    COALESCE((SELECT SUM(pr.net_amount) FROM payout_requests pr WHERE pr.workspace_id = p_workspace_id AND pr.status IN ('completed','paid')), 0)::bigint
  FROM split_entries se
  WHERE se.workspace_id = p_workspace_id AND se.status <> 'refunded';
$$;