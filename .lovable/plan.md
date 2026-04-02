

## Fix: uq_community_workspace constraint violation (race condition)

### Causa raiz
O guard atual faz `select` antes do `insert`, mas existe uma race condition: se o `select` não encontrar a comunidade (por RLS ou timing), o `insert` falha com a constraint. A solução correta é usar **upsert** com `ignoreDuplicates: true`, tornando a operação idempotente.

### Mudanças em `src/pages/circle/CircleDashboard.tsx`

1. Trocar `.insert(...)` por `.upsert(..., { onConflict: 'workspace_id', ignoreDuplicates: true })` na criação da comunidade
2. Após o upsert, se não retornou dados (já existia), buscar a comunidade existente e redirecionar
3. Usar `join_community` RPC (que já tem `ON CONFLICT DO NOTHING`) para o member insert
4. Manter o `onError` com tratamento de 23505 como fallback de segurança

### Resultado
- Operação idempotente sem race condition
- Duplo clique ou retry não causa erro
- Redireciona automaticamente se comunidade já existe

