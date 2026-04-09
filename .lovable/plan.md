

# Plano: Tornar todos os links dinâmicos conforme domínio acessado

## Problema

Links de referral e outros são persistidos no banco com URL fixa (ex: `https://f37fc079-...lovableproject.com/?ref=lucas460`). Quando o site é acessado de outro domínio (produção, custom domain), os links ficam errados.

## Estratégia

**Princípio**: nunca armazenar domínio completo no banco. Armazenar apenas o `referral_code` e construir a URL completa dinamicamente com `window.location.origin` no momento da exibição/cópia.

## Mudanças

### 1. `src/pages/ReferralsDashboard.tsx`

- Na criação do perfil (linhas 70, 96): continuar salvando `referral_link` no banco (campo obrigatório), mas usar `window.location.origin` (já faz isso — OK)
- Na **exibição** (linhas 122, 149, 250): substituir `profile.referral_link` por URL construída dinamicamente: `${window.location.origin}/?ref=${profile.referral_code}`
- Isso garante que mesmo perfis criados em preview mostrem a URL correta no domínio atual

### 2. `src/pages/NewProduct.tsx`

- Linha 180: já usa `window.location.origin` — OK
- Linha 172-173: ao ler `refProfile.referral_link` do banco para preencher o produto, reconstruir dinamicamente: `${window.location.origin}/?ref=${refProfile.referral_code}`
- Precisa buscar `referral_code` além de `referral_link` na query (linha 169)

### 3. `src/pages/editor/UrlMediaFlow.tsx`

- Linha 90-91: ao auto-preencher `targetUrl` do affiliate, reconstruir: `${window.location.origin}/?ref=${referralProfile.referral_code}`
- Atualizar query (linha 67) para incluir `referral_code`

### 4. `supabase/functions/webhook-pagarme/index.ts`

- Linha 441: substituir `https://kivostore.lovable.app/member/dashboard` por URL dinâmica baseada no `origin` do request ou uma env var `SITE_URL`

### 5. `src/pages/Privacy.tsx` e `src/pages/Terms.tsx`

- Substituir `kivostore.lovable.app` hardcoded por `window.location.host` dinâmico

### 6. Demais arquivos (já corretos)

Os seguintes já usam `window.location.origin` ou `window.location.host` corretamente:
- `MyInvitesPanel.tsx`, `useMemberInvite.ts`, `useInviteLinks.ts`, `AdminInviteTab.tsx`, `CircleRightSidebarSkool.tsx`, `MyCommunities.tsx`, `Store.tsx`

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/ReferralsDashboard.tsx` | Exibição/cópia usa `origin + code` em vez de campo do DB |
| `src/pages/NewProduct.tsx` | Reconstruir referral URL dinamicamente ao criar produto affiliate |
| `src/pages/editor/UrlMediaFlow.tsx` | Auto-fill com URL dinâmica em vez de valor do DB |
| `src/pages/Privacy.tsx` | Domínio dinâmico |
| `src/pages/Terms.tsx` | Domínio dinâmico |
| `supabase/functions/webhook-pagarme/index.ts` | Usar env var `SITE_URL` ou header origin |

