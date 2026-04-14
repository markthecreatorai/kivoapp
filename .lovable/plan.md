

## Fix: Sincronizar ordem de produtos entre preview e loja publica

### Problema
A reordenacao por drag-and-drop no editor da loja (`Store.tsx`) atualiza apenas o estado local — nunca persiste a ordem no banco de dados. A coluna `storefront_order` ja existe na tabela `products` mas nao e utilizada em nenhum lugar do codigo. O `PublicStorefront.tsx` busca produtos sem ordenacao especifica.

### Plano

**1. Store.tsx — Persistir a ordem ao reordenar**
- No callback `onReorder`, alem de atualizar o estado local, salvar a nova ordem no banco via `supabase.from('products').update({ storefront_order: index }).eq('id', product.id)` para cada produto reordenado
- Usar o debounce existente ou salvar imediatamente apos o drag terminar

**2. Store.tsx — Buscar produtos ordenados por `storefront_order`**
- Alterar a query de fetch de produtos de `.order("created_at", { ascending: false })` para `.order("storefront_order", { ascending: true }).order("created_at", { ascending: false })`

**3. PublicStorefront.tsx — Ordenar produtos por `storefront_order`**
- Adicionar `storefront_order` ao SELECT da query de produtos
- Ordenar os resultados por `storefront_order` ASC, depois `created_at` DESC como fallback

**4. StorefrontPreview.tsx — Garantir consistencia**
- Como o preview recebe `externalProducts` do Store.tsx (ja ordenado localmente), nenhuma alteracao necessaria aqui

### Arquivos alterados
- `src/pages/Store.tsx` — persistir ordem + ordenar query
- `src/pages/PublicStorefront.tsx` — adicionar storefront_order ao fetch e ordenar

