# Separação de papéis (Infoprodutor vs Membro) + fluxo de cadastro de membro

## Auditoria — estado atual (verificado)

Onde o papel é definido hoje:
- Não existe campo persistido de tipo de conta. `auth.users.raw_user_meta_data.is_creator` é gravado (`true` em `/signup`, `false` no modal de comunidade) e **nunca é lido** por nenhum guard.
- Papel é inferido em runtime por `src/lib/smartRedirect.ts`: existe `workspace_members` → `/dashboard`; senão `community_members ACTIVE` → `/circles`; senão `user_asset_entitlements` → `/member`; fallback `/circles/explore`.
- `public.user_roles` (`admin`/`moderator`/`user`) serve só para admin de plataforma. `community_members.role` e `workspace_members.role` são papéis internos e já estão corretos/separados.

Causa raiz nº 1 (banco): o gatilho `on_auth_user_created` → `handle_new_user()` cria workspace + `workspace_members` OWNER para **todo** usuário novo, ignorando `is_creator`. Dados atuais: 10 usuários / 10 linhas em `workspace_members`; os 2 usuários de comunidade também têm workspace. Efeito: todo membro é classificado como infoprodutor (`isConsumerOnly` = false, redirect = `/dashboard`).

Causa raiz nº 2 (fluxo/UX de auth do membro):
- `src/pages/MemberLogin.tsx` só faz login (`signInWithPassword` + magic link). **Não existe criar conta** — usuário novo recebe "Email ou senha incorretos" e interpreta como erro de cadastro.
- `MemberLogin.tsx` não usa `useSearchParams`: o `?redirect=` gerado por `src/pages/JoinCommunity.tsx` (linhas 292, 328, 351, 450) é ignorado; após login vai sempre para `/member`.
- Magic link usa `emailRedirectTo` fixo `${origin}/member`, perdendo o destino `/join/:slug`.
- `src/contexts/AuthProvider.tsx` não tem lista `skipRedirectPaths` — ele sempre executa `completePendingCommunityJoin` + `kivo_nav_intent` no `SIGNED_IN`, o que pode competir com o fluxo `/join/:slug`.

Uma correção não substitui a outra: sem a nº 2 o membro não consegue se cadastrar por `/join`; sem a nº 1 ele se cadastra e cai na área de infoprodutor.

## Modelo acordado

`account_type` explícito (`PRODUCER` | `MEMBER`), usado **apenas** para: (a) decidir se o gatilho cria workspace, (b) decidir a rota inicial pós-signup/login. Guards de área continuam lendo a tabela real (`workspace_members` para rotas de produtor, `community_members` para comunidade), então os dois papéis coexistem. Membro pode virar infoprodutor depois com workspace criado on-demand.

## Etapas

### 1. Banco (uma migration)
- Tabela `public.user_account_types` (`user_id` PK → `auth.users`, `account_type` enum `account_type` = PRODUCER|MEMBER, timestamps), com GRANTs, RLS (usuário lê a própria linha; escrita só via funções `security definer`).
- `handle_new_user()` passa a: gravar `account_type` a partir de `raw_user_meta_data->>'is_creator'` (`true` → PRODUCER, `false` → MEMBER, ausente → MEMBER) e **criar workspace apenas quando PRODUCER**.
- Backfill único: PRODUCER para quem já tem `workspace_members`, MEMBER para o resto. A inferência não fica viva no código.
- RPC `ensure_producer_workspace()` (`security definer`): cria workspace + `workspace_members` OWNER e promove `account_type` para PRODUCER, idempotente — base do upgrade in-app.

### 2. Leitura de papel no frontend
- `src/lib/smartRedirect.ts`: `resolveSmartRedirect` lê `user_account_types` primeiro (MEMBER → `/circles` ou `/member`; PRODUCER → `/dashboard`), mantendo o `kivo_nav_intent` com prioridade máxima. `isConsumerOnly` passa a considerar `account_type = 'MEMBER'` como consumidor mesmo sem comunidade ainda (corrige o membro recém-cadastrado que ainda não entrou em comunidade nenhuma).
- `ProtectedRoute` continua igual em contrato; rotas de produtor (`/products/*`, `/store*`, `/dashboard`) exigem workspace real — membro sem workspace vê tela de upgrade ("Quero vender") que chama `ensure_producer_workspace` em vez de cair em `/onboarding` de criador.

### 3. Cadastro de membro em `/member/login`
- Adicionar aba "Criar conta" usando `supabase.auth.signUp` com `data: { is_creator: false }`, `emailRedirectTo` preservando o destino, o guard de email (`useAuthEmailGuard`) e o resolver central `resolveAuthSignupOutcome` (mesmos estados de "já cadastrado" já usados em `/signup`).
- Ler `?redirect=` e `?email=` com `useSearchParams`; após login por senha e após signup, navegar para o `redirect` (fallback `/member`).
- Magic link: propagar o destino em `emailRedirectTo`.

### 4. AuthProvider
- Introduzir `skipRedirectPaths` incluindo `/join`, `/member/login`, `/circles/:slug/about` — nesses caminhos o `SIGNED_IN` não dispara navegação automática, deixando a página dona do fluxo.

### 5. Testes (vitest) e relatório
Cobrir e reportar um por um: (a) novo membro via `/join/:slug` cai na comunidade alvo; (b) aba "Criar conta" existe em `/member/login`; (c) login de membro existente (senha e magic link) vai ao destino certo; (d) `/signup` de infoprodutor continua indo para `/onboarding`; (e) infoprodutor que também é membro mantém os dois papéis sem conflito; (f) membro em rota de produtor recebe upgrade/bloqueio, não onboarding de criador; (g) logout/login preserva `account_type`.

## Notas técnicas
- Arquivos alterados: `src/pages/MemberLogin.tsx`, `src/pages/JoinCommunity.tsx` (propagação de destino), `src/lib/smartRedirect.ts`, `src/contexts/AuthProvider.tsx`, `src/components/ProtectedRoute.tsx`, novo `src/lib/accountType.ts`, novo componente de upgrade, novos testes em `src/test/`.
- Sem alteração em `workspace_role` / `community_member_role`.
- `is_creator` continua sendo gravado no metadata, mas passa a ser apenas entrada do gatilho; a fonte de verdade é `user_account_types`.
- Risco principal: usuários existentes que hoje têm workspace "fantasma" criado sem intenção continuam PRODUCER após o backfill (comportamento inalterado, sem regressão). Rollback: reverter `handle_new_user()` para a versão atual; a tabela nova é aditiva.
