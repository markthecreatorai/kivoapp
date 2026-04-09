

# Plano: Corrigir logo Kivo no afiliado — salvar URL real + fallback na vitrine

## Problema raiz

1. O `thumbnailUrl` do formulário inicia como `""` — o logo Kivo é usado apenas visualmente no preview do editor, mas **nunca é salvo no banco**.
2. Produtos existentes têm `thumbnail_style: null` e `thumbnail_url: null`.
3. `PublicStorefront.tsx` não importa o asset `kivo-referral-logo.png`, então não tem fallback.

## Mudanças

### 1. `src/pages/editor/UrlMediaFlow.tsx`

- Alterar o estado inicial: quando `isAffiliateOrReferral` e `thumbnailUrl` está vazio, usar `kivoReferralLogo` (o import do asset) como valor default do form.
- Isso garante que ao salvar, o campo `thumbnail_url` terá o path real do asset (`/assets/kivo-referral-logo-XXXXX.png`).
- Ao "Remover" a imagem, setar `thumbnailUrl` para `""` (permitindo ao usuário não ter imagem).

### 2. `src/pages/PublicStorefront.tsx`

- Importar `kivoReferralLogo` de `@/assets/kivo-referral-logo.png`.
- No bloco callout/button (linha 436), usar fallback: `product.thumbnail_url || kivoReferralLogo` para que mesmo produtos sem thumbnail salva mostrem o logo.
- Também aplicar fallback no card padrão quando o produto tem nome contendo "Kivo" ou "Afiliado" (opcional, menor prioridade).

### 3. `src/components/storefront/StoreProductPreviewRenderer.tsx`

- Importar `kivoReferralLogo`.
- No callout style, usar fallback `product.thumbnailUrl || kivoReferralLogo` para consistência.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/editor/UrlMediaFlow.tsx` | Default `thumbnailUrl` com asset real para afiliados |
| `src/pages/PublicStorefront.tsx` | Import do logo + fallback no render callout/button |
| `src/components/storefront/StoreProductPreviewRenderer.tsx` | Fallback com logo no callout |

