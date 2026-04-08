

# Plano: Link de Afiliado Kivo — auto-ativo e pré-configurado

## O que muda

O botão "Link de Afiliado" na página de novo produto deixa de criar um produto e passa a ser o link de indicação da Kivo (como o "Stan Affiliate Link" da Stan Store). Ao clicar, redireciona para `/referrals`. O referral profile deve ser criado automaticamente quando o usuário cria a conta.

## Mudanças

### 1. `src/pages/NewProduct.tsx`
- Trocar o item `affiliate` no array `PRODUCT_FORMATS`:
  - Título: "Link de Afiliado Kivo"
  - Descrição: "Indique a Kivo e receba 20% de comissão recorrente sobre cada assinatura"
  - Ícone: usar a imagem do logo Kivo (importar de `src/assets/`) em vez do ícone `Share2`
- No `handleSelectFormat`, interceptar o formato `affiliate` e redirecionar para `/referrals` em vez de criar um produto draft

### 2. Copiar logo Kivo
- Copiar `user-uploads://kivo-logo-DclmfgjC_1.png` para `src/assets/kivo-referral-logo.png`
- Usar no card como `<img>` em vez do ícone Lucide

### 3. Auto-criar referral profile no signup
- Na `AuthProvider.tsx` ou no fluxo de onboarding, ao detectar novo usuário sem `referral_profiles`, criar automaticamente o perfil com código baseado no nome/email
- Assim o usuário já chega em `/referrals` com tudo pronto para copiar

### 4. `src/pages/ReferralsDashboard.tsx`
- Remover o fluxo de "criar código" manual — se não existe profile, criar automaticamente ao carregar a página (fallback)

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/NewProduct.tsx` | Trocar affiliate para redirecionar a `/referrals`, usar logo Kivo |
| `src/assets/kivo-referral-logo.png` | Novo arquivo — logo Kivo para o card |
| `src/pages/ReferralsDashboard.tsx` | Auto-criar referral profile se não existe |

