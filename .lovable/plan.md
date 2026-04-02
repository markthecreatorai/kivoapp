

## Fix definitivo: uq_community_workspace

### Causa raiz

O `upsert` com `ignoreDuplicates: true` usa `ON CONFLICT DO NOTHING`, que **não retorna a row existente**. O PostgREST/Supabase JS client interpreta isso como erro em alguns casos, especialmente quando combinado com `.select()`. O fluxo atual falha porque:

1. `upsert(..., { ignoreDuplicates: true })` → não insere, não retorna dados
2. O fallback `select` pode falhar por RLS ou timing
3. O erro da constraint vaza para o `onError`

### Solução

Trocar para `upsert` **sem** `ignoreDuplicates` (faz `ON CONFLICT DO UPDATE`). Isso sempre retorna a row, seja nova ou existente. O update é idempotente pois seta os mesmos valores.

### Mudanças em `src/pages/circle/CircleDashboard.tsx`

```typescript
// ANTES (linha 46-59):
const { data: comm, error } = await supabase
  .from("communities")
  .upsert({...}, { onConflict: "workspace_id", ignoreDuplicates: true })
  .select()
  .maybeSingle();

// DEPOIS:
const { data: comm, error } = await supabase
  .from("communities")
  .upsert({
    workspace_id: currentWorkspace.id,
    name: currentWorkspace.name + " Circle",
    slug,
    description: "Comunidade oficial",
    access_type: "OPEN",
  }, { onConflict: "workspace_id" })
  .select("id,slug")
  .single();

if (error) throw error;
```

Remover o bloco de fallback (linhas 61-75) pois o `upsert` sem `ignoreDuplicates` sempre retorna a row. O resto (join_community RPC, default spaces) permanece igual.

### Arquivo alterado
1. `src/pages/circle/CircleDashboard.tsx`

### Resultado
- `ON CONFLICT (workspace_id) DO UPDATE` sempre retorna a row
- Sem race condition, sem erro de constraint
- Operação 100% idempotente

