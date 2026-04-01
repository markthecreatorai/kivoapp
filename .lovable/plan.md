

## Fix: Post não é excluído apesar do toast de sucesso

### Causa raiz
O `supabase.from("community_posts").update(...)` retorna `error: null` mesmo quando RLS bloqueia silenciosamente o UPDATE (0 rows afetadas). O toast mostra "Post excluído" mas nada muda no banco. Os logs do Postgres confirmam: `new row violates row-level security policy for table "community_posts"`.

### Solução

**1. Migration — criar função `soft_delete_post` (SECURITY DEFINER)**

Função que:
- Recebe `p_post_id uuid`
- Verifica se o caller (`auth.uid()`) é o autor do post OU OWNER/ADMIN da comunidade
- Se autorizado, faz `UPDATE community_posts SET deleted_at = now() WHERE id = p_post_id`
- Retorna booleano indicando sucesso
- `SECURITY DEFINER` bypassa RLS, com validação interna de permissão

```sql
CREATE OR REPLACE FUNCTION public.soft_delete_post(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_post record;
  v_is_author boolean;
  v_is_staff boolean;
BEGIN
  SELECT community_id, author_id INTO v_post
  FROM community_posts WHERE id = p_post_id AND deleted_at IS NULL;
  
  IF v_post IS NULL THEN RETURN false; END IF;

  -- Check if author
  SELECT EXISTS(
    SELECT 1 FROM community_members WHERE id = v_post.author_id AND user_id = v_user_id
  ) INTO v_is_author;

  -- Check if staff
  SELECT EXISTS(
    SELECT 1 FROM community_members 
    WHERE community_id = v_post.community_id AND user_id = v_user_id 
    AND role IN ('OWNER','ADMIN') AND status = 'ACTIVE'
  ) INTO v_is_staff;

  IF NOT v_is_author AND NOT v_is_staff THEN RETURN false; END IF;

  UPDATE community_posts SET deleted_at = now() WHERE id = p_post_id;
  RETURN true;
END;
$$;
```

**2. `src/pages/circle/CircleFeed.tsx` — usar RPC em vez de `.update()`**

```tsx
onDeletePost={async (id) => {
  const { data, error } = await supabase.rpc("soft_delete_post", { p_post_id: id });
  if (error || !data) {
    toast.error("Erro ao excluir post");
    return;
  }
  queryClient.invalidateQueries({ queryKey: ["circle-posts"] });
  toast.success("Post excluído");
}}
```

### Arquivos alterados
1. Nova migration SQL — `soft_delete_post` function
2. `src/pages/circle/CircleFeed.tsx` — trocar `.update()` por `.rpc("soft_delete_post")`

### Resultado
- Exclusão funciona para autor, OWNER e ADMIN
- Toast só aparece quando o post é realmente excluído
- Post desaparece do feed após exclusão

