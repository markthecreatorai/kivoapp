# Circles × Skool Parity — Plano Implementável (Kivo)

Objetivo: aproximar fluxos, IA de navegação e conversão da Skool mantendo identidade visual da Kivo.

## Fase A — Conversão (pricing + join)
- [x] `src/pages/CommunityLanding.tsx`
  - copy de CTA com trial (ex.: "Iniciar X dias grátis")
  - subcopy de cobrança no modal
  - reduzir fricção no modal com alternância signup/login no topo

## Fase B — Paridade de navegação e estados de visita
- [x] `src/pages/CommunityLanding.tsx`
  - aba "Mapa" (placeholder locked) para paridade estrutural
- [x] `src/pages/circle/CircleAbout.tsx`
  - modo preview visitante controlado por query string (`?preview=visitor`)
  - ações de edição bloqueadas quando em preview
- [x] `src/components/circle/CircleRightSidebarSkool.tsx`
  - esconder ações admin/invite no preview visitante
  - exibir CTA de entrada no preview
- [x] `src/components/circle/CircleLayout.tsx`
  - remover link quebrado `/circle/settings` (abrir modal admin)
  - corrigir badge de DM para rota slug-first (`/c/:slug/messages`)

## Fase C — Próximos incrementos (a implementar)
- [x] `src/components/circle/CircleRightSidebarSkool.tsx`
  - CTA contextual para paid/trial (não só "Entrar no Grupo")
- [ ] `src/pages/CommunityDiscovery.tsx`
  - cards com social proof mais forte e microcopy de conversão
- [ ] `src/components/circle/admin/*`
  - checklist visual para setup da comunidade (about, links, pricing, discovery)
- [~] QA final de consistência de rotas legacy (`/circle/*` vs `/c/:slug/*`)
  - corrigidos pontos críticos em `CirclePaywall`, `JoinCommunity`, `CirclePostDetail`, `CircleFeed`
