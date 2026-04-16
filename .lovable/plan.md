

# Fluxo de Autenticação Inline para Comunidades — Popup Skool-like

## Resumo
Criar um modal de autenticação (signup/login) integrado na landing da comunidade, com roteamento inteligente pós-login baseado no contexto de navegação do usuário (membro vs owner, comunidade vs workspace).

## Problemas Atuais
1. O botão "Entrar no Grupo" no sidebar faz `<Link to={/circles/${slug}}>` — redireciona ao invés de abrir um modal
2. O botão "Entrar" no header redireciona para `/login?redirect=...` — sai do contexto da comunidade
3. Após login, o `Login.tsx` sempre redireciona para `/dashboard` — ignora a intenção do usuário
4. Não existe tracking de "intenção de navegação" para distinguir owner entrando numa comunidade vs. owner acessando o workspace

## Plano de Implementação

### 1. Criar componente `CommunityAuthModal` (novo arquivo)
**`src/components/circle/CommunityAuthModal.tsx`**

Modal com 3 estados internos: `signup`, `login`, `forgot-password`

**Signup (estado padrão quando vem de "Entrar no Grupo")**:
- Campos: Nome, Sobrenome, Email, Senha
- Botão "CRIAR CONTA"
- Link "Já tem conta? Fazer login" (troca estado para `login`)
- Usa `useJoinCommunity.signupAndJoin()` com `is_creator: false`
- Após signup: redireciona para `/circles/${slug}/feed` (ou verify-email com redirect)

**Login**:
- Campos: Email, Senha
- Link "Esqueceu a senha?" (troca estado para `forgot-password`)
- Link "Não tem conta? Criar conta grátis" (troca estado para `signup`)
- Usa `supabase.auth.signInWithPassword()`
- Após login: executa lógica de roteamento inteligente (ver item 3)

**Forgot Password**:
- Campo: Email
- Usa `supabase.auth.resetPasswordForEmail()`
- Mostra confirmação de email enviado

Design: estilo clean Skool (logo da comunidade ou Kivo no topo, fundo branco, inputs grandes com bordas sutis, botão CTA em cinza escuro, links em azul)

### 2. Integrar o modal no `CircleLayout` e `CircleRightSidebarSkool`

**`CircleLayout.tsx`**:
- Adicionar estado `showAuthModal` e `authModalView` ("signup" | "login")
- Botão "Entrar" no header → abre modal com `initialView="login"` ao invés de redirecionar
- Passar `onJoinClick` callback para `CircleRightSidebarSkool`

**`CircleRightSidebarSkool.tsx`**:
- Receber prop `onJoinClick?: () => void`
- Quando `!member` e `!user`: botão "Entrar no Grupo" chama `onJoinClick()` ao invés de `<Link>`

### 3. Roteamento inteligente pós-login com tracking de intenção

**Lógica no `CommunityAuthModal` após login bem-sucedido:**

```text
1. Verificar se é membro da comunidade atual
   → SIM: redirecionar para /circles/{slug}/feed
   → NÃO: verificar se a comunidade é aberta
     → SIM: auto-join via joinAsExistingUser() e ir para /circles/{slug}/feed
     → NÃO: mostrar CTA de assinatura/aprovação

2. Se o login veio do modal da comunidade:
   → Sempre priorizar a comunidade (não mandar pro /dashboard)
```

**Lógica no `AuthProvider.tsx` / `Login.tsx` para rotas tradicionais:**
- Salvar `sessionStorage.setItem("kivo_nav_intent", JSON.stringify({...}))` com:
  - `origin`: "community" | "landing" | "direct"
  - `community_slug`: slug da comunidade (se aplicável)
  - `timestamp`: Date.now()

**Lógica de redirect no `Login.tsx` (quando não é modal)**:
- Se `nav_intent.origin === "community"` → redirecionar para `/circles/{slug}/feed`
- Se o usuário tem workspaces → `/dashboard`
- Se o usuário só tem comunidades → `/circles/{lastSlug}/feed` (salvar última comunidade acessada em localStorage como `kivo_last_community`)

### 4. Tracking de última comunidade acessada
- Em `CircleLayout.tsx`, quando o layout monta com um slug válido e o usuário está logado, salvar `localStorage.setItem("kivo_last_community", slug)`
- Usado pelo Login.tsx e AuthProvider para redirecionar membros-only

### 5. Ajustar `Login.tsx` para respeitar intent
- Remover o redirect hardcoded para `/dashboard`
- Implementar lógica: verificar `?redirect=` param → `sessionStorage nav_intent` → verificar workspaces → fallback `/dashboard`

## Arquivos Alterados/Criados
1. **`src/components/circle/CommunityAuthModal.tsx`** — NOVO — modal de signup/login/forgot
2. **`src/components/circle/CircleLayout.tsx`** — estado do modal, substituir redirect por modal
3. **`src/components/circle/CircleRightSidebarSkool.tsx`** — prop `onJoinClick`, remover `<Link>`
4. **`src/pages/Login.tsx`** — roteamento inteligente pós-login baseado em intent
5. **`src/contexts/AuthProvider.tsx`** — respeitar intent no `onAuthStateChange` SIGNED_IN

## Sem Regressão
- `useJoinCommunity` já existe e funciona — reutilizado no modal
- O fluxo de signup com `is_creator: false` já está implementado
- Nenhuma mudança em tabelas ou RLS
- Owner que faz login pelo `/login` diretamente continua indo para `/dashboard`

