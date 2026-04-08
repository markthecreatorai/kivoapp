

# Plano: Sincronizar Perfil (avatar, nome) entre Comunidades

## Problema

Cada `community_members` row tem seu próprio `avatar_url` e `display_name` independentes. Quando o usuário troca de comunidade, o avatar/nome pode estar vazio em uma e preenchido em outra. Dados confirmados:

- `creatoracademyfree`: avatar preenchido, display_name "Lucas Carrijo"
- `creatoracademyceo`: avatar NULL, display_name "Lucas Carrijo"

Não existe mecanismo para sincronizar dados de perfil entre comunidades do mesmo usuário.

## Solução

Criar um trigger no banco que, ao atualizar `avatar_url` ou `display_name` em qualquer `community_members`, propaga automaticamente para todas as outras memberships do mesmo `user_id` (onde `sync_with_kivo = true`). Também atualizar a RPC `join_community` para copiar avatar/display_name de memberships existentes.

## Passos

### 1. Migration SQL

**a) Função `sync_member_profile_across_communities`** — trigger AFTER UPDATE em `community_members`:
- Quando `avatar_url` ou `display_name` mudar, atualizar todas as outras rows do mesmo `user_id` onde `sync_with_kivo IS NOT FALSE`
- Usar flag para evitar loop infinito (pg_trigger_depth)

**b) Atualizar RPC `join_community`** para:
- Ao criar novo membro, buscar `avatar_url` e `display_name` da membership mais recente do mesmo `user_id` (fallback)
- Preencher automaticamente se os valores não foram fornecidos

**c) Data fix** — sincronizar memberships existentes:
- Para cada `user_id` com múltiplas memberships, copiar o `avatar_url` mais recente (não-null) para as demais

### 2. Frontend — Nenhuma mudança necessária

O frontend já lê `avatar_url` de `community_members`. A sincronização acontece no banco, transparente para o app.

### 3. Validação

- Após migration, conferir que `creatoracademyceo` terá o mesmo avatar de `creatoracademyfree`
- Testar: atualizar avatar em uma comunidade → confirmar propagação para outras

## Detalhes Técnicos

```sql
-- Trigger function (usa pg_trigger_depth para evitar recursão)
CREATE OR REPLACE FUNCTION sync_member_profile_across_communities()
RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  
  UPDATE community_members
  SET avatar_url = COALESCE(NEW.avatar_url, avatar_url),
      display_name = COALESCE(NULLIF(NEW.display_name,''), display_name)
  WHERE user_id = NEW.user_id
    AND id != NEW.id
    AND (sync_with_kivo IS NOT FALSE);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/` (nova) | Trigger de sync + update join_community RPC + data fix |

## Riscos

- Nenhum risco de regressão — trigger só atua em UPDATE de avatar/display_name
- Usuários com `sync_with_kivo = false` são respeitados (não recebem propagação)

