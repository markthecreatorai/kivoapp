

## Fix: Esconder preço R$0 de produtos afiliados no preview da loja e storefront público

O filtro para esconder o preço de produtos do tipo "Link de Afiliado" foi aplicado apenas na página de gerenciamento (`Store.tsx`), mas faltou aplicar nos dois componentes de preview/público:

### Alterações

**1. `src/components/storefront/StorefrontPreview.tsx` (linha ~523)**
- Adicionar condição `(product.metadata as any)?.format_id !== "affiliate"` antes de exibir o preço

**2. `src/pages/PublicStorefront.tsx` (linha ~488)**
- Adicionar a mesma condição antes de exibir o preço no storefront público

Ambas as alterações são de uma linha cada — apenas envolver o bloco de preço existente com a verificação de `format_id`.

