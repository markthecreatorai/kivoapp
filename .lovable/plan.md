

# Plano: Preview do afiliado idêntico à Stan Store com logo Kivo arredondado

## O que muda

O preview do callout para affiliate/referral deve espelhar exatamente o layout da Stan Store: um **ícone pequeno arredondado** (logo Kivo) à esquerda do título, com o botão CTA abaixo. Hoje o preview mostra uma imagem de capa grande acima do texto — não é o layout correto.

## Mudanças

### 1. `src/pages/editor/UrlMediaFlow.tsx`

**Preview callout (affiliate)** — reescrever o bloco `form.cardStyle === "callout"` dentro do `MobilePreview` para o layout Stan Store:

```
┌─────────────────────────┐
│  [🟣 logo]  Título      │
│            arredondado   │
│                          │
│  ┌──────────────────┐   │
│  │   CTA Button     │   │
│  └──────────────────┘   │
└─────────────────────────┘
```

- Importar `kivoReferralLogo` de `@/assets/kivo-referral-logo.png`
- Quando `isAffiliateOrReferral`: usar layout com `flex-row` — logo 48×48 com `rounded-2xl` à esquerda, título à direita
- O logo vem do `form.thumbnailUrl` se definido, senão usa `kivoReferralLogo` como fallback
- Botão CTA abaixo com `bg-primary rounded-xl`

**Preview button (affiliate)** — layout simples: logo pequeno arredondado + título numa row, sem botão extra (o próprio card é o botão).

**Step 2 (Imagem de capa)** — quando não há thumbnail, mostrar o `kivoReferralLogo` como fallback com badge "Padrão" e bordas arredondadas (`rounded-2xl`).

### 2. `src/pages/PublicStorefront.tsx`

No `renderBlock` case `"product"` — quando o produto tem `thumbnail_style === "callout"` (buscar campo na query), renderizar com o layout de logo arredondado + título + CTA, em vez do card genérico com imagem grande.

Atualizar a query de produtos (linha 294) para incluir `thumbnail_style, listing_button_text, delivery_url`.

### 3. `src/components/storefront/StoreProductPreviewRenderer.tsx`

No callout style — quando `thumbnailUrl` está presente, renderizar como ícone arredondado (48×48, `rounded-2xl`) à esquerda do título em `flex-row`, em vez de imagem full-width acima. Isso garante consistência entre editor preview e storefront renderer.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/editor/UrlMediaFlow.tsx` | Importar logo; reescrever preview callout/button para affiliate com layout Stan; fallback no Step 2 |
| `src/pages/PublicStorefront.tsx` | Buscar `thumbnail_style` e `listing_button_text`; renderizar callout com layout logo+título |
| `src/components/storefront/StoreProductPreviewRenderer.tsx` | Callout com ícone arredondado à esquerda do título |

