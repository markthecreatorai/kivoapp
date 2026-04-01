

## Implementar fluxo completo de assinatura em /circles/:slug/plans

### Problema
Quando o usuário clica "Assinar plano" em um tier pago (sem `linked_product_id`), o código mostra apenas `toast.info("Checkout de assinatura será habilitado em breve.")`. Não há checkout nem chamada ao backend.

Além disso, `community_tiers` (usado pelo frontend) e `circle_plans` (usado pela edge function) são tabelas separadas sem sincronização — os tiers existentes não têm `circle_plans` correspondentes.

### Solução

**1. Migration: auto-criar `circle_plans` a partir de `community_tiers`**
- Criar migration que para cada `community_tier` pago e ativo, insere um `circle_plans` correspondente (se não existir)
- Adicionar coluna `circle_plan_id` em `community_tiers` para manter o link direto
- Trigger ou RPC que sincroniza: quando um tier pago é criado/atualizado, cria/atualiza o `circle_plan` correspondente

**2. Edge function `circle-subscription` — aceitar `tier_id` como alternativa**
- Se `tier_id` é enviado em vez de `plan_id`, buscar o `community_tier` e depois o `circle_plan` associado (ou criá-lo on-the-fly)
- Isso elimina a necessidade do frontend conhecer `circle_plans`

**3. `CommunitySelectPlan.tsx` — Modal de checkout com cartão**
- Ao clicar em tier pago: abrir modal/dialog com formulário de cartão de crédito (nome, número, validade, CVV, CPF)
- Formulário inline no próprio modal (sem redirecionar para outra página)
- Ao submeter: chamar edge function `circle-subscription` com `action: "create"`, `tier_id`, e `card_data`
- Mostrar loading state, tratar erros (exibir mensagem do gateway)
- Ao sucesso: redirecionar para `/circles/:slug/feed` e mostrar toast de boas-vindas

### Detalhes técnicos

**Migration SQL:**
```sql
-- Adicionar referência de tier → plan
ALTER TABLE community_tiers ADD COLUMN IF NOT EXISTS circle_plan_id uuid REFERENCES circle_plans(id);

-- Preencher circle_plans para tiers pagos existentes
INSERT INTO circle_plans (community_id, name, price_cents, currency, interval, trial_days, is_active)
SELECT ct.community_id, ct.name, ct.price_cents, 'BRL',
  CASE WHEN ct.billing_period = 'yearly' THEN 'yearly' ELSE 'monthly' END,
  0, true
FROM community_tiers ct
WHERE ct.is_active = true AND ct.is_free = false AND ct.circle_plan_id IS NULL;

-- Atualizar referência
UPDATE community_tiers ct SET circle_plan_id = cp.id
FROM circle_plans cp
WHERE cp.community_id = ct.community_id
  AND cp.price_cents = ct.price_cents
  AND cp.is_active = true
  AND ct.circle_plan_id IS NULL
  AND ct.is_free = false;
```

**Edge function `circle-subscription/index.ts`:**
- Adicionar lógica: se `tier_id` presente, buscar `community_tiers` → usar `circle_plan_id` ou criar plan on-the-fly
- Manter compatibilidade com `plan_id` existente

**`CommunitySelectPlan.tsx`:**
- Novo state: `checkoutTier` (tier selecionado para checkout)
- Novo componente `CircleCheckoutModal` inline com:
  - Resumo do plano (nome, preço, período)
  - Campos: Nome no cartão, Número, Validade (MM/AA), CVV, CPF
  - Botão "Assinar" com loading
- Chamada via `supabase.functions.invoke("circle-subscription", { body: { action: "create", tier_id, card_data } })`
- Sucesso → join como membro + redirect para feed

### Arquivos alterados
1. **Migration SQL** — criar `circle_plan_id` em `community_tiers`, popular `circle_plans`
2. **`supabase/functions/circle-subscription/index.ts`** — aceitar `tier_id`, resolver plan automaticamente
3. **`src/pages/circle/CommunitySelectPlan.tsx`** — modal de checkout com cartão, chamar edge function, redirect ao sucesso

### Resultado
- Fluxo completo: selecionar plano → preencher cartão → processar pagamento → entrar na comunidade
- Funciona tanto em modo simulação (sem ASAAS_API_KEY) quanto em produção
- Compatível com tiers gratuitos (join direto) e tiers com produto vinculado (redirect checkout)

