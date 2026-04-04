
## Biblioteca de Downloads — Vault Unificado

### Estado atual
- `MemberLibrary.tsx` já existe com: entitlements → products → delivery_url
- Download com URL assinada funcional para bucket `private-files`
- Filtro por tipo e busca por nome
- Rota `/member/library` já registrada

### Problema
- Modelo atual é 1:1 (produto → 1 arquivo via delivery_url)
- Não suporta múltiplos assets por produto, assets de cursos/comunidades
- Sem auditoria granular de downloads

### Plano

#### 1. Migração SQL — 3 tabelas novas
- **content_assets**: `workspace_id, owner_type (product|lesson|community_resource), owner_id, title, file_path, mime_type, size_bytes`
- **user_asset_entitlements**: `workspace_id, user_id, asset_id, source_type (purchase|subscription|manual), source_id, granted_at, revoked_at`
- **asset_download_logs**: `workspace_id, user_id, asset_id, downloaded_at, ip_hash, user_agent`

RLS:
- Usuários leem assets com entitlement ativo (`revoked_at IS NULL`)
- Admins do workspace gerenciam tudo
- Download logs: próprio usuário + admin

#### 2. Reescrever `MemberLibrary.tsx`
- Query: `user_asset_entitlements` → `content_assets` com join
- Manter fallback para sistema legado (products com delivery_url)
- Filtros: origem (produto/curso/comunidade), tipo de arquivo, período
- Busca por título
- Download seguro com URL assinada (5 min)
- Log em `asset_download_logs`
- Analytics: `library_viewed`, `asset_download_clicked`
- Estado vazio amigável
- Infinite scroll (20 itens por página)

#### 3. Arquivos
| Arquivo | Ação |
|---|---|
| Migration SQL | 3 tabelas + RLS + índices |
| `src/pages/MemberLibrary.tsx` | Reescrita com dual-source (assets + legado) |

#### Critérios de aceite
- ✅ Usuário só vê assets com entitlement ativo
- ✅ Links expiram em 5 minutos
- ✅ Filtros e busca sem degradação
- ✅ Sem acesso direto ao storage sem autorização
- ✅ Fallback mantém products com delivery_url funcionando

#### Riscos
- Tabelas novas ficam vazias até criadores cadastrarem assets — fallback legado garante continuidade
- Rollback: drop 3 tabelas + reverter MemberLibrary
