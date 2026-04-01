

## Fix: PostDetailModal ainda usa `.update()` em vez do RPC `soft_delete_post`

### Causa raiz
O fix anterior corrigiu apenas o `CircleFeed.tsx`. Porém, o **PostDetailModal.tsx** (modal de detalhe do post) tem seu próprio `deletePost` mutation na **linha 238** que ainda usa o método antigo:

```tsx
// ANTIGO (linha 238) — bloqueado silenciosamente por RLS
await supabase.from("community_posts").update({ deleted_at: ... }).eq("id", postId);
```

O session replay confirma que o usuário está excluindo posts pelo modal de detalhe (menu ⋯ → Excluir), não pelo card do feed. Por isso o fix anterior nunca foi acionado.

### Solução

**`src/components/circle/PostDetailModal.tsx` — linha 237-240**

Trocar o `.update()` pelo `.rpc("soft_delete_post")` com tratamento correto de erro:

```tsx
const deletePost = useMutation({
  mutationFn: async () => {
    const { data, error } = await supabase.rpc("soft_delete_post", { p_post_id: postId });
    if (error || !data) throw new Error("Falha ao excluir");
  },
  onSuccess: () => {
    toast.success("Post excluído");
    queryClient.invalidateQueries({ queryKey: ["circle-posts"] });
    onClose();
  },
  onError: () => {
    toast.error("Erro ao excluir post");
  },
});
```

### Arquivos alterados
1. `src/components/circle/PostDetailModal.tsx` — substituir mutation `deletePost`

### Resultado
- Exclusão funciona tanto pelo card no feed quanto pelo modal de detalhe
- Toast de erro aparece quando a exclusão falha de verdade
- Post desaparece do feed após exclusão bem-sucedida

