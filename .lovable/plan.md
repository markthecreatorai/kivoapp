

## Fix: Criador não aparece como OWNER e perfil Kivo não é puxado

### Causa raiz (2 bugs)

**Bug 1 — About page insere MEMBER direto, sem usar RPC:**
`CircleAbout.tsx` linha 222 faz `supabase.from("community_members").insert({ role: "MEMBER" })` ao invés de usar a RPC `join_community`. Quando o criador visita `/circles/:slug/about` e clica "Entrar na Comunidade", ele é inserido como MEMBER.

**Bug 2 — RPC `join_community` usa ON CONFLICT DO NOTHING:**
Mesmo que o `CircleDashboard` chame a RPC com `p_role: 'OWNER'` depois, como a row MEMBER já existe, o `ON CONFLICT DO NOTHING` ignora silenciosamente. O criador nunca vira OWNER.

**Bug 3 — Display name usa email prefix:**
Tanto o About quanto o Dashboard usam `user.email?.split("@")[0]` ao invés de buscar o nome do perfil Kivo (`profiles.display_name`).

### Fix imediato — dados atuais

Corrigir o registro atual do Lucas na comunidade `creatoracademyceo`:
- Atualizar role de MEMBER para OWNER
- Atualizar display_name de "lucaslopescarrijo" para "Lucas Carrijo"

### Mudanças no código

**1. `src/pages/circle/CircleAbout.tsx`**
- Trocar o `insert` direto pela RPC `join_community` (que já resolve display_name, avatar e username automaticamente)
- Isso garante consistência e usa SECURITY DEFINER para bypass de RLS

**2. Migration SQL — Alterar RPC `join_community`**
- Trocar `ON CONFLICT DO NOTHING` por `ON CONFLICT (community_id, user_id) DO UPDATE SET role = EXCLUDED.role` somente quando o novo role é mais privilegiado (OWNER > ADMIN > MEMBER)
- Isso permite que a chamada de OWNER sempre promova um MEMBER existente
- Também atualizar display_name e avatar se estiverem vazios

**3. `src/pages/circle/CircleDashboard.tsx`**
- Buscar display_name do perfil Kivo antes de chamar a RPC (fallback para email prefix)

### Resultado
- Criador sempre será OWNER da comunidade que criou
- Display name e avatar puxam dados do perfil Kivo
- Join via about page usa a RPC padronizada
- Usuários existentes com role incorreto podem ser corrigidos via re-chamada da RPC

### Arquivos alterados
1. `src/pages/circle/CircleAbout.tsx` — usar RPC `join_community` no join
2. `src/pages/circle/CircleDashboard.tsx` — buscar display_name do perfil
3. Nova migration SQL — atualizar RPC para `ON CONFLICT DO UPDATE` com promoção de role + fix dados Lucas

