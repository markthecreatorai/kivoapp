

# Plano: Corrigir preview da loja — ordem de drag e "Meu Link" fantasma

## Problemas

1. **Drag reorder não reflete no preview**: Quando você reordena produtos na aba "Loja", o `localProducts` é atualizado com a nova ordem. Porém o `StorefrontPreview` renderiza os `externalProducts` na ordem original sem respeitar a ordem passada via prop.

2. **"Meu Link" aparecendo no preview**: Existe um bloco do tipo `link` na tabela `storefront_blocks` com o título padrão "Meu Link" (criado automaticamente ao adicionar um bloco de link na aba Vitrine). Ele aparece no preview porque está marcado como visível, mesmo que não tenha URL configurada.

## Correções

### 1. Respeitar ordem dos produtos no preview

**Arquivo:** `src/components/storefront/StorefrontPreview.tsx` (linhas 498-499)

O filtro de `externalProducts` já funciona, mas não respeita a ordem do array `products` passado pelo Store. O array `products` já vem na ordem correta após drag-and-drop. Basta manter a ordem original do array ao filtrar (o `.filter` já preserva ordem, então o problema é que `fetchedProducts` volta com `order by created_at desc`).

A correção real é no `handleDragEnd` do `Store.tsx` — após reordenar localmente, o preview já recebe a nova ordem via prop. Preciso verificar se o `useEffect` que reseta `localProducts` ao receber novos `fetchedProducts` está desfazendo a reordenação. O `useEffect` na linha 819 reseta `localProducts` para `null` quando `fetchedProducts` muda, o que é correto após mutations mas pode conflitar com drag. Solução: adicionar um `dirty flag` para products similar ao usado para storefront/theme, para não resetar durante drag.

**Arquivo:** `src/pages/Store.tsx`
- Adicionar `localProductsDirty` ref
- No `handleDragEnd`, setar `localProductsDirty.current = true`
- No `useEffect` de sync, só resetar se `!localProductsDirty.current`
- Nas mutations (`onSuccess`), resetar o dirty flag junto com `setLocalProducts(null)`

### 2. Filtrar blocos de link sem URL no preview

**Arquivo:** `src/components/storefront/StorefrontPreview.tsx` (linha 99-115)

No `renderBlock`, caso `link`, retornar `null` se a URL estiver vazia:

```tsx
case 'link':
  if (!config.url) return null;
  return ( /* ... existente ... */ );
```

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/Store.tsx` | Adicionar dirty flag para evitar reset de ordem durante drag |
| `src/components/storefront/StorefrontPreview.tsx` | Não renderizar blocos de link sem URL |

