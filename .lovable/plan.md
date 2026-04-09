

# Plano: Editor de "Link de Afiliado Kivo" com URL bloqueada e layout Stan Store

## Problema

Ao clicar "Link de Afiliado Kivo" no `/products/new`, o produto é criado com `format_id: "affiliate"` e redireciona para `UrlMediaFlow`. Esse flow mostra um editor genérico de URL/mídia, com campo de URL editável e 4 estilos de card. O usuário quer que o editor de afiliado seja idêntico ao da Stan Store (screenshot): 3 steps numerados, URL de referral bloqueada, apenas 2 estilos (Button/Callout).

## Mudanças

### 1. `src/pages/NewProduct.tsx` — corrigir format_id

Atualmente o affiliate cria com `format_id: "affiliate"`, mas o `UrlMediaFlow` trata `isAffiliate` e `isReferralLink` separadamente. Unificar: quando `format_id === "affiliate"`, o flow deve buscar o referral link do usuário (como já faz para `referral_link`).

Nenhuma mudança necessária aqui — o `NewProduct` já salva o `referral_link` no metadata. Só preciso garantir que o `UrlMediaFlow` use esse dado.

### 2. `src/pages/editor/UrlMediaFlow.tsx` — modo afiliado com layout StepCard

Quando `isAffiliate === true`:

**Query do referral profile:** Ativar a query `referralProfile` também para `isAffiliate` (hoje só roda para `isReferralLink`).

**Auto-fill URL:** Preencher `targetUrl` com o referral link do profile OU do `initialProduct.metadata.referral_link`, e tornar o campo **read-only**.

**Layout em 3 Steps** (usando `StepCard` existente):

- **Step 1 — "Escolha o estilo"**: Apenas 2 opções: Button e Callout (sem Preview/Embed)
- **Step 2 — "Imagem de capa"**: Upload/URL da thumbnail (400×400 recomendado), com preview e botão trocar/remover
- **Step 3 — "Textos"**: Título (com contador, max 50), e campo "Button URL" com o referral link bloqueado (read-only, estilizado como disabled)

**Preview mobile:** Mantém o preview existente mas simplificado (só Button e Callout).

**Ações footer:** "Delete", "Save As Draft", "Publish" — idêntico ao screenshot.

### 3. Preview mobile

Manter o componente `MobilePreview` interno mas filtrar para mostrar apenas os estilos Button/Callout quando `isAffiliate`.

## Resultado esperado

- Clicar "Link de Afiliado Kivo" → editor abre com 3 steps numerados
- URL de referral aparece bloqueada no Step 3 (campo "Button URL")
- Apenas 2 estilos: Button e Callout
- Preview atualiza em tempo real
- Salvar/Publicar funciona normalmente

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/editor/UrlMediaFlow.tsx` | Renderizar layout StepCard para `isAffiliate`; query referral profile; URL bloqueada; 2 estilos apenas |

