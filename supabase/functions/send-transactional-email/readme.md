# send-transactional-email (Fase 2)

Função única e reutilizável para e-mails transacionais mínimos da Kivo.

## Entrada (JSON)

```json
{
  "template_key": "welcome_account_created",
  "recipient": "user@email.com",
  "payload": {}
}
```

Campos obrigatórios:
- `template_key`
- `recipient`
- `payload`

## Templates implementados

- `welcome_account_created`
- `subscription_activated`
- `payment_failed`
- `support_received`
- `onboarding_complementary`
- `cancellation_confirmed`
- `subscription_reactivated`

## Payload por template

### welcome_account_created
```json
{
  "name": "Lucas",
  "dashboard_url": "https://www.kivohub.com.br/dashboard"
}
```

### subscription_activated
```json
{
  "name": "Lucas",
  "plan_name": "Creator",
  "next_billing_date": "20/04/2026",
  "billing_url": "https://www.kivohub.com.br/settings/billing"
}
```

### payment_failed
```json
{
  "name": "Lucas",
  "amount": "R$ 67,00",
  "reason": "Cartão recusado",
  "retry_url": "https://www.kivohub.com.br/settings/billing"
}
```

### support_received
```json
{
  "name": "Lucas",
  "ticket_id": "SUP-1029",
  "expected_reply": "até 24h úteis",
  "support_url": "https://www.kivohub.com.br/support"
}
```

### onboarding_complementary
```json
{
  "name": "Lucas",
  "next_step": "Configurar checkout",
  "checklist_url": "https://www.kivohub.com.br/dashboard"
}
```

### cancellation_confirmed
```json
{
  "name": "Lucas",
  "plan_name": "Creator",
  "valid_until": "30/04/2026",
  "reactivation_url": "https://www.kivohub.com.br/settings/billing"
}
```

### subscription_reactivated
```json
{
  "name": "Lucas",
  "plan_name": "Creator",
  "billing_url": "https://www.kivohub.com.br/settings/billing"
}
```

## Dependências de ambiente

- `RESEND_API_KEY`
- `EMAIL_FROM_DEFAULT` (recomendado)
- `EMAIL_FROM_NOTIFY` (fallback)
- `EMAIL_FROM` (fallback legado)

## Exemplo de chamada (curl)

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/send-transactional-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPABASE_ANON_OR_SERVICE_KEY>" \
  -d '{
    "template_key": "payment_failed",
    "recipient": "user@email.com",
    "payload": {
      "name": "Lucas",
      "amount": "R$ 67,00",
      "reason": "Cartão recusado"
    }
  }'
```

## Teste rápido

1. Configurar `RESEND_API_KEY` e `EMAIL_FROM` nos secrets da função.
2. Deploy da função:
   - `supabase functions deploy send-transactional-email`
3. Enviar um payload para cada `template_key`.
4. Validar:
   - entrega no inbox
   - render consistente com layout base Kivo
   - assunto correto por template
