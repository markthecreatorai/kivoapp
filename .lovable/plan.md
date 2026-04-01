

## Fix: "Erro ao salvar" — colunas ausentes na tabela `communities`

### Causa raiz
O código tenta salvar `tabs_config`, `tabs_order` e `community_rules` na tabela `communities`, mas **essas colunas não existem no banco**. O cast `as any` esconde o erro do TypeScript, e o Supabase retorna erro real no UPDATE.

Para categorias (`community_spaces`), o `.update()` direto pode ser bloqueado silenciosamente por RLS (mesmo problema dos posts).

### Solução

**1. Migration — adicionar colunas faltantes + RPC para categorias**

```sql
-- Adicionar colunas à tabela communities
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS tabs_config jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tabs_order jsonb DEFAULT '["feed","classroom","members","leaderboard","events","about"]',
  ADD COLUMN IF NOT EXISTS community_rules jsonb DEFAULT '[]';

-- RPC para atualizar categoria (bypass RLS seguro)
CREATE OR REPLACE FUNCTION public.update_community_space(
  p_space_id uuid,
  p_community_id uuid,
  p_patch jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT c.workspace_id INTO v_workspace_id
  FROM communities c WHERE c.id = p_community_id;

  IF NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = v_workspace_id
      AND user_id = auth.uid()
      AND role IN ('OWNER','ADMIN')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE community_spaces
  SET name = COALESCE(p_patch->>'name', name),
      emoji = COALESCE(p_patch->>'emoji', emoji),
      position = COALESCE((p_patch->>'position')::int, position),
      is_visible = COALESCE((p_patch->>'is_visible')::boolean, is_visible),
      only_admins_can_post = COALESCE((p_patch->>'only_admins_can_post')::boolean, only_admins_can_post),
      updated_at = now()
  WHERE id = p_space_id AND community_id = p_community_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN true;
END;
$$;
```

**2. `src/components/circle/admin/AdminCommunityTab.tsx`**

- `saveCommunity`: remover `as any`, usar colunas reais (agora existem)
- `updateCategory`: trocar `.update()` por `.rpc("update_community_space")` com tratamento de erro adequado
- Adicionar `onError` com `toast.error` ao `updateCategory`

### Arquivos alterados
1. Nova migration SQL — colunas + RPC
2. `src/components/circle/admin/AdminCommunityTab.tsx` — usar RPC para categorias, remover `as any`

### Resultado
- "Salvar" persiste tabs, ordem e regras corretamente
- Edição de nome/emoji de categorias funciona via RPC seguro
- Erros reais são exibidos ao usuário

