

## Ocultar preço R$ 0,00 para produtos sem preço (lead magnets)

### Problema
Produtos gratuitos como lead magnets têm `price.amount = 0` na tabela `prices`. As telas da loja (Store.tsx), storefront pública (PublicStorefront.tsx) e preview (StorefrontPreview.tsx) exibem "R$ 0,00" em vez de omitir o valor.

### Correção

Adicionar a condição `price.amount > 0` em todos os locais que renderizam o preço:

**1. `src/pages/Store.tsx`** (2 ocorrências — desktop e mobile)
- Linha ~269: `{price && (product.metadata as any)?.format_id !== "affiliate" && ...}`
  → `{price && price.amount > 0 && (product.metadata as any)?.format_id !== "affiliate" && ...}`
- Linha ~579: mesma alteração

**2. `src/pages/PublicStorefront.tsx`** (2 ocorrências — desktop e mobile)
- Linha ~491: mesma condição
- Linha ~783: mesma condição

**3. `src/components/storefront/StoreProductPreviewRenderer.tsx`** — verificar se também renderiza preço e aplicar a mesma lógica

**4. `src/components/checkout/ProductSummary.tsx`** — adicionar guard para não exibir bloco de preço quando `price.amount === 0`

### Resultado
Lead magnets e outros produtos gratuitos não exibirão "R$ 0,00" em nenhuma tela da loja.

