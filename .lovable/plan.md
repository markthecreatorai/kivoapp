

# Plano: Alinhar thumbnails dos temas com o layout real do preview

## Diagnóstico

Comparei os 4 layouts dos cards de thumbnail (ThemeSection.tsx) com os 4 layouts reais do preview (StorefrontPreview.tsx). Encontrei inconsistências claras:

| Layout | Thumbnail (card pequeno) | Preview real | Problema |
|---|---|---|---|
| **minimal** | Avatar centralizado vertical, blocos empilhados | Avatar horizontal (lado a lado com nome) | Layout completamente diferente |
| **hero** | Gradient + avatar + pills "INSTAGRAM/YOUTUBE" + card com banner | Gradient + avatar centralizado + bio + ícones sociais | Pills e card de produto não existem no preview |
| **banner** | Cover full com texto overlay, sem avatar visível no banner | Cover com avatar + nome sobrepostos no canto inferior | Avatar ausente no thumbnail |
| **classic** | Avatar + dots genéricos + card de produto | Avatar + ícones sociais circulares + blocos | Dots não representam os ícones reais |

## Solução

Reescrever os 4 componentes de thumbnail (`ClassicCard`, `HeroCard`, `BannerCard`, `MinimalCard`) para que reflitam fielmente a estrutura do preview real, em miniatura.

### Mudanças por layout

**MinimalCard** — Trocar de vertical centralizado para horizontal:
- Avatar pequeno à esquerda + nome à direita (igual preview `minimal`)
- Bio truncada abaixo do nome
- Blocos genéricos abaixo

**HeroCard** — Remover pills e card com banner:
- Manter gradient no topo + avatar centralizado
- Adicionar bio curta centralizada
- Substituir pills por ícones sociais pequenos (círculos)
- Bloco genérico simples abaixo

**BannerCard** — Adicionar avatar sobre o banner:
- Manter cover image com overlay gradient
- Adicionar avatar circular + nome no canto inferior do banner (igual preview)
- Bio abaixo do banner
- Blocos genéricos

**ClassicCard** — Trocar dots por ícones sociais:
- Manter avatar centralizado
- Substituir 3 dots genéricos por ícones sociais circulares estilizados
- Bloco de produto simplificado

## Arquivo alterado

| Arquivo | Mudança |
|---|---|
| `src/components/storefront/ThemeSection.tsx` | Reescrever `ClassicCard`, `HeroCard`, `BannerCard`, `MinimalCard` para espelhar os layouts do `StorefrontPreview.tsx` |

## Resultado

As imagens dos temas no carrossel ficam visualmente consistentes com o que o usuário vê no preview à direita ao selecionar cada tema.

