

# Plano: Corrigir produtos duplicados no preview

## Problema

O `StorefrontPreview` renderiza produtos de **duas fontes independentes**:

1. **Blocos de produto** (linhas 62-79, 118-150): produtos adicionados como blocos individuais na vitrine, buscados via query `preview-products`
2. **Lista externa** (linhas 492-534): TODOS os produtos publicados passados via prop `externalProducts` do Store.tsx

Resultado: um produto que tem um bloco E está publicado aparece **duas vezes**. Além disso, a lista externa mostra todos os publicados sem filtrar os que já têm bloco.

## Correção

**Arquivo:** `src/components/storefront/StorefrontPreview.tsx`

Na seção "Product List from store management" (linha 493-534), filtrar os `externalProducts` para **excluir** os que já estão sendo renderizados como blocos de produto:

```tsx
{externalProducts && (() => {
  // IDs dos produtos já renderizados como blocos
  const blockProductIds = blocks
    .filter(b => b.type === 'product' && b.is_visible)
    .map(b => (b.config as { product_id?: string }).product_id)
    .filter(Boolean);
  
  const filtered = externalProducts
    .filter((p: any) => p.status === 'PUBLISHED' && !blockProductIds.includes(p.id));
  
  return filtered.length > 0 ? (
    <div className="flex flex-col w-full space-y-2.5 px-5 mt-3 relative z-20">
      {filtered.map((product: any) => { /* ... card existente ... */ })}
    </div>
  ) : null;
})()}
```

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/storefront/StorefrontPreview.tsx` | Filtrar `externalProducts` para excluir produtos já presentes como blocos |

