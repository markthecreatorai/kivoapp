

# Plano: Auditoria e correção de avatares em todo o app

## Causa raiz

O avatar do usuário é salvo na tabela `storefronts.avatar_url`, mas a função `getUserAvatarUrl()` só verifica `user.user_metadata` (que só tem valor via OAuth/Google). Resultado: páginas que não consultam storefronts mostram iniciais em vez da foto.

## Locais com problema

| Arquivo | Problema |
|---|---|
| `src/pages/CommunityDiscovery.tsx` (linha 125-128) | **Sem AvatarImage** — só mostra `AvatarFallback` com inicial do email |
| `src/pages/circle/MyCommunities.tsx` (linha 194) | Usa `getUserAvatarUrl(user)` que não consulta storefront |
| `src/lib/avatarUtils.ts` | Não consulta storefront, só `user_metadata` |

## Locais já corretos (referência)

- `AppSidebar.tsx` — faz query em `storefronts.avatar_url` e faz fallback para `user_metadata`
- `CircleLayout.tsx` — usa `member.avatar_url` da membership (correto para contexto de comunidade)

## Solução

### 1. Criar hook `useUserAvatar` centralizado

Novo arquivo `src/hooks/useUserAvatar.ts` que:
- Faz query `storefronts.avatar_url` via workspace_id (mesmo padrão do AppSidebar)
- Fallback para `user.user_metadata.avatar_url` / `picture`
- Retorna `{ avatarUrl, displayName, initials }`
- Usa `staleTime` alto para evitar re-fetches desnecessários

### 2. Atualizar `CommunityDiscovery.tsx`

- Importar `useUserAvatar`
- Adicionar `AvatarImage` no avatar do header (linhas 125-128)

### 3. Atualizar `MyCommunities.tsx`

- Substituir `getUserAvatarUrl(user)` pelo hook `useUserAvatar`

### 4. Atualizar `AppSidebar.tsx`

- Substituir a query inline de avatar pelo hook `useUserAvatar` (elimina duplicação)

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/hooks/useUserAvatar.ts` | **Novo** — hook centralizado para avatar do usuário logado |
| `src/pages/CommunityDiscovery.tsx` | Usar hook, adicionar `AvatarImage` |
| `src/pages/circle/MyCommunities.tsx` | Usar hook em vez de `getUserAvatarUrl` |
| `src/components/AppSidebar.tsx` | Usar hook, remover query inline duplicada |

## Resultado

Foto de perfil aparece corretamente em todos os locais do app onde o usuário logado é exibido, usando uma única fonte de dados centralizada.

