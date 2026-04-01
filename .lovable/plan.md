

## Hotfix: Remover tab "Ranking" do header da comunidade

### Problema
A tab "Ranking" ainda aparece no header de navegação da comunidade (CircleLayout.tsx, linha 78), mesmo após remoções anteriores do bloco de ranking da sidebar.

### Alterações

**1. `src/components/circle/CircleLayout.tsx`**
- Remover a entrada `{ label: "Ranking", icon: Trophy, path: /circles/${slug}/leaderboard }` do array de tabs (linha 78)
- Remover import de `Trophy` se não for usado em outro lugar

**2. `src/App.tsx`** (ou router)
- Manter a rota `/circles/:slug/leaderboard` como redirect para `/circles/:slug/feed` (para não quebrar deep links)
- Ou remover completamente se preferir 404

**3. Limpeza opcional**
- Remover `src/components/circle/CircleRightSidebar.tsx` (arquivo legado não importado)
- A página `CircleLeaderboard.tsx` pode ser mantida caso queira reativar no futuro, ou removida

### Resultado
- Tab "Ranking" desaparece do header em todas as páginas da comunidade
- Nenhuma outra tab é afetada
- Layout permanece estável

