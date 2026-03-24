# Runbook Operacional — Assinaturas Kivo

## 1. Assinatura travada em "pending"

**Sintoma:** Workspace com status `pending` há mais de 24h.

**Diagnóstico:**
```sql
SELECT id, workspace_id, provider_subscription_id, status, created_at
FROM workspace_subscriptions
WHERE status = 'pending' AND created_at < now() - interval '24 hours';
```

**Verificação no Asaas:**
- Acessar Asaas Dashboard > Cobranças Recorrentes
- Buscar pelo `provider_subscription_id`
- Verificar se assinatura foi criada e se há pagamento pendente/pago

**Ação corretiva:**
1. Se pagamento já foi confirmado no Asaas → executar reconciliação manual:
   - Admin Dashboard > /admin/subscriptions > "Reconciliar"
2. Se assinatura não existe no Asaas → atualizar status para `canceled`:
   ```sql
   UPDATE workspace_subscriptions SET status = 'canceled', canceled_at = now() WHERE id = '<sub_id>';
   ```

**Validação:** Verificar que workspace voltou ao plano FREE e pode tentar novo upgrade.

---

## 2. Cliente pagou no Asaas e app não ativou

**Sintoma:** Pagamento confirmado no Asaas mas `workspace_subscriptions.status` ainda é `pending` ou `past_due`.

**Diagnóstico:**
```sql
-- Verificar webhook recebido
SELECT * FROM webhook_events
WHERE provider = 'ASAAS'
  AND event_type IN ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED')
  AND payload->>'subscription' = '<asaas_subscription_id>'
ORDER BY created_at DESC LIMIT 5;
```

**Causas possíveis:**
- Webhook não chegou (token inválido, URL incorreta)
- Webhook chegou mas falhou (status = FAILED/DEAD_LETTER)
- `provider_subscription_id` não associado à subscription correta

**Ação corretiva:**
1. Se webhook não chegou → verificar config do webhook no Asaas (URL + token)
2. Se webhook falhou → reprocessar: executar reconciliação
3. Fix manual:
   ```sql
   UPDATE workspace_subscriptions
   SET status = 'active',
       current_period_start = now(),
       current_period_end = now() + interval '30 days',
       updated_at = now()
   WHERE provider_subscription_id = '<asaas_sub_id>';
   ```

**Validação:** Usuário acessa /dashboard e vê plano ativo.

---

## 3. Divergência de plano após upgrade/downgrade

**Sintoma:** Usuário fez upgrade mas `plan_code` não mudou, ou fez downgrade e plano mudou imediatamente.

**Diagnóstico:**
```sql
SELECT id, plan_code, next_plan_code, change_effective_at, status, billing_cycle
FROM workspace_subscriptions
WHERE workspace_id = '<workspace_id>';
```

**Regras de negócio:**
- **Upgrade:** Aplica imediatamente (`plan_code` atualizado)
- **Downgrade:** Agenda para próxima renovação (`next_plan_code` + `change_effective_at`)

**Ação corretiva:**
1. Se upgrade não aplicou → atualizar manualmente:
   ```sql
   UPDATE workspace_subscriptions SET plan_code = '<novo_plano>' WHERE id = '<sub_id>';
   ```
2. Se downgrade aplicou antes da hora → reverter:
   ```sql
   UPDATE workspace_subscriptions
   SET plan_code = '<plano_anterior>', next_plan_code = '<plano_destino>', change_effective_at = current_period_end
   WHERE id = '<sub_id>';
   ```

**Validação:** `usePlanLimits()` retorna o plano correto no frontend.

---

## 4. Webhook fora do ar / token inválido

**Sintoma:** Webhook events não sendo processados. Muitos `FAILED` ou nenhum registro recente.

**Diagnóstico:**
```sql
SELECT event_type, status, COUNT(*), MAX(created_at)
FROM webhook_events
WHERE provider = 'ASAAS' AND created_at > now() - interval '24 hours'
GROUP BY event_type, status
ORDER BY MAX(created_at) DESC;
```

**Verificação:**
1. Confirmar URL do webhook no Asaas: `https://wfuwenylojhabresnrvi.supabase.co/functions/v1/webhook-asaas`
2. Confirmar que `ASAAS_WEBHOOK_TOKEN` está configurado como secret no Supabase
3. Verificar logs da edge function: Supabase Dashboard > Edge Functions > webhook-asaas > Logs

**Ação corretiva:**
1. Corrigir URL/token no Asaas Dashboard
2. Reprocessar webhooks pendentes: executar reconciliação
3. Verificar se edge function está deployada e respondendo

**Validação:** Enviar test webhook do Asaas e verificar registro em `webhook_events`.

---

## 5. Taxa de inadimplência alta (past_due)

**Sintoma:** Alerta Telegram com taxa past_due > 10%.

**Diagnóstico:**
```sql
SELECT ws.plan_code, ws.status, ws.last_event_at, w.name
FROM workspace_subscriptions ws
JOIN workspaces w ON w.id = ws.workspace_id
WHERE ws.status = 'past_due'
ORDER BY ws.last_event_at ASC;
```

**Ação corretiva:**
1. Verificar se dunning emails estão sendo enviados
2. Para casos > 7 dias: considerar cancelamento automático
3. Reconciliar para garantir que status está correto

---

## Comandos úteis

**Executar reconciliação manual:**
```bash
curl -X POST https://wfuwenylojhabresnrvi.supabase.co/functions/v1/reconcile-subscriptions \
  -H "x-cron-secret: <CRON_SECRET>"
```

**Executar health check:**
```bash
curl -X POST https://wfuwenylojhabresnrvi.supabase.co/functions/v1/subscription-health-daily \
  -H "x-cron-secret: <CRON_SECRET>"
```

**Dashboard admin:** `/admin/subscriptions`
