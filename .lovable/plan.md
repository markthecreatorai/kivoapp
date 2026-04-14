

## Fix: Sincronizar preços entre o editor de curso e o checkout

### Problema Identificado

O editor de curso (`CourseFlow.tsx`) salva preços na tabela `courses.checkout_price_cents` (em centavos), mas **nunca sincroniza** com a tabela `prices` (em reais). O checkout (`Checkout.tsx`) lê exclusivamente da tabela `prices`.

**Dados atuais no banco** (produto "sdadsa"):
- `courses.checkout_price_cents` = 243 (R$ 2,43)
- `prices.amount` = 297.00 (R$ 297,00) — valor antigo/desatualizado

Isso explica por que o checkout mostra valores diferentes do que foi configurado no editor.

### Plano de Correção

**1. `src/pages/editor/CourseFlow.tsx` — Sincronizar preço com tabela `prices` ao salvar**

Quando o usuário altera `checkout_price_cents` ou `checkout_discount_price_cents`, além de atualizar a tabela `courses`, também atualizar a tabela `prices`:
- `prices.amount` = `checkout_price_cents / 100`
- `prices.compare_at_amount` = se houver desconto, o preço original vira `compare_at_amount` e o desconto vira `amount`
- `prices.type` = `"ONE_TIME"` ou `"RECURRING"` conforme `checkout_price_type`

A sincronização será feita no `handlePublish` e no autosave do checkout tab, garantindo que a tabela `prices` reflita sempre o último estado do editor.

**2. `src/pages/editor/CourseFlow.tsx` — Sincronizar na publicação**

No `handlePublish`, antes de atualizar o status do curso, upsert na tabela `prices` com:
```
amount = checkout_price_cents / 100
compare_at_amount = (se desconto ativo) checkout_price_cents / 100, amount = checkout_discount_price_cents / 100
type = priceType === "subscription" ? "RECURRING" : "ONE_TIME"
```

### Arquivos Alterados
- `src/pages/editor/CourseFlow.tsx` — Adicionar sync com tabela `prices` ao salvar preço e ao publicar

