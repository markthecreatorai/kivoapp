# Circles × Skool Parity — Plano Implementável (Kivo)

Objetivo: aproximar fluxos, IA de navegação e conversão da Skool mantendo identidade visual da Kivo.

## Fase A — Conversão (pricing + join)
- [x] `src/pages/CommunityLanding.tsx`
  - copy de CTA com trial (ex.: "Iniciar X dias grátis")
  - subcopy de cobrança no modal
  - reduzir fricção no modal com alternância signup/login no topo

## Sprint 1 — Feed UX + Composer (concluído)
- [x] `src/components/circle/PostComposer.tsx`
  - copy PT-BR e ações principais mais claras
  - categoria predefinida para reduzir fricção
- [x] `src/components/circle/PostCard.tsx`
  - pinned com destaque visual de "Post importante" em cor primária
- [x] `src/components/circle/PostDetailModal.tsx`
  - hierarquia de comentários/replies mais legível e labels em PT-BR
- [x] `src/pages/circle/CircleFeed.tsx`
  - trigger de composer/empty state mais orientado a criação de post
  - ajustes de microcopy para consistência de navegação

## Sprint 2 — Classroom Progress UX (concluído)
- [x] `src/pages/circle/CircleClassroom.tsx`
  - card de progresso mais evidente no topo da trilha
  - CTA de "Próxima aula" no painel de conteúdo
  - copy de navegação e ações principais em PT-BR
  - progresso real por curso na grade (em vez de 0% fixo)
  - empty states guiados para admin vs membro
  - contador de aulas concluídas na trilha
- [x] `src/components/circle/LessonEditor.tsx`
  - feedback visual mais forte quando aula é concluída
  - botão de continuar para próxima aula após conclusão

## Sprint 3 — Admin Moderation / Applications (em andamento)
- [x] `src/components/circle/admin/AdminMembersTab.tsx`
  - filtros rápidos para pendentes (busca + ordenação)
  - atualização de status da application ao aprovar/rejeitar
  - histórico de decisões recentes (approved/rejected)
  - matriz visual de permissões (owner/admin/moderador)

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
- [x] `src/pages/CommunityDiscovery.tsx`
  - cards com social proof mais forte e microcopy de conversão
- [x] `src/components/circle/admin/*`
  - checklist visual para setup da comunidade (about, links, pricing, discovery)
- [x] QA final de consistência de rotas legacy (`/circle/*` vs `/c/:slug/*`)
  - corrigidos pontos críticos em `CirclePaywall`, `JoinCommunity`, `CirclePostDetail`, `CircleFeed`, `CircleDashboard`, `CircleSpaces`, `CircleRightSidebar`
- [x] `src/components/circle/CircleLayout.tsx`
  - polimento de header/tabs (estado ativo mais evidente e alinhamento de navegação interna)
  - bloqueio de ações admin no modo `?preview=visitor`
