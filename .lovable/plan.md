

## Fix: Criador não vira OWNER ao criar comunidade via MyCommunities

### Causa raiz

Em `MyCommunities.tsx` linha 134, o criador é inserido diretamente na tabela `community_members` com `role: "OWNER"`. Porém, a política de RLS da tabela só permite insert com `role = 'MEMBER'`:

```sql
-- RLS atual:
with_check: (user_id = auth.uid()) AND (role = 'MEMBER')
```

O insert com `role: "OWNER"` é **silenciosamente rejeitado** pelo RLS. O criador nunca se torna OWNER.

A RPC `join_community` é `SECURITY DEFINER` e **bypassa RLS**, suportando qualquer role. Mas o `MyCommunities` não a usa.

### Mudanças

**`src/pages/circle/MyCommunities.tsx`**

1. Substituir o insert direto (linhas 133-140):
```typescript
// ANTES (falha silenciosamente por RLS):
await supabase.from("community_members").insert({
  community_id: community.id,
  user_id: user.id,
  role: "OWNER",
  ...
});

// DEPOIS (usa RPC SECURITY DEFINER):
await supabase.rpc("join_community", {
  p_community_id: community.id,
  p_user_id: user.id,
  p_display_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Owner",
  p_role: "OWNER",
  p_status: "ACTIVE",
});
```

2. Adicionar criação dos 4 espaços padrão (Geral, Anúncios, Perguntas, Conquistas) após criar a comunidade — mesmo padrão do `CircleDashboard`

3. Remover `CircleDashboard.tsx` (arquivo órfão, sem rota, código duplicado)

### Arquivos alterados
1. `src/pages/circle/MyCommunities.tsx` — usar RPC + criar espaços padrão
2. Deletar `src/pages/circle/CircleDashboard.tsx` — código órfão

### Resultado
- Criador sempre será OWNER (RPC bypassa RLS)
- Espaços padrão criados automaticamente
- Código duplicado eliminado

