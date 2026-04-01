

## Mover /communities para /circles/explore com header de Circles

### Objetivo
A página de descoberta de comunidades deve viver em `/circles/explore` e usar o mesmo header/shell do CircleLayout, mas com o logo da Kivo no lugar do nome/ícone da comunidade no switcher.

### Alterações

**1. `src/App.tsx` — Rotas**
- Manter `/circles/explore` apontando para `CommunityDiscovery`
- Mudar `/communities` para redirect legado: `<Navigate to="/circles/explore" replace />`

**2. `src/pages/CommunityDiscovery.tsx` — Envolver com header de Circles**
- Remover o hero/header próprio da página (gradient com "Encontre sua comunidade")
- Envolver o conteúdo com o header padrão de Circles (reutilizar estrutura do CircleLayout header)
- No header: usar `CommunitySwitcher` passando `currentCommunity={null}` — quando null, mostrar logo Kivo em vez de ícone de comunidade
- Manter search, filtros e grid de cards como estão, mas dentro do shell padrão

**3. `src/components/circle/CommunitySwitcher.tsx` — Logo Kivo quando sem comunidade**
- Quando `currentCommunity` é `null`, renderizar o logo Kivo (importar de `@/assets/kivo-logo.svg`) no lugar do ícone/nome
- Manter o dropdown funcional (lista de comunidades, criar, descobrir)
- O texto ao lado do logo pode ser omitido (só logo) — seguindo padrão Skool

**4. Atualizar referências `/communities` em outros arquivos**
- `src/pages/circle/MyCommunities.tsx` — botão "Explorar" → `/circles/explore`
- `src/pages/CommunityLanding.tsx` — link "Ver outras comunidades" → `/circles/explore`
- `src/pages/circle/CommunitySelectPlan.tsx` — link → `/circles/explore`
- `src/pages/JoinRedirect.tsx` — fallback → `/circles/explore`
- `src/components/circle/CommunitySwitcher.tsx` — `handleDiscover` → `/circles/explore`

**5. Header da página Explore**
- Replicar a barra do CircleLayout (sticky header com CommunitySwitcher, notificações, avatar, mensagens)
- Tabs de navegação NÃO aparecem (não há comunidade selecionada)
- Abaixo do header: título "Descubra comunidades" + subtítulo "ou crie a sua" (link para criar)
- Search bar centralizada
- Filtros em pills (categorias) + grid de cards

### Resultado
- `/circles/explore` funciona com o mesmo shell visual das páginas de comunidade
- Logo Kivo aparece no switcher quando não há comunidade ativa
- `/communities` redireciona para `/circles/explore`
- Dropdown do switcher continua funcional

