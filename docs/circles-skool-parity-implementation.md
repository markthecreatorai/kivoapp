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

## Sprint 3 — Admin Moderation / Applications (concluído)
- [x] `src/components/circle/admin/AdminMembersTab.tsx`
  - filtros rápidos para pendentes (busca + ordenação)
  - atualização de status da application ao aprovar/rejeitar
  - histórico de decisões recentes (approved/rejected)
  - matriz visual de permissões (owner/admin/moderador)
  - ações em lote para pendências (aprovar/rejeitar selecionados)
  - guardrail de motivo opcional em rejeição em lote
  - confirmação para ações em lote sensíveis
  - bloqueio visual de lote para roles sem permissão

## Sprint 4 — Members + Leaderboard clarity (concluído)
- [x] `src/pages/circle/CircleMembers.tsx`
  - filtros rápidos de ordenação (pontos, atividade recente, sequência)
  - card explicativo de "como ganhar pontos"
  - acesso ao perfil do membro por clique no card
  - posição no ranking exibida no card de membro
- [x] `src/pages/circle/CircleLeaderboard.tsx`
  - dica contextual de origem dos pontos no topo do ranking
  - alternância clara de período (7d / 30d / geral)
- [x] `src/components/circle/MemberProfileModal.tsx`
  - seção de links externos (quando disponíveis)
  - atividade recente mais explícita

## Sprint 5 — Discovery + Conversion (em andamento)
- [x] `src/pages/CommunityDiscovery.tsx`
  - badges de confiança/prova social (atividade, popularidade, curadoria)
  - reforço de sinais de conversão por card
  - indicador de cadência de atividade por comunidade
  - CTA principal em botão no card (mais conversão)
- [x] `src/pages/CommunityLanding.tsx`
  - selos de confiança no sidebar da comunidade
  - microcopy de CTA contextual por tipo (free/trial/paid/aprovação)

## Sprint 6 — Notifications/Messages polish (concluído)
- [x] `src/pages/circle/CircleMessages.tsx`
  - busca rápida de conversas
  - filtro "não lidas"
  - ação de "marcar todas como lidas"
  - indicador de unread no topo da inbox
  - priorização visual e ordenação de conversas não lidas
- [x] `src/pages/circle/CircleSettings.tsx`
  - presets rápidos de preferências (ativar tudo / somente importantes)
- [x] `src/components/circle/NotificationPanel.tsx`
  - filtros por tipo no painel (todas / não lidas / interações / DMs)
  - empty state contextual por filtro

## Sprint 7 — Mobile polish final (concluído)
- [x] `src/components/circle/CircleLayout.tsx`
  - aumento da barra inferior mobile (touch target maior)
  - espaçamento maior nos botões da navegação mobile
- [x] `src/pages/CommunityLanding.tsx`
  - tabs com hit area maior no mobile
  - CTA principal com altura maior para toque
- [x] `src/pages/circle/CircleMessages.tsx`
  - bolhas de mensagem mais confortáveis no mobile
  - botões de filtros com touch target consistente
- [x] `src/pages/circle/CircleFeed.tsx`
  - pills de categoria com área de toque ampliada
- [x] `src/components/circle/NotificationPanel.tsx`
  - filtros no painel com botões mobile-friendly (h-8)

## Sprint 8 — Member CRM & Lifecycle (em andamento)
- [x] `src/components/circle/admin/AdminMembersTab.tsx`
  - segmentação de ciclo (todos, ativos, risco, saíram, banidos)
  - export CSV da lista filtrada
  - integração de filtros de ciclo com lista principal
  - regra de risco ampliada (muted/pending + inativos 14d+)
  - persistência local de filtros de CRM
  - seleção rápida de membros em risco
  - ações operacionais rápidas por segmento (reativar / silenciar inativos 24h)
  - tendência rápida (delta ativos/risco) e "saved views" de CRM
  - remoção de saved view e badges de motivo de risco por membro

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
