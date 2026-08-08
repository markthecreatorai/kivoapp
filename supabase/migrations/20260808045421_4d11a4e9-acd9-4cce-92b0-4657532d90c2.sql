CREATE OR REPLACE FUNCTION public.increment_product_sales(p_product_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.products
  SET sales_count = COALESCE(sales_count, 0) + 1
  WHERE id = p_product_id;
$$;

REVOKE ALL ON FUNCTION public.increment_product_sales(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_product_sales(uuid) TO service_role;