

## Diagnóstico — auditoria login + membros da comunidade

### Causa raiz do erro atual
`column "status" is of type community_member_status but expression is of type text`

A migration anterior (`20260418011534`) corrigiu o cast de `role` mas esqueceu o cast de `status` no `join_community` SQL:

```sql
-- UPDATE branch (escala de role): falta cast em status
UPDATE public.community_members
SET role = p_role::community_member_role,
    ...,
    status = p_status              -- ❌ text → enum
WHERE ...

-- INSERT branch: também falta cast
INSERT INTO public.community_members (..., role, status)
VALUES (..., p_role::community_member_role, p_status);   -- ❌
```

Quando o `p_status` chega via RPC (ex: `"PENDING"` em comunidades com `require_approval`, ou `"ACTIVE"` no fluxo padrão), o Postgres rejeita.

### Auditoria completa do fluxo (4 vetores que tocam `community_members`)

| # | Local | Como insere status | Status |
|---|---|---|---|
| 1 | `join_community` RPC (SQL) | `p_status` text sem cast | ❌ **bug** |
| 2 | Edge `create-circle-subscription` | `.upsert({ status: "ACTIVE" })` via PostgREST | ✅ ok (PostgREST converte) |
| 3 | Edge `circle-subscription` | `.upsert({ status: "ACTIVE" })` via PostgREST | ✅ ok |
| 4 | Triggers (`fn_enforce_sync_owner_admin`, `sync_member_profile_across_communities`, `fn_update_member_count`) | não tocam `status` | ✅ ok |

Enums vigentes (confirmados no DB):
- `community_member_status`: `PENDING, ACTIVE, MUTED, BANNED, LEFT`
- `community_member_role`: `OWNER, ADMIN, MODERATOR, MEMBER`

Todos os call-sites do front (`CircleLayout`, `CommunityAuthModal`, `useJoinCommunity`, `MyCommunities`, `CircleAbout`) já passam valores válidos (`"ACTIVE"` ou `"PENDING"`), então **não há mudança de FE necessária**.

### Fluxo de login auditado (sem outros riscos)
- `AuthProvider` ✅ usa padrão correto (listener antes de `getSession`, refresh silencioso, navegação só em SIGNED_OUT, respeita `kivo_nav_intent` para retornar à comunidade)
- `MemberLogin` ✅ magic link + senha funcionando, redireciona para `/member`
- `CommunityAuthModal` ✅ signup → auto-join (atualmente bloqueado pelo bug do enum) → navega ao feed
- `useJoinCommunity` ✅ delega para `join_community` RPC (mesmo bug)

---

## Plano de correção (1 migration cirúrgica + validação)

### 1. Migration: corrigir cast de `status` em `join_community`

Adicionar `::community_member_status` em **ambos** os pontos (UPDATE e INSERT). Também blindar contra valores inválidos com `CASE` para cair em `'ACTIVE'` se algo inesperado vier:

```sql
CREATE OR REPLACE FUNCTION public.join_community(
  p_community_id uuid, p_user_id uuid,
  p_display_name text DEFAULT '',
  p_role text DEFAULT 'MEMBER',
  p_status text DEFAULT 'ACTIVE'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_safe_status community_member_status;
  v_safe_role community_member_role;
  ...
BEGIN
  -- Coerção segura (defense-in-depth)
  v_safe_status := CASE upper(coalesce(p_status,'ACTIVE'))
    WHEN 'PENDING' THEN 'PENDING'::community_member_status
    WHEN 'ACTIVE'  THEN 'ACTIVE'::community_member_status
    WHEN 'MUTED'   THEN 'MUTED'::community_member_status
    WHEN 'BANNED' THEN 'BANNED'::community_member_status
    WHEN 'LEFT'   THEN 'LEFT'::community_member_status
    ELSE 'ACTIVE'::community_member_status
  END;
  v_safe_role := CASE upper(coalesce(p_role,'MEMBER'))
    WHEN 'OWNER' THEN 'OWNER'::community_member_role
    WHEN 'ADMIN' THEN 'ADMIN'::community_member_role
    WHEN 'MODERATOR' THEN 'MODERATOR'::community_member_role
    ELSE 'MEMBER'::community_member_role
  END;
  ...
  -- usa v_safe_role / v_safe_status nos UPDATE e INSERT
END;
$$;
```

### 2. Verificação pós-deploy (suite de fumaça via DB)

Executar 3 chamadas de teste no SQL editor para garantir os 3 caminhos:
- novo membro `ACTIVE` (free)
- novo membro `PENDING` (require_approval)
- escalada de role (MEMBER → ADMIN) preservando status

### 3. Frontend — sem alteração necessária
Confirmação: nenhum call-site precisa de `as any` adicional ou cast no payload. A fix é 100% server-side.

---

## Arquivos afetados

| Arquivo | Tipo | Mudança |
|---|---|---|
| `supabase/migrations/<novo>.sql` | novo | Recria `join_community` com cast seguro de `status` + `role` |

Zero mudanças em FE / edge functions / testes.

## Riscos & mitigação

| Risco | Mitigação |
|---|---|
| Função em produção → downtime momentâneo | `CREATE OR REPLACE` é atômico, sem janela |
| Valores legados/garbled em `p_status` | `CASE ... ELSE 'ACTIVE'` garante fallback |
| Cliente passar minúsculas | `upper()` normaliza |
| Quebrar `community-access.test.tsx` | Mocks não tocam DB; teste continua verde |

## Definição de pronto
- Cadastro novo via `CommunityAuthModal` cria membro `ACTIVE` sem erro
- Cadastro em comunidade com `require_approval=true` cria membro `PENDING`
- Escalada de role (owner promove membro) ainda funciona
- 211/211 testes existentes verdes
- Sem novos warnings no `supabase--linter`

