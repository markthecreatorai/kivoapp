

# Plano: Sincronizar preview com lista de produtos da loja

## Problema

O `localProducts` (usado para drag-and-drop) começa como `null` e funciona bem inicialmente. Mas após um reordenamento via drag, `localProducts` recebe um valor e nunca mais é resetado. Depois disso, mutações (excluir, arquivar, publicar) invalidam a query `["all-products"]` e `fetchedProducts` atualiza, mas `localProducts` continua com os dados antigos — e como `products = localProducts ?? fetchedProducts`, o preview fica preso nos dados velhos.

## Correção

**Arquivo:** `src/pages/Store.tsx`

1. Adicionar um `useEffect` para sincronizar `localProducts` com `fetchedProducts` quando a query atualizar (mesmo padrão usado para storefront/theme com dirty flags):

```tsx
useEffect(() => {
  setLocalProducts(null);
}, [fetchedProducts]);
```

2. Nas mutations (`deleteMutation`, `archiveMutation`, `togglePublishMutation`, `duplicateProductMutation`), adicionar `setLocalProducts(null)` no `onSuccess` para forçar o uso de `fetchedProducts` atualizado.

Resultado: o preview atualiza automaticamente quando produtos são excluídos, arquivados, publicados ou duplicados.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/Store.tsx` | Resetar `localProducts` para `null` no `onSuccess` das mutations e via `useEffect` ao receber novos `fetchedProducts` |

