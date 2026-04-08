

# Plano: Corrigir enum inválido "ACTIVE" no produto afiliado

## Causa raiz

O código em `NewProduct.tsx` (linha 195) insere `status: "ACTIVE"` para o produto afiliado, mas o enum `product_status` no banco só aceita: `DRAFT`, `PUBLISHED`, `ARCHIVED`.

## Correção

**Arquivo:** `src/pages/NewProduct.tsx` — linha 195

Trocar `"ACTIVE"` por `"PUBLISHED"` para que o produto afiliado já fique visível na vitrine:

```tsx
status: isAffiliate ? "PUBLISHED" : "DRAFT",
```

Uma única linha alterada resolve o erro.

