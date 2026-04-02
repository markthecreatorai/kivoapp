

## Remover CommunityLanding e redirecionar para /about

### Problema
A rota `/circles/:slug` renderiza uma página landing separada (`CommunityLanding.tsx`). O `CircleLayout` também tem uma landing inline para não-membros. O usuário quer eliminar ambas e usar a página `/circles/:slug/about` como ponto de entrada para qualquer visitante.

### Mudanças

**1. `src/App.tsx`**
- Remover o import e a rota de `CommunityLanding`
- Trocar `<Route path="/circles/:slug" element={<CommunityLanding />} />` por um redirect: `<Navigate to={...slug + "/about"} replace />`
- Ou melhor: criar um componente inline que lê o slug e redireciona para `/circles/:slug/about` preservando query params (invite, etc)

**2. `src/components/circle/CircleLayout.tsx`**
- Linha 312-314: quando `!user`, em vez de redirecionar para `/circles/${slug}` (que era a landing), redirecionar para `/circles/${slug}/about`
- Linhas 361-449: remover o bloco inteiro da landing inline para não-membros (OPEN / FREE_WITH_PRODUCT). Em vez disso, redirecionar para `/circles/${slug}/about`
- O about page já está dentro do CircleLayout como Outlet, então precisa permitir que não-membros acessem a rota `/about` sem ser bloqueados

**3. `src/components/circle/CircleLayout.tsx` — permitir acesso ao about sem ser membro**
- Antes dos gates de membro (linha 322), verificar se a rota atual é `/about`. Se for, renderizar o layout normal com `<Outlet />` mesmo sem membro
- Isso permite que visitantes logados (mas não membros) vejam a página about com botão de entrar

**4. `src/pages/circle/CircleAbout.tsx`**
- Já funciona para membros e admins. Precisa garantir que funcione também quando `member` é null (visitante) — mostrar conteúdo read-only com botão de entrar

**5. Deletar `src/pages/CommunityLanding.tsx`**
- Arquivo não será mais usado

### Fluxo resultante
```text
/circles/:slug → redirect → /circles/:slug/about
/circles/:slug/about → CircleLayout permite acesso → CircleAbout renderiza
  - Se membro: vê página normal
  - Se não-membro: vê página about read-only + botão "Entrar na Comunidade"
  - Se não logado: vê página about + botão que leva ao login
```

### Arquivos alterados
1. `src/App.tsx` — trocar rota CommunityLanding por redirect
2. `src/components/circle/CircleLayout.tsx` — permitir /about sem membro, remover landing inline
3. `src/pages/circle/CircleAbout.tsx` — garantir funcionalidade para não-membros
4. Deletar `src/pages/CommunityLanding.tsx`

