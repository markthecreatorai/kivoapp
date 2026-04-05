
DROP VIEW IF EXISTS public.data_consistency_check;
CREATE VIEW public.data_consistency_check
WITH (security_invoker = true)
AS
SELECT 'orders_without_payment'::text AS check_name,
    (count(*))::integer AS issue_count
   FROM orders o
     LEFT JOIN payments p ON p.order_id = o.id
  WHERE o.status = 'COMPLETED' AND p.id IS NULL
UNION ALL
 SELECT 'payments_without_order'::text AS check_name,
    (count(*))::integer AS issue_count
   FROM payments p
     LEFT JOIN orders o ON o.id = p.order_id
  WHERE o.id IS NULL
UNION ALL
 SELECT 'completed_orders_missing_entitlements'::text AS check_name,
    (count(DISTINCT o.id))::integer AS issue_count
   FROM orders o
     LEFT JOIN entitlements e ON e.order_id = o.id
  WHERE o.status = 'COMPLETED' AND e.id IS NULL;
