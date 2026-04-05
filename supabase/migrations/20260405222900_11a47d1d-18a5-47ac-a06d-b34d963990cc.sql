-- 1. Drop old constraint and add expanded one
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('PENDING', 'PAID', 'COMPLETED', 'FAILED', 'CANCELED', 'CANCELLED', 'REFUNDED', 'DISPUTED'));

-- 2. Fix stuck orders: orders with SUCCEEDED payments still in PENDING
UPDATE public.orders o
SET status = 'PAID', paid_at = COALESCE(o.paid_at, p.processed_at, now())
FROM public.payments p
WHERE p.order_id = o.id
  AND p.status = 'SUCCEEDED'
  AND o.status = 'PENDING';