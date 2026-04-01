

## Fix: Tabs dinâmicas no CircleLayout baseadas em tabs_config/tabs_order

### Problema
O `CircleLayout` usa uma lista hardcoded de tabs (`getTabItems`) que não inclui "Ranking" e ignora completamente os campos `tabs_config` e `tabs_order` salvos na comunidade pelo admin em AdminCommunityTab.

### Solução

**1. `src/components/circle/CircleLayout.tsx`**

Alterar `getTabItems` para receber o objeto `community` e montar as tabs dinamicamente:

- Definir um mapa completo de tabs possíveis (incluindo `leaderboard` → `/circles/${slug}/leaderboard`):
  ```
  feed → /circles/${slug}/feed (MessageSquare, "Comunidade")
  classroom → /circles/${slug}/classroom (BookOpen, "Classroom")
  members → /circles/${slug}/members (Users, "Membros")
  leaderboard → /circles/${slug}/leaderboard (Trophy, "Ranking")
  events → /circles/${slug}/events (Calendar, "Calendário")
  about → /circles/${slug}/about (Star, "Sobre")
  ```

- Ler `community.tabs_config` (objeto `{feed: true, leaderboard: true, ...}`) e `community.tabs_order` (array de keys ordenadas)
- Filtrar apenas tabs onde `tabs_config[key] === true` (ou não definidas → default true)
- Ordenar conforme `tabs_order`
- Fallback: se ambos forem null, usar a lista default completa (incluindo leaderboard)

- Importar `Trophy` de lucide-react (já não está sendo importado)

**2. Garantir rota `/circles/:slug/leaderboard` existe no App.tsx**
- Verificar que a rota aninhada para leaderboard está presente (provavelmente já existe)

### Resultado
- Tabs refletem exatamente o que o admin configurou (habilitadas/desabilitadas e ordem)
- "Ranking" aparece quando ativo no admin settings
- Nenhuma outra alteração necessária

