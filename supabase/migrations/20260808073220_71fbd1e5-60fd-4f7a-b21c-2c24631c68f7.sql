delete from public.wallet_ledger where order_id = '11111111-0000-4000-8000-000000000001'
   or description ilike '%44444444-0000-4000-8000-000000000001%'
   or withdrawal_id in ('44444444-0000-4000-8000-000000000001','55555555-0000-4000-8000-000000000001');
delete from public.reserve_entries where order_id = '11111111-0000-4000-8000-000000000001';
delete from public.split_entries where order_id = '11111111-0000-4000-8000-000000000001';
delete from public.entitlements where order_id = '11111111-0000-4000-8000-000000000001';
delete from public.email_logs where order_id = '11111111-0000-4000-8000-000000000001';
delete from public.order_items where order_id = '11111111-0000-4000-8000-000000000001';
delete from public.audit_logs where entity_id in ('44444444-0000-4000-8000-000000000001','55555555-0000-4000-8000-000000000001');
delete from public.payout_requests where id in ('44444444-0000-4000-8000-000000000001','55555555-0000-4000-8000-000000000001');
delete from public.bank_accounts where id = '33333333-0000-4000-8000-000000000001';
delete from public.webhook_events where external_event_id like 'evt_e2e_fail_001%';
delete from public.payments where id = '22222222-0000-4000-8000-000000000001';
delete from public.orders where id = '11111111-0000-4000-8000-000000000001';