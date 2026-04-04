
## Convites com Bônus — Plano de Implementação

### Estado atual
- Tabela `community_invite_links` existe (admin-only, code, max_uses, uses_count)
- Hook `useInviteLinks` e `AdminInviteTab` funcionais
- Join flow via `/join/:slug?invite=<code>`
- Sistema de pontos/gamificação já existe (community_members.points, level)

### O que será criado

#### 1. Migration SQL — 3 tabelas novas

**`member_invite_links`** — link de convite pessoal por membro
- member_id, community_id, code (unique), uses_count, is_active, created_at

**`invite_events`** — rastreio de quem entrou via convite
- invite_link_id, inviter_member_id, invitee_user_id, community_id, event_type (joined|paid|reward_granted), created_at

**`invite_rewards`** — configuração de bônus por comunidade
- community_id (unique), points_per_invite, points_per_paid_invite, reward_type (points|discount|access), is_active

**Anti-fraude:**
- UNIQUE(invitee_user_id, community_id) em invite_events — impede duplicidade
- CHECK: inviter ≠ invitee na aplicação
- Janela mínima de 24h entre criação da conta e concessão de bônus

**RLS:**
- Membros ativos veem seus próprios links e eventos
- Admin configura rewards
- Qualquer um lê links ativos (para validação no join)

#### 2. Hook `useMemberInvite` 
- Gera/busca link pessoal do membro
- Lista convites enviados com status (entrou, pagou, bônus concedido)
- Copiar link

#### 3. Componente `MyInvitesPanel`
- Card no perfil do membro ou tab dedicada
- Link pessoal com botão copiar
- Tabela de convidados (nome, status, bônus)
- Contador de pontos ganhos via convites

#### 4. Lógica de concessão de bônus
- No `useJoinCommunity` — ao entrar via invite, registrar evento + dar pontos
- Anti-fraude: verificar self-invite, duplicidade, janela mínima

#### 5. Config admin — `AdminInviteTab` expandido
- Seção "Bônus de convite" com toggle e configuração de pontos

### Arquivos
1. Migration SQL (3 tabelas + RLS + indexes)
2. `src/hooks/useMemberInvite.ts` — hook do membro
3. `src/components/circle/MyInvitesPanel.tsx` — UI do membro
4. `src/hooks/useJoinCommunity.ts` — adicionar lógica de bônus
5. `src/components/circle/admin/AdminInviteTab.tsx` — seção de config

### Riscos
- Sem impacto no fluxo de join existente (lógica aditiva)
- Rollback: dropar tabelas novas, reverter código
