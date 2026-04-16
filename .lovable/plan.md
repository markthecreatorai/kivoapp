

# Separação Clara: Consumidor vs Creator (Owner)

## Problema Atual
1. **`/signup`** sempre cria um **owner** (`is_creator: true`) e redireciona para `/onboarding` (criação de workspace)
2. **`/login`** sempre redireciona para `/dashboard` (workspace do creator)
3. Usuários que são **apenas consumidores** (membros de comunidades, compradores de cursos) caem no fluxo de creator e ficam confusos
4. O `CommunityAuthModal` resolve isso parcialmente — mas apenas dentro da landing de comunidade. Se o consumidor faz login por `/login`, vai pro dashboard vazio

## Solução

### 1. Roteamento inteligente pós-login baseado em perfil real

Atualizar a lógica de redirect no `Login.tsx` e `AuthProvider.tsx`:

```text
Após login:
  1. Se há nav_intent de comunidade → ir para a comunidade (já existe)
  2. Se o usuário tem workspace (é creator) → /dashboard
  3. Se o usuário tem community_members (é consumidor) → /circles (hub de comunidades)
  4. Se tem user_asset_entitlements (comprou curso/produto) → /member
  5. Fallback → /circles/explore
```

Isso elimina o consumidor caindo num dashboard vazio.

### 2. Separar `/signup` de `/signup` para consumidores

Criar **duas variantes de signup**:
- **`/signup`** — permanece como está (creator, `is_creator: true`, vai para onboarding)
- O `CommunityAuthModal` continua sendo a porta de entrada para consumidores (já funciona com `is_creator: false`)
- Adicionar no `/login` um link contextual: se o usuário não tem workspace após login, oferecer "Explorar comunidades" ao invés de forçar onboarding

### 3. Guard inteligente no `ProtectedRoute`

Atualizar `ProtectedRoute` para não forçar `/onboarding` quando o usuário é apenas consumidor:

```text
Atual: se não tem workspace → redireciona para /onboarding
Novo:  se não tem workspace → verificar se tem community_members ou entitlements
       → SIM: deixar passar (é consumidor, não precisa de workspace)
       → NÃO: redirecionar para /onboarding (é creator novo)
```

### 4. Hub do consumidor (`/circles` como home alternativa)

A página `/circles` (MyCommunities) já existe e lista comunidades do usuário. Torná-la a **home padrão para consumidores**:
- Adicionar card de "Meus Cursos" se tem entitlements de cursos
- Adicionar link para `/member` (área do aluno)
- Mostrar "Explorar comunidades" se não é membro de nenhuma

### 5. Navbar contextual

No `AppSidebar` (dashboard do creator), já mostrar apenas itens de creator. Para consumidores que acessam `/circles`, o `CircleLayout` já tem sua própria navegação.

Não misturar: consumidor nunca vê o sidebar de creator (já é assim).

## Arquivos a Alterar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Login.tsx` | Roteamento inteligente: checar workspaces → community_members → entitlements → fallback |
| `src/contexts/AuthProvider.tsx` | Mesma lógica no `SIGNED_IN` handler |
| `src/components/ProtectedRoute.tsx` | Não forçar onboarding para consumidores (checar memberships) |
| `src/pages/circle/MyCommunities.tsx` | Adicionar seção de cursos/produtos comprados, tornar home completa para consumidores |
| `src/pages/CommunityDiscovery.tsx` | Já tem o auth modal — sem mudança |

## Regra de Roteamento (resumo)

```text
Login/Signup → detectar perfil:
  ┌─ Tem workspace?        → /dashboard (creator)
  ├─ Tem community_member? → /circles (hub de comunidades)
  ├─ Tem entitlements?     → /member (área do aluno)
  └─ Nenhum?               → /circles/explore (descobrir)
```

## Sem Regressão
- Creator existente continua indo para `/dashboard` normalmente
- O `CommunityAuthModal` continua funcionando como está
- Nenhuma mudança em tabelas ou RLS
- O fluxo de `/signup` (creator) permanece intacto

