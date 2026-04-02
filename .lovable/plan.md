

## Reordenar feed e reduzir card de boas-vindas (padrão Skool)

### Problema
1. A ordem dos elementos no feed não segue o padrão Skool (imagem de referência)
2. O card "Bem-vindo! Comece por aqui" ocupa muito espaço, atrapalhando a visualização dos posts fixados
3. O dropdown de filtro mostra "Mais recentes / Mais curtidos" em vez do padrão Skool (Padrão, Novos, Top, Não lidos)

### Mudanças em `src/pages/circle/CircleFeed.tsx`

**1. Reordenar elementos para seguir o Skool:**
```
Composer → Event banner → Live banner → Category pills + filtro → Admin checklist → Member welcome → Posts
```

**2. Atualizar filtro dropdown para padrão Skool:**
- "Padrão" (default — pinned first + recentes)
- "Novos" (new — por data)
- "Top" (top — mais curtidos)
- "Não lidos" (unread — placeholder)

**3. Reduzir tamanho do card de boas-vindas:**
- Remover o card de onboarding hardcoded (linhas 443-482) — já existe o `MemberWelcomeCard` que faz a mesma coisa
- Mover `AdminSetupChecklist` e `MemberWelcomeCard` para depois das pills

### Mudanças em `src/components/circle/MemberWelcomeCard.tsx`

**4. Tornar o card mais compacto:**
- Reduzir padding (px-3 py-2 no header, pb-3 nos tasks)
- Tasks com py-1.5 em vez de py-2.5
- Iniciar colapsado por padrão
- Remover progress bar (ocupa espaço desnecessário)

### Arquivos alterados
1. `src/pages/circle/CircleFeed.tsx` — reordenar elementos, atualizar filtro, remover onboarding duplicado
2. `src/components/circle/MemberWelcomeCard.tsx` — layout mais compacto

