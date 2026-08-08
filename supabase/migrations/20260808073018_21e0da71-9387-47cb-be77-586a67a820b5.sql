update public.wallet_ledger set available_at = now() - interval '1 hour'
where order_id = '11111111-0000-4000-8000-000000000001' and type = 'sale' and status = 'pending';
update public.split_entries set available_at = now() - interval '1 hour'
where order_id = '11111111-0000-4000-8000-000000000001';