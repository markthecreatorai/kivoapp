
## Fix: Remover sidebar direita na página de Leaderboard

### Problema
A página `/circles/:slug/leaderboard` exibe a sidebar direita, reduzindo o espaço do ranking. Na Skool, o leaderboard ocupa 100% da largura.

### Alteração

**`src/components/circle/CircleLayout.tsx` (linha 466)**

Adicionar `/leaderboard` à condição que esconde a sidebar:

```tsx
// Antes
const hideRightSidebar = location.pathname.includes("/settings") || location.pathname.includes("/profile") || location.pathname.includes("/classroom");

// Depois
const hideRightSidebar = location.pathname.includes("/settings") || location.pathname.includes("/profile") || location.pathname.includes("/classroom") || location.pathname.includes("/leaderboard");
```

### Resultado
- Leaderboard ocupa 100% da largura do conteúdo
- Sidebar continua visível nas demais páginas (feed, events, about, members)
