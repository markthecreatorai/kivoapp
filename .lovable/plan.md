

# Plano: Corrigir Bug de Order Status + Cenário de Reembolso

## Causa Raiz Identificada

O bug de "order fica PENDING após pagamento aprovado" tem causa raiz clara nos logs:

```text
"new row for relation 'orders' violates check constraint 'orders_status_check'"
```

A constraint CHECK na tabela `orders` aceita apenas:
- `PENDING`, `PAID`, `CANCELLED`, `REFUNDED`

Mas o código usa:
- `COMPLETED` (em create-payment e webhook-asaas)
- `FAILED` (em create-payment e webhook-asaas)
- `CANCELED` (em webhook-asaas — note a diferença: CANCELED vs CANCELLED)
- `DISPUTED` (em webhook-asaas para chargebacks)

## Bugs Secundários no Fluxo de Reembolso

1. **Inserção no `refunds`**: O webhook `handleRefunded` não envia `requested_at` nem `updated_at` (ambos NOT NULL), causando falha silenciosa no INSERT.
2. **Status inconsistente**: O webhook tenta gravar `REFUNDED` no orders — esse valor já existe na constraint, então funciona. Mas se o INSERT em `refunds` falhar, o reembolso fica sem registro.

## Correções Necessárias

### 1. Migration SQL — Corrigir CHECK constraint
Alterar `orders_status_check` para incluir todos os status usados pelo sistema:
- `PENDING`, `PAID`, `COMPLETED`, `FAILED`, `CANCELED`, `CANCELLED`, `REFUNDED`, `DISPUTED`

### 2. Edge Function `webhook-asaas` — Corrigir `handleRefunded`
Adicionar `requested_at` e `updated_at` no INSERT de `refunds`:
```
requested_at: new Date().toISOString(),
updated_at: new Date().toISOString(),
```

### 3. Edge Function `create-payment` — Nenhuma mudança necessária
O código já tenta gravar `COMPLETED` e faz log do erro. Com a constraint corrigida, o fluxo vai funcionar.

### 4. Corrigir orders existentes (data fix)
Atualizar as ~10 orders com payment SUCCEEDED que ficaram PENDING para COMPLETED via migration.

## Validação Pós-Fix

1. Redeployar `webhook-asaas`
2. Testar pagamento cartão via `create-payment` → confirmar order = COMPLETED
3. Simular webhook de reembolso → confirmar refund registrado, entitlement revogado, ledger atualizado

## Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/` (nova) | DROP + ADD constraint, data fix |
| `supabase/functions/webhook-asaas/index.ts` | Adicionar campos obrigatórios no INSERT de refunds |

## Riscos

- Nenhum risco de regressão — a constraint está sendo expandida, não restrita
- Orders já com entitlements corretos — só o status está desatualizado

