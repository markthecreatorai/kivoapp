

## Fix: Corrigir slug de compartilhamento na sidebar

### Problema
O `CircleRightSidebarSkool.tsx` usa `/c/` no link de compartilhamento (linha 170 e 177), mas a rota canônica agora é `/circles/`.

### Alteração

**`src/components/circle/CircleRightSidebarSkool.tsx`**

- Linha 170: `"/c/${community.slug}"` → `"/circles/${community.slug}"`
- Linha 177: `"/c/{community.slug}"` → `"/circles/{community.slug}"`

### Resultado
- Link copiado e exibido usa `/circles/` consistente com as rotas atuais

