
# Plano: Sistema completo de referral de afiliados Kivo

## Estado atual

Existem duas camadas de tracking paralelas e desconectadas:
1. **useAffiliateTracking** — para afiliados de produtos de criadores (affiliate_links, commissions)
2. **useReferralTracking** — para indicacoes Kivo (referral_profiles), mas so salva cookie, nao vincula no signup nem gera comissao

Tabelas ja existentes: `referral_profiles`, `referral_attributions`, `referral_commissions`. Porem `referral_attributions` nao tem campos para `referral_status`, `first_paid_subscription_at`, `referral_terminated_at`, `subscription_id`, `plan_id`. E nenhum webhook processa comissoes de referral.

## Arquitetura proposta

```text
Visitante → ?ref=code → useReferralTracking (cookie 30d, last-click)
                              ↓
                         Signup → Signup.tsx envia referral_code no user_metadata
                              ↓
                         Edge Function handle-referral-signup (trigger ou post-signup)
                              → cria referral_attributions com status pending_subscription
                              ↓
                         Webhook Asaas PAYMENT_CONFIRMED + subscription context
                              → webhook-asaas detecta 1o pagamento de assinatura
                              → ativa comissao, cria referral_commissions
                              ↓
                         Webhook SUBSCRIPTION_DELETED/INACTIVATED
                              → termina vinculo permanentemente
```

## Mudancas

### 1. Migracao SQL — expandir referral_attributions + audit log

Adicionar colunas a `referral_attributions`:
- `referral_status` TEXT DEFAULT 'pending' (pending → pending_subscription → active → terminated)
- `referral_source` TEXT DEFAULT 'affiliate_link'
- `first_paid_subscription_at` TIMESTAMPTZ
- `referral_terminated_at` TIMESTAMPTZ
- `subscription_id` UUID
- `plan_id` TEXT
- `payment_provider_event_id` TEXT

Criar tabela `referral_audit_log`:
- id, referrer_user_id, referred_user_id, event_type, subscription_id, plan_id, payment_provider_event_id, metadata JSONB, created_at

RLS: referrer e referred podem ver seus proprios logs.

### 2. useReferralTracking — last-click + 30 dias

Alterar `src/hooks/useReferralTracking.ts`:
- Mudar cookie para 30 dias (era 90)
- Sempre sobrescrever cookie existente (last-click attribution)
- Salvar tambem em localStorage com expiry (fallback)
- Registrar evento `affiliate_link_clicked` no `referral_audit_log` via supabase insert

### 3. Signup.tsx — vincular referral no cadastro

No `handleSignup` e `handleGoogleSignup`:
- Ler referral_code do cookie/localStorage
- Enviar como `referral_code` no `user_metadata` do signUp
- Apos signup bem-sucedido, criar `referral_attributions` com:
  - referrer_user_id (lookup pelo referral_code na referral_profiles)
  - referred_user_id (novo user)
  - referral_status = 'pending_subscription'
  - signed_up_at = now()
- Registrar evento `account_created_from_referral` no audit log
- Limpar cookie apos vinculacao

### 4. webhook-asaas — ativar comissao no 1o pagamento

Na funcao `handleSubscriptionInvoicePaid`:
- Apos confirmar pagamento de workspace_subscriptions:
  - Buscar referral_attributions onde referred_user_id = sub.user_id AND referral_status = 'pending_subscription'
  - Se encontrar E first_paid_subscription_at IS NULL:
    - Atualizar referral_status = 'active', first_paid_subscription_at = now(), subscription_id, plan_id
    - Criar referral_commissions com 20%, gross = valor pago, status = 'pending'
    - Registrar evento `first_subscription_paid`
  - Se referral_status = 'active' (renovacoes subsequentes):
    - Criar referral_commissions para cada renovacao
  - Se referral_status = 'terminated':
    - NAO gerar comissao. Registrar `resubscription_without_referral`
  - Idempotencia: checar payment_provider_event_id duplicado antes de inserir comissao

### 5. webhook-asaas — terminar vinculo no cancelamento

Na funcao `handleSubscriptionEvent` quando eventType = SUBSCRIPTION_DELETED ou SUBSCRIPTION_INACTIVATED:
- Buscar referral_attributions onde referred_user_id = sub.user_id AND referral_status = 'active'
- Se encontrar:
  - Atualizar referral_status = 'terminated', referral_terminated_at = now()
  - Registrar evento `referral_terminated_on_cancel`

### 6. Edge cases cobertos

| Cenario | Comportamento |
|---|---|
| Clicou link, criou conta dias depois | Cookie 30d persiste, vincula no signup |
| Clicou 2 links diferentes | Last-click: cookie sobrescrito |
| Criou conta mas nunca assinou | referral_status = pending_subscription para sempre |
| Assinou, cancelou, reassinou | Cancelamento → terminated. Reassinatura nao reativa |
| Webhook duplicado | Idempotencia por payment_provider_event_id |
| Upgrade/downgrade sem cancelamento | Vinculo mantido (so DELETED/INACTIVATED termina) |
| Falha de pagamento sem cancelamento | past_due nao termina vinculo |

## Arquivos alterados

| Arquivo | Mudanca |
|---|---|
| Nova migracao SQL | Expandir referral_attributions + criar referral_audit_log |
| `src/hooks/useReferralTracking.ts` | Last-click 30d, localStorage fallback, audit log insert |
| `src/pages/Signup.tsx` | Ler referral, vincular no signup, criar attribution |
| `supabase/functions/webhook-asaas/index.ts` | Comissao no 1o pagamento, comissoes recorrentes, terminacao no cancelamento |

## O que NAO muda

- Sistema de afiliados de produtos (useAffiliateTracking, affiliate_links, commissions) — continua independente
- Fluxo de checkout de produtos
- Dashboard de referrals existente (so passa a ter dados reais)
