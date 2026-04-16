# Fase 4 — Fluxos secundários (reuso da base)

Implementação feita sem alterar arquitetura principal, reaproveitando:
- design system de e-mails (Fase 0)
- templates auth no Supabase (Fase 1)
- função única transacional (Fase 2)
- observabilidade (Fase 3)

## Ordem implementada

### 1) Magic link (Supabase Auth)
Arquivo:
- `supabase/auth/templates/magic-link.html`

No Supabase Dashboard → Authentication → Email Templates → Magic Link:
- Subject sugerido: `Seu link de acesso da Kivo`
- HTML: conteúdo do arquivo acima
- Variável: `{{ .ConfirmationURL }}`

### 2) Alteração de e-mail (Supabase Auth)
Arquivo:
- `supabase/auth/templates/change-email.html`

No Supabase Dashboard → Authentication → Email Templates → Change Email Address:
- Subject sugerido: `Confirme seu novo e-mail`
- HTML: conteúdo do arquivo acima
- Variável: `{{ .ConfirmationURL }}`

### 3) Onboarding complementar (transacional)
Template key:
- `onboarding_complementary`

### 4) Cancelamento confirmado (transacional)
Template key:
- `cancellation_confirmed`

### 5) Reativação de assinatura (transacional)
Template key:
- `subscription_reactivated`

---

## Função reutilizada

Mesma função da Fase 2:
- `supabase/functions/send-transactional-email/index.ts`

Sem nova função, sem fila e sem mudanças de arquitetura.

## Exemplos rápidos

```json
{
  "template_key": "onboarding_complementary",
  "recipient": "user@email.com",
  "payload": {
    "name": "Lucas",
    "next_step": "Configurar checkout"
  }
}
```

```json
{
  "template_key": "cancellation_confirmed",
  "recipient": "user@email.com",
  "payload": {
    "name": "Lucas",
    "plan_name": "Creator",
    "valid_until": "30/04/2026"
  }
}
```

```json
{
  "template_key": "subscription_reactivated",
  "recipient": "user@email.com",
  "payload": {
    "name": "Lucas",
    "plan_name": "Creator"
  }
}
```
