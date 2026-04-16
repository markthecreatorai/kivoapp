# Fase 3 — Observabilidade mínima (Resend)

## O que foi implementado

1. Tabela de logs: `public.transactional_email_logs`
2. Registro no envio (função `send-transactional-email`):
   - `template_key`
   - `recipient`
   - `provider`
   - `provider_message_id`
   - `status`
   - `created_at`
3. Endpoint webhook: `resend-webhook`
4. Eventos tratados:
   - `sent`
   - `delivered`
   - `bounced`
   - `failed`

## Migração

Arquivos:
- `supabase/migrations/20260416173000_transactional_email_observability.sql`
- `supabase/migrations/20260416175000_email_observability_hardening.sql`

## Deploy das funções

```bash
supabase functions deploy send-transactional-email
supabase functions deploy resend-webhook
```

## Secrets necessários

- `RESEND_API_KEY` (envio)
- `EMAIL_FROM_DEFAULT` / `EMAIL_FROM_NOTIFY`
- `RESEND_WEBHOOK_SECRET` (obrigatório para validação de assinatura)
- `SUPABASE_SERVICE_ROLE_KEY`

## Configuração do webhook no Resend

URL do endpoint:

`https://<PROJECT_REF>.supabase.co/functions/v1/resend-webhook`

Eventos:
- email.sent
- email.delivered
- email.bounced
- email.failed

A validação usa o header `resend-signature` e o **corpo bruto** da requisição com HMAC SHA-256.
Sem assinatura válida, o endpoint retorna `401`.

## Teste ponta a ponta

1. Envie email via `send-transactional-email`.
2. Verifique no banco:

```sql
select template_key, recipient, provider, provider_message_id, status, created_at
from public.transactional_email_logs
order by created_at desc
limit 20;
```

3. Dispare evento de webhook (via painel do Resend / teste).
4. Confirme mudança de status para `sent`/`delivered`/`bounced`/`failed`.
5. Reenvie o mesmo evento de webhook e confirme retorno `duplicate: true` (idempotência básica).
