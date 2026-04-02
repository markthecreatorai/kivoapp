

## Fix: Posts, cursos e dados sumiram — query por workspace_id quebra para membros

### Causa raiz

Todas as páginas filhas do CircleLayout (Feed, Classroom, Members, Events, etc.) buscam a comunidade via `eq("workspace_id", currentWorkspace.id)`. Porém, `currentWorkspace` só existe para o **dono** do workspace. Membros comuns não têm workspace, então `currentWorkspace` é null → a query não roda → nenhum dado aparece.

O `CircleLayout` já busca a comunidade corretamente pelo **slug da URL**, mas não passa esse dado para as páginas filhas.

### Solução

Trocar a query de comunidade em todas as 11 páginas filhas para usar o **slug da URL** (`useParams`) em vez de `currentWorkspace.id`. Isso alinha com o padrão do `CircleLayout` e funciona para qualquer usuário (dono, admin ou membro).

### Padrão da mudança (igual em todos os arquivos)

```typescript
// ANTES:
const { currentWorkspace } = useWorkspace();
const { data: community } = useQuery({
  queryKey: ["community", currentWorkspace?.id],
  queryFn: async () => {
    if (!currentWorkspace) return null;
    const { data } = await supabase
      .from("communities").select("*")
      .eq("workspace_id", currentWorkspace.id).single();
    return data;
  },
  enabled: !!currentWorkspace,
});

// DEPOIS:
const { slug } = useParams<{ slug: string }>();
const { data: community } = useQuery({
  queryKey: ["community-slug", slug],
  queryFn: async () => {
    if (!slug) return null;
    const { data } = await supabase
      .from("communities").select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    return data;
  },
  enabled: !!slug,
});
```

Remover `useWorkspace()` onde não for mais usado.

### Arquivos alterados (11 arquivos)

1. `src/pages/circle/CircleFeed.tsx`
2. `src/pages/circle/CircleClassroom.tsx`
3. `src/pages/circle/CircleMembers.tsx`
4. `src/pages/circle/CircleEvents.tsx`
5. `src/pages/circle/CircleLeaderboard.tsx`
6. `src/pages/circle/CircleMessages.tsx`
7. `src/pages/circle/CircleSpaces.tsx`
8. `src/pages/circle/CircleSettings.tsx`
9. `src/pages/circle/CircleAdmin.tsx`
10. `src/pages/circle/CirclePostDetail.tsx`
11. `src/pages/circle/CircleDashboard.tsx`

### Resultado
- Posts, cursos, membros e todos os dados voltam a aparecer
- Funciona para qualquer usuário (dono, admin, membro)
- Query key alinhada com o CircleLayout (`community-slug`)

