ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_order_affiliate_unique UNIQUE (order_id, affiliate_id);