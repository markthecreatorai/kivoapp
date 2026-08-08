DELETE FROM public.entitlements e
USING public.entitlements dup
WHERE e.customer_id = dup.customer_id
  AND e.product_id = dup.product_id
  AND e.order_id = dup.order_id
  AND e.order_id IS NOT NULL
  AND e.ctid > dup.ctid;

ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_unique_grant UNIQUE (customer_id, product_id, order_id);