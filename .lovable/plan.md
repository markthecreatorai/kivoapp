

## Fix: Eliminar "flash" duplo ao navegar entre páginas do Circle

### Causa raiz

Cada rota de Circle (`/circles/:slug/feed`, `/circles/:slug/classroom`, etc.) cria uma **instância separada** de `<CircleLayout>`, diferente do dashboard que usa `<Outlet>` para persistir o layout. Ao trocar de tab, o React **desmonta** o CircleLayout inteiro (header, sidebar, queries) e **remonta** do zero — causando o flash/piscar.

### Solução

Aplicar o mesmo padrão do `DashboardShell`: usar rota aninhada com `<Outlet>` para que o CircleLayout monte **uma única vez** por comunidade.

### Alterações

**1. `src/components/circle/CircleLayout.tsx`**
- Mudar de `children: ReactNode` para usar `<Outlet />` do react-router-dom
- Manter a prop `showRightSidebar` funcional (pode ser controlada via route state ou contexto)
- Renderizar `<Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>` no lugar de `{children}`

**2. `src/App.tsx` — Reestruturar rotas Circle como aninhadas**

Antes (cada rota monta CircleLayout separadamente):
```
<Route path="/circles/:slug/feed" element={<CircleLayout><CircleFeed /></CircleLayout>} />
<Route path="/circles/:slug/classroom" element={<CircleLayout><CircleClassroom /></CircleLayout>} />
```

Depois (layout persistente com Outlet):
```
<Route path="/circles/:slug" element={<CircleLayout />}>
  <Route path="feed" element={<CircleFeed />} />
  <Route path="classroom" element={<CircleClassroom />} />
  <Route path="members" element={<CircleMembers />} />
  <Route path="events" element={<CircleEvents />} />
  <Route path="about" element={<CircleAbout />} />
  <Route path="settings" element={<CircleSettings />} />
  <Route path="profile" element={<CircleProfile />} />
  <Route path="profile/:memberId" element={<CircleProfile />} />
  <Route path="spaces/:spaceSlug" element={<CircleFeed />} />
  <Route path="post/:id" element={<CirclePostRedirect />} />
  <Route path="admin" element={<CircleFeed />} />
  <Route path="messages" element={<CircleFeed />} />
  <Route index element={<Navigate to="feed" replace />} />
</Route>
```

- Rotas que precisam de `ProtectedRoute` serão envolvidas individualmente no element
- Rotas que precisam de `showRightSidebar={false}` (settings, profile) usarão um wrapper ou route context

**3. Controle de `showRightSidebar` por rota**
- CircleLayout detecta a rota atual via `useLocation()` para decidir se mostra a sidebar direita
- Rotas `/settings` e `/profile` → `showRightSidebar = false`
- Demais → `showRightSidebar = true`
- Isso elimina a necessidade de passar prop por rota

### Resultado
- Header, sidebar, queries de comunidade/membro montam **uma única vez**
- Navegação entre tabs é instantânea (só o conteúdo interno troca)
- Elimina o flash/piscar completamente
- Mesmo padrão já usado com sucesso no DashboardShell

