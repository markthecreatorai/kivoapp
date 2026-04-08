

# Auditoria: Vincular foto de perfil em todos os avatares do app

## Diagnóstico

Encontrei **35 arquivos** que usam `AvatarFallback` (inicial do nome). O comportamento atual está correto — o `AvatarFallback` do Radix só aparece quando o `AvatarImage` falha ou está vazio. O problema real é que em vários lugares o `src` do `AvatarImage` não está sendo alimentado com a foto de perfil correta.

### Categorias de avatares encontrados

**1. Avatar do usuário logado (owner/creator)** — 2 arquivos
- `AppSidebar.tsx` — usa `resolvedAvatar` (storefront + user_metadata) ✅ OK
- `MyCommunities.tsx` — **NÃO usa foto nenhuma**, só fallback com inicial do email ❌

**2. Avatar de membros de comunidade** — 20+ arquivos
Estes usam `member.avatar_url` vindo da tabela `community_members`. O trigger `trg_sync_member_profile` já propaga avatar entre comunidades, mas depende do campo estar preenchido. Estes estão OK desde que o avatar esteja no banco.

Arquivos: `PostCard`, `PostDetailModal`, `CommentSection`, `ChatSection`, `CircleRightSidebar`, `CircleRightSidebarSkool`, `CircleMembers`, `CircleLeaderboard`, `CircleMessages`, `CircleFeed`, `CircleProfile`, `CirclePostDetail`, `CircleTasks`, `MemberProfileModal`, `LiveStreamViewer`, `EventDetailModal`, `PostComposer`, `AdminMembersTab`, `AdminModerationTab`, `NotificationPanel`

**3. Avatar do header da comunidade (CircleLayout)** — usa avatar do membro logado ✅ se `avatar_url` preenchido

**4. Avatar em storefront/loja** — `StorefrontPreview`, `StoreProductPreviewRenderer`, `ProfileSection` — usam `storefront.avatar_url` ou `profile.avatarUrl` ✅ OK (são da loja, não do user)

**5. Avatar em settings** — `SettingsProfile.tsx` — usa `profile.avatar_url` ✅ OK

**6. Avatar em vendas** — `RecentSales.tsx` — usa `customer_avatar_url` ✅ OK (dados de clientes)

**7. Avatar em onboarding** — `StepProfile.tsx` — usa avatar do perfil em criação ✅ OK

### Problema principal

O arquivo `MyCommunities.tsx` (header da página `/circles`) mostra apenas a inicial do email do usuário, sem sequer tentar usar a foto de perfil. Este é o mais visível.

Além disso, o `CommunitySwitcher.tsx` mostra a inicial da comunidade quando não tem `icon_url` — isso é correto (é o ícone da comunidade, não do user).

## Plano de correção

### Arquivo 1: `src/pages/circle/MyCommunities.tsx`
- No header, o avatar do usuário logado usa apenas `(user.email || "U").charAt(0)` sem `AvatarImage`
- **Corrigir**: buscar `resolvedAvatar` (do user_metadata ou storefront) e usar `AvatarImage` com fallback

### Arquivo 2: Criar utilitário `src/lib/avatarUtils.ts`
- Extrair função `getUserAvatarUrl(user)` que resolve o avatar a partir de `user_metadata.avatar_url`, `user_metadata.picture`, etc.
- Extrair função `getInitials(name, email)` reutilizável (hoje duplicada em `AppSidebar` e `RecentSales`)
- Todos os locais que mostram avatar do **usuário logado** passam a usar esta função

### Arquivo 3: `src/components/AppSidebar.tsx`
- Importar `getInitials` e `getUserAvatarUrl` do utilitário em vez de ter a função local

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/lib/avatarUtils.ts` | Novo — funções `getUserAvatarUrl` e `getInitials` |
| `src/pages/circle/MyCommunities.tsx` | Adicionar `AvatarImage` com foto do perfil no header |
| `src/components/AppSidebar.tsx` | Importar utils do novo arquivo (refactor menor) |

## Nota

Os 20+ arquivos de membros de comunidade já estão corretos — eles usam `member.avatar_url` e o fallback só aparece quando o membro realmente não tem foto. O trigger de sync no banco garante que quando o user define foto em uma comunidade, propaga para as outras.

