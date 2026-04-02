

## Fix: "duplicate key value violates unique constraint uq_community_workspace"

### Causa raiz
A tabela `communities` tem constraint `uq_community_workspace` que permite apenas 1 comunidade por workspace. Já existe uma comunidade para o workspace atual, mas em certas condições (cache, timing de query) o botão "Criar Comunidade" aparece e o usuário clica, causando o erro.

### Solução

**`src/pages/circle/CircleDashboard.tsx`**

1. Na mutation `createCommunity`, antes do `insert`, verificar se já existe uma comunidade para o workspace. Se existir, redirecionar direto para o feed em vez de tentar criar.

2. No `onError`, detectar o erro de constraint duplicada e tratar com mensagem amigável + redirect automático (refetch da query para pegar a comunidade existente).

3. Usar `upsert` ou `onConflict` não é necessário — basta o guard + tratamento de erro.

### Mudanças concretas

```typescript
// No início do mutationFn, adicionar:
const { data: existing } = await supabase
  .from("communities")
  .select("slug")
  .eq("workspace_id", currentWorkspace.id)
  .maybeSingle();

if (existing?.slug) {
  navigate(`/circles/${existing.slug}/feed`, { replace: true });
  return existing;
}

// No onError, melhorar tratamento:
onError: (err: any) => {
  if (err?.message?.includes("uq_community_workspace") || err?.code === "23505") {
    queryClient.invalidateQueries({ queryKey: ["community", currentWorkspace?.id] });
    toast.info("Comunidade já existe! Redirecionando...");
  } else {
    toast.error("Erro ao criar comunidade");
  }
}
```

### Arquivos alterados
1. `src/pages/circle/CircleDashboard.tsx` — guard de existência + tratamento de erro de constraint

