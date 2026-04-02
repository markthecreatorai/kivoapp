## Fix: Tornar "Convidar 3 pessoas" rastreável

### Problema
A checklist verifica `member_count >= 3`, mas membros podem nunca chegar a 3. Não há como trackear se o admin realmente convidou alguém.

### Solução
Trocar a validação para: **admin criou pelo menos 1 link de convite** (tabela `community_invite_links`). Isso é rastreável, auditável e já existe no banco.

### Mudanças em `src/components/circle/AdminSetupChecklist.tsx`

1. **Adicionar query** para contar links de convite criados pelo admin:
```typescript
const { data: inviteLinkCount } = useQuery({
  queryKey: ["admin-invite-links-count", community.id],
  queryFn: async () => {
    const { count } = await supabase
      .from("community_invite_links")
      .select("id", { count: "exact", head: true })
      .eq("community_id", community.id);
    return count || 0;
  },
  enabled: !dismissed,
});
```

2. **Trocar condição** de `hasInvited3` (member_count >= 3) para `hasCreatedInvite` (inviteLinkCount >= 1)

3. **Atualizar label** de "Convidar 3 pessoas" para "Criar link de convite"

4. Remover a linha `const hasInvited3 = (community.member_count || 0) >= 3;`

### Resultado
- Task completa assim que o admin cria um link de convite
- Rastreável via banco de dados
- Sem dependência de member_count
