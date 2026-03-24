
CREATE OR REPLACE FUNCTION public.calculate_payout_risk(p_workspace_id uuid)
RETURNS TABLE(
  risk_score integer,
  risk_flags jsonb,
  recent_chargebacks bigint,
  refund_ratio numeric,
  payout_count_today bigint,
  payout_total_today bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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
    AND status IN ('requested','processing','paid')
    AND created_at::date = CURRENT_DATE;

  -- Score
  IF v_chargebacks > 3 THEN v_score := v_score + 40;
  ELSIF v_chargebacks > 0 THEN v_score := v_score + 20; END IF;

  IF v_total > 0 THEN
    v_ratio := ROUND(v_refunded::numeric / v_total, 4);
    IF v_ratio > 0.15 THEN v_score := v_score + 30;
    ELSIF v_ratio > 0.05 THEN v_score := v_score + 15; END IF;
  END IF;

  IF v_payout_cnt >= 3 THEN v_score := v_score + 20;
  ELSIF v_payout_cnt >= 2 THEN v_score := v_score + 10; END IF;

  -- Flags
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
