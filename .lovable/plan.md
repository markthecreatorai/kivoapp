

## Aplicar migration pendente: remover constraint uq_community_workspace

### Situação atual
- A constraint `uq_community_workspace` **ainda existe** na tabela `communities` em produção
- O arquivo de migration `20260402002700_allow_multiple_communities_per_workspace.sql` foi criado mas **não foi aplicado**
- O código já usa `onConflict: "slug"` (correto), mas a constraint de workspace impede a criação quando já existe uma comunidade no workspace

### O que precisa ser feito

**1. Aplicar a migration existente** (já está no arquivo `supabase/migrations/20260402002700_allow_multiple_communities_per_workspace.sql`):

```sql
ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS uq_community_workspace;
```

**2. Também remover o índice único legado (se existir como índice separado):**

```sql
DROP INDEX IF EXISTS public.communities_workspace_id_key;
```

O índice `uq_community_workspace` será removido automaticamente com o DROP CONSTRAINT, mas `idx_communities_workspace` (que é um índice normal, não unique) pode permanecer para performance de queries.

### Como aplicar

Vou criar uma nova migration que garante a remoção tanto da constraint quanto de qualquer índice único residual. Após aplicar, a criação de comunidade funcionará normalmente.

### Arquivos
1. Nova migration SQL — `DROP CONSTRAINT IF EXISTS uq_community_workspace` + cleanup de índices únicos legados

### Validação
Após a migration ser aplicada, o upsert com `onConflict: "slug"` vai funcionar corretamente e não haverá mais erro de `uq_community_workspace`.

