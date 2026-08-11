-- 1) Trigger guard function: internal only
REVOKE ALL ON FUNCTION public.fn_affiliates_guard_privileged_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_affiliates_guard_privileged_columns() FROM anon;
REVOKE ALL ON FUNCTION public.fn_affiliates_guard_privileged_columns() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_affiliates_guard_privileged_columns() TO service_role;

-- 2) process_order_financials as a thin wrapper over process_order_commission
CREATE OR REPLACE FUNCTION public.process_order_financials(
  p_order_id uuid,
  p_gateway_fee_cents integer DEFAULT NULL,
  p_settle boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.process_order_commission(
    p_order_id := p_order_id,
    p_gateway_fee_cents := p_gateway_fee_cents,
    p_settle := p_settle
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.process_order_financials(uuid, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_order_financials(uuid, integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.process_order_financials(uuid, integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_financials(uuid, integer, boolean) TO service_role;