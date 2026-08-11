# Kivo — Master Checklist de QA para Lançamento do MVP

## 1. Cabeçalho

| Campo | Valor |
|---|---|
| Commit-base | `9c871a74` (HEAD na execução da Onda 2, 2026-08-11 UTC; descendente de `68f2afbd`, que inclui `529448c2`) |
| Data de emissão | 11/08/2026 |
| Autor | Engenharia Kivo (documento operacional de homologação) |
| Ambientes | `DEV` (preview Lovable + Supabase dev), `SANDBOX` (Asaas sandbox), `PROD` (kivohub.com.br + Supabase prod) |
| Front prod | https://kivohub.com.br · Preview: https://id-preview--f37fc079-29a8-4d96-817d-6aff69b6af48.lovable.app |
| Backend | Supabase ref `wfuwenylojhabresnrvi` (Auth, Postgres/RLS, Storage, 60+ Edge Functions, pg_cron) |
| Gateway | Asaas (chaveado por `ASAAS_ENV`) |
| E-mail | Resend via `mail.kivohub.com.br` |
| Escopo | Aplicação inteira: rotas públicas, dashboard produtor, Circles, área de membro, admin/ops, Edge Functions, jobs, RLS |

**Regra de GO/NO-GO**

- **NO-GO imediato** se existir **qualquer P0 com status REPROVADO ou BLOQUEADO**, ou se qualquer P0 permanecer **NÃO TESTADO**.
- **NO-GO** se houver **mais de 2 P1 REPROVADOS** ou qualquer P1 reprovado em módulo financeiro / autenticação / RLS.
- **GO condicional** com P2 reprovados desde que exista mitigação documentada (feature flag OFF, rota oculta ou aviso na UI) e ticket aberto com prazo.
- **P3** nunca bloqueia lançamento.
- Todo caso financeiro (`Tipo = financial`) exige **evidência dupla**: print/print-JSON da UI **e** consulta SQL/log correspondente.

---

## 2. Critérios, prioridades e status

**Prioridades**

| Código | Nome | Definição operacional |
|---|---|---|
| **P0** | Bloqueador | Perda/duplicação de dinheiro, vazamento de dados entre workspaces/usuários, impossibilidade de cadastrar/logar, checkout quebrado, entrega de produto não ocorre, app não carrega. |
| **P1** | Alta | Fluxo principal degradado com contorno manual; erro visível em jornada de receita; job crítico falhando com recuperação manual. |
| **P2** | Média | Funcionalidade secundária quebrada, UX ruim, inconsistência visual relevante, relatório incorreto sem impacto contábil. |
| **P3** | Baixa | Cosmético, copy, microinteração, melhoria. |

**Status permitidos**

`NÃO TESTADO` · `APROVADO` · `REPROVADO` · `BLOQUEADO` (dependência externa/ambiente impede execução) · `N/A` (não aplicável ao escopo/flag do MVP)

**Convenção das tabelas.** Todas as tabelas de caso usam as colunas obrigatórias abreviadas:

`ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status`

As colunas **Responsável**, **Data de execução** e **Bug vinculado** são preenchidas na execução; nascem vazias (`—`) e devem ser registradas na planilha espelho ou diretamente aqui. O status inicial de **todos** os casos é `NÃO TESTADO`.

Tipos: `unit` · `integration` · `API` · `E2E` · `manual` · `financial` · `security`.
Risco de dados/dinheiro: `nenhum` · `baixo` · `médio` · `alto` (alto = movimenta saldo/cobrança real).

---

## 3. Escopo essencial do MVP

### 3.1 Obrigatório para lançar (não há GO sem isso)

| Área | Justificativa |
|---|---|
| Autenticação produtor + membro com verificação por código de 4 dígitos | Porta de entrada única do app |
| Segregação de papéis PRODUCER × MEMBER e criação de workspace só pós-confirmação | Evita workspaces órfãs e privilégio indevido |
| Onboarding + criação de workspace + limites de plano | Base do produto |
| Produtos: digital, curso, lead magnet, comunidade, recorrente | Portfólio mínimo de oferta |
| Loja pública (`/:slug`) e página de checkout | Superfície de receita |
| Checkout Asaas: PIX, cartão, boleto, cupom, order bump | Receita |
| Webhook Asaas + post-purchase + entitlements + entrega | Sem isso o cliente paga e não recebe |
| Financeiro: splits, wallet_ledger, holds, reservas, saldo, payout | Dinheiro do criador |
| Assinaturas Kivo SaaS + comunidade + recorrente | Receita recorrente |
| Circles núcleo: join/paywall, feed, posts, comentários, membros, admin | Feature principal de retenção |
| Área do membro: `/member`, biblioteca, curso, progresso, certificado | Entrega |
| E-mails transacionais (Resend) | Confirmação, entrega, dunning |
| RLS de todas as tabelas sensíveis + CORS + verify_jwt | Segurança |
| Observabilidade mínima: health-check, ops-alerts, logs de Edge Functions | Operação |

### 3.2 Ocultar via feature flag / rota não divulgada no MVP

| Item | Ação recomendada | Observação |
|---|---|---|
| Lead Magnet Editor v2 (`lm_v2_state`) | Flag OFF em PROD | Rollback documentado; validar paridade com v1 |
| AutoDM / Instagram (`/autodm`) | Ocultar do menu | Dependência de API externa não homologada |
| WhatsApp (`whatsapp-send`, Evolution API) | Ocultar | Requer instância externa |
| Fiscal/NFSe (`/fiscal`, `emit-nfse`) | Flag OFF ou "beta" | Integração eNotas/Focus não conciliada |
| Appointments (`/appointments`, `/book/:slug`) | Beta restrito | Fluxo de agenda pouco coberto por testes |
| `create-asaas-account` (split nativo) | Depreciado — manter desligado | Já documentado como inativo |
| `simulate-installments`, `test-asaas` | Não expor em PROD | Ferramentas de diagnóstico |
| Analytics executivo / GTM / Acquisition | Restrito a admin Kivo | Já protegido por AdminRoute |

### 3.3 Pós-MVP (não bloqueia)

Multi-workspace real com troca de contexto na UI · Lives multi-provedor avançadas · Experimentos A/B em escala · Segmentação avançada de leads · Exportações LGPD self-service · App mobile nativo · Marketplace/descoberta pública ranqueada.

---

## 4. Perfis e matriz de acesso

| # | Perfil | Como obter | Escopo esperado |
|---|---|---|---|
| PF-01 | Visitante (anônimo) | Sem sessão | Landing, `/planos`, `/privacy`, `/terms`, `/:slug`, `/checkout/:slug`, `/circles/explore`, `/circles/:slug/about`, `/verify/:code`, `/book/:slug`, `/affiliate/apply/:workspaceSlug` |
| PF-02 | Produtor OWNER | Signup `account_type=PRODUCER` confirmado | Todo o dashboard, editor de loja, financeiro, saque, settings do workspace |
| PF-03 | Produtor ADMIN (workspace) | Convite como ADMIN | Dashboard sem operações destrutivas de billing/owner |
| PF-04 | Produtor MEMBER (workspace) | Convite como MEMBER | Leitura operacional; sem financeiro/saque |
| PF-05 | Membro Circles | Signup `/member/login` (MEMBER, sem workspace) | `/circles`, comunidades das quais participa, `/member/*` |
| PF-06 | Dono de comunidade | Criou a comunidade no workspace | Todas as abas admin do Circle |
| PF-07 | Moderador de comunidade | Promovido pelo dono | Moderação, denúncias, posts, membros (sem billing) |
| PF-08 | Membro de comunidade | Join aprovado/pago | Feed, spaces, eventos, classroom, tarefas, mensagens |
| PF-09 | Afiliado | Aprovado em `/affiliate/apply/:workspaceSlug` | `/affiliate/dashboard`, links, comissões |
| PF-10 | Comprador/aluno | Pedido pago | `/member`, `/member/library`, `/member/course/:id`, `/member/billing`, certificados |
| PF-11 | Admin Kivo | E-mail em `ADMIN_EMAILS` + `is_admin_user` | `/ops/*`, `/admin/*`, `/gtm/*`, `/acquisition`, `/analytics/executive` |
| PF-12 | **Híbrido** produtor+membro | Mesma conta com workspace e vínculos de comunidade | Deve acessar as duas áreas sem conflito de redirect |
| PF-13 | **Híbrido** membro→produtor (upgrade) | `ProducerUpgradePrompt` / `ensure_producer_workspace` | Cria workspace idempotente e migra para PRODUCER |

### 4.1 Matriz papel × área (esperado)

| Área | PF-01 | PF-02 | PF-03 | PF-04 | PF-05 | PF-08 | PF-09 | PF-10 | PF-11 |
|---|---|---|---|---|---|---|---|---|---|
| Landing/públicas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/dashboard` e afins | ⛔→/login | ✅ | ✅ | ✅ | ⛔ upgrade prompt | ⛔ | ⛔ | ⛔ | ✅ |
| Financeiro/saque | ⛔ | ✅ | parcial (validar) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ |
| `/circles` | ⛔→/login | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Circle admin | ⛔ | dono/mod | dono/mod | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ |
| `/member/*` | ⛔ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/admin/*`, `/ops/*` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ |

> **HIPÓTESE A VALIDAR (H-01):** o código expõe apenas `ProtectedRoute` (workspace/sessão) e `AdminRoute` (e-mail admin). Não foi localizada checagem de papel OWNER/ADMIN/MEMBER **dentro** do dashboard do produtor — ou seja, PF-03/PF-04 podem ter o mesmo acesso de PF-02. Confirmar em execução (casos `SEC-13` a `SEC-16`).

---

## 5. Rotas — cobertura 1:1 com `src/App.tsx`

### 5.1 Rotas públicas e de autenticação

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RT-001 | Rotas | `/` landing | PF-01 | P0 | Sem sessão | 1. Abrir `/` | 200, hero, CTA, tracking dispara | E2E | PROD | nenhum | print + HAR | NÃO TESTADO |
| RT-002 | Rotas | `/planos` | PF-01 | P1 | — | 1. Abrir `/planos` | Planos FREE/CREATOR/CREATOR_PRO com preços corretos | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-003 | Rotas | `/privacy` | PF-01 | P2 | — | 1. Abrir | Conteúdo LGPD em PT-BR | manual | PROD | nenhum | print | NÃO TESTADO |
| RT-004 | Rotas | `/terms` | PF-01 | P2 | — | 1. Abrir | Termos completos | manual | PROD | nenhum | print | NÃO TESTADO |
| RT-005 | Rotas | `/login` | PF-01 | P0 | — | 1. Abrir | Form e-mail+senha, link Google se exposto | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-006 | Rotas | `/signup` | PF-01 | P0 | — | 1. Abrir | Form de criador | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-007 | Rotas | `/forgot-password` | PF-01 | P1 | — | 1. Abrir | Form de e-mail | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-008 | Rotas | `/reset-password` | PF-01 | P1 | Link com hash `#` válido | 1. Abrir via link do e-mail | Form de nova senha; sem hash → erro amigável | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-009 | Rotas | `/verify-email` | PF-01 | P1 | Conta não confirmada | 1. Abrir | Instrução + reenvio de código | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-010 | Rotas | `/auth/callback` | PF-01 | P1 | OAuth Google | 1. Concluir OAuth | Redireciona sem loop | E2E | PROD | baixo | vídeo | NÃO TESTADO |
| RT-011 | Rotas | `/resend-verification` | PF-01 | P3 | — | 1. Abrir | Redirect 302 para `/verify-email` | E2E | PROD | nenhum | print URL | NÃO TESTADO |
| RT-012 | Rotas | `/pricing` | PF-01 | P2 | — | 1. Abrir | Página de planos interna | manual | PROD | nenhum | print | NÃO TESTADO |
| RT-013 | Rotas | `/circles/explore` | PF-01 | P1 | ≥1 comunidade pública | 1. Abrir | Lista de comunidades públicas | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-014 | Rotas | `/communities` → `/circles/explore` | PF-01 | P3 | — | 1. Abrir | Redirect | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-015 | Rotas | `/circles/discover` → `/circles/explore` | PF-01 | P3 | — | 1. Abrir | Redirect | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-016 | Rotas | `/circle` → `/circles` | PF-05 | P3 | Logado | 1. Abrir | Redirect | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-017 | Rotas | `/c/:slug` e `/c/:slug/*` legado | PF-01 | P2 | Slug real | 1. Abrir | Redirect para `/circles/:slug/...` preservando subpath | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-018 | Rotas | `/join/:slug` | PF-01 | P0 | Convite ativo | 1. Abrir sem sessão | Guarda intenção e leva a login/signup; após auth entra na comunidade | E2E | PROD | baixo | vídeo | NÃO TESTADO |
| RT-019 | Rotas | `/verify/:code` certificado | PF-01 | P2 | Certificado emitido | 1. Abrir código válido e inválido | Válido: dados do aluno; inválido: mensagem clara | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-020 | Rotas | `/book/:productSlug` | PF-01 | P2 | Produto de agenda ativo | 1. Abrir | Calendário de horários | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-021 | Rotas | `/affiliate/apply/:workspaceSlug` | PF-01 | P1 | Programa aberto | 1. Abrir e aplicar | Solicitação registrada | E2E | PROD | baixo | print + SQL | NÃO TESTADO |
| RT-022 | Rotas | `/affiliate/dashboard` | PF-09 | P1 | Afiliado aprovado | 1. Abrir | Links, cliques, comissões | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-023 | Rotas | `/checkout/:productSlug` | PF-01 | P0 | Produto publicado | 1. Abrir | Checkout renderiza produto e preço corretos | E2E | SANDBOX | baixo | print | NÃO TESTADO |
| RT-024 | Rotas | `/order/success/:orderId` | PF-10 | P0 | Pedido existente | 1. Abrir | Status do pedido + CTA de acesso | E2E | SANDBOX | baixo | print | NÃO TESTADO |
| RT-025 | Rotas | `/upsell/:offerId` | PF-10 | P1 | Oferta configurada | 1. Abrir pós-compra | Oferta e recusa funcionam | E2E | SANDBOX | médio | vídeo | NÃO TESTADO |
| RT-026 | Rotas | `/:slug` storefront público | PF-01 | P0 | Loja publicada | 1. Abrir slug válido | Loja com blocos e produtos | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-027 | Rotas | `/:slug` slug reservado | PF-01 | P1 | Usar slug de `reserved-slugs.ts` | 1. Abrir `/admin`, `/api`, `/login`… | NotFound, nunca storefront | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-028 | Rotas | `*` NotFound | PF-01 | P2 | — | 1. Abrir `/rota-inexistente-xyz` | 404 com link de volta | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-029 | Rotas | `/member/login` | PF-01 | P0 | — | 1. Abrir | Abas Entrar/Criar conta | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-030 | Rotas | `/billing/cancel` | PF-02 | P2 | — | 1. Abrir | Mensagem de cancelamento | E2E | PROD | nenhum | print | NÃO TESTADO |

### 5.2 Rotas protegidas do produtor (`ProtectedRoute`)

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RT-031 | Dashboard | `/dashboard` | PF-02 | P0 | Workspace ativo | 1. Logar 2. Abrir | KPIs carregam sem erro de RLS | E2E | PROD | nenhum | print + console | NÃO TESTADO |
| RT-032 | Dashboard | `/onboarding` | PF-02 | P0 | Sem workspace | 1. Confirmar conta 2. Entrar | Wizard de onboarding | E2E | PROD | baixo | vídeo | NÃO TESTADO |
| RT-033 | Dashboard | `/store` (tabs) | PF-02 | P0 | — | 1. Abrir `/store?tab=loja` | Lista de produtos | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-034 | Dashboard | `/products` → `/store?tab=loja` | PF-02 | P3 | — | 1. Abrir | Redirect | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-035 | Dashboard | `/products/new` | PF-02 | P0 | Limite de plano não atingido | 1. Abrir | Seleção de tipo de produto | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-036 | Dashboard | `/products/:id/edit` | PF-02 | P0 | Produto existente | 1. Abrir | Editor com tabs e preview | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-037 | Dashboard | `/products/:id/course-builder` | PF-02 | P0 | Produto tipo curso | 1. Abrir | Builder de módulos/aulas | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-038 | Dashboard | `/store/editor` | PF-02 | P0 | — | 1. Abrir | Editor de loja com preview | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-039 | Dashboard | `/analytics` | PF-02 | P1 | — | 1. Abrir | Métricas do workspace | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-040 | Dashboard | `/clients` | PF-02 | P1 | — | 1. Abrir | Lista de clientes só do workspace | E2E+security | PROD | médio | print + SQL | NÃO TESTADO |
| RT-041 | Dashboard | `/earnings` (Income) | PF-02 | P0 | — | 1. Abrir | Saldos disponível/pendente/reserva | financial | PROD | médio | print + RPC | NÃO TESTADO |
| RT-042 | Dashboard | `/creator-finance` | PF-02 | P0 | — | 1. Abrir | Extrato e taxas do plano | financial | PROD | médio | print | NÃO TESTADO |
| RT-043 | Dashboard | `/coupons` | PF-02 | P1 | — | 1. Abrir/criar cupom | CRUD funcional | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-044 | Dashboard | `/affiliates` | PF-02 | P1 | — | 1. Abrir | Programa e afiliados | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-045 | Dashboard | `/referrals` | PF-02 | P2 | — | 1. Abrir | Indicações e comissões | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-046 | Dashboard | `/leads` | PF-02 | P1 | — | 1. Abrir | Lista de leads do workspace | E2E | PROD | médio | print | NÃO TESTADO |
| RT-047 | Dashboard | `/leads/segments` | PF-02 | P2 | — | 1. Abrir/criar segmento | Segmento salvo | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-048 | Dashboard | `/leads/email` | PF-02 | P2 | — | 1. Abrir | Composer de e-mail | E2E | PROD | médio | print | NÃO TESTADO |
| RT-049 | Dashboard | `/email-campaigns` | PF-02 | P1 | — | 1. Abrir | Campanhas + status | E2E | PROD | médio | print | NÃO TESTADO |
| RT-050 | Dashboard | `/email-flows` → `/email-campaigns` | PF-02 | P3 | — | 1. Abrir | Redirect | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-051 | Dashboard | `/appointments` | PF-02 | P2 | — | 1. Abrir | Agenda | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-052 | Dashboard | `/payment-logs` | PF-02 | P1 | — | 1. Abrir | Logs de pagamento do workspace | E2E | PROD | médio | print | NÃO TESTADO |
| RT-053 | Dashboard | `/autodm` | PF-02 | P3 | Flag | 1. Abrir | Página oculta ou beta | manual | PROD | baixo | print | NÃO TESTADO |
| RT-054 | Dashboard | `/fiscal` | PF-02 | P2 | Flag | 1. Abrir | Fechamento fiscal | manual | PROD | médio | print | NÃO TESTADO |
| RT-055 | Dashboard | `/menu-tools` | PF-02 | P3 | — | 1. Abrir | Ferramentas do menu | manual | PROD | nenhum | print | NÃO TESTADO |
| RT-056 | Dashboard | `/settings` | PF-02 | P0 | — | 1. Abrir todas as abas | Perfil, workspace, integrações salvam | E2E | PROD | médio | print | NÃO TESTADO |
| RT-057 | Dashboard | `/billing/success` | PF-02 | P1 | Assinatura paga | 1. Abrir | Confirmação + plano atualizado | financial | SANDBOX | médio | print + SQL | NÃO TESTADO |
| RT-058 | Dashboard | `/billing/upgrade-flow` | PF-02 | P1 | — | 1. Abrir | Fluxo de upgrade | financial | SANDBOX | médio | vídeo | NÃO TESTADO |

### 5.3 Rotas de membro/aluno

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RT-059 | Member | `/member` hub | PF-10 | P0 | Compra concluída | 1. Abrir | Produtos, progresso, streak | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-060 | Member | `/member/library` | PF-10 | P0 | Entitlement ativo | 1. Abrir | Todos os ativos liberados | E2E | PROD | médio | print | NÃO TESTADO |
| RT-061 | Member | `/member/course/:productId` | PF-10 | P0 | Curso comprado | 1. Abrir | Player, módulos, aulas | E2E | PROD | baixo | vídeo | NÃO TESTADO |
| RT-062 | Member | `/member/billing` | PF-10 | P1 | Assinatura ativa | 1. Abrir | Faturas, cartão, cancelar | financial | SANDBOX | médio | print | NÃO TESTADO |
| RT-063 | Member | `/member/certificates` | PF-10 | P2 | Curso concluído | 1. Abrir | Certificados listados/baixáveis | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-064 | Member | Acesso sem entitlement | PF-05 | P0 | Sem compra | 1. Abrir `/member/course/:id` de terceiro | Bloqueio, sem vazamento de conteúdo | security | PROD | alto | print + resposta API | NÃO TESTADO |

### 5.4 Rotas Circles

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RT-065 | Circles | `/circles` (MyCommunities) | PF-05 | P0 | Logado | 1. Abrir | Comunidades do usuário + pendências | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-066 | Circles | `/circles/:slug` redirect | PF-08 | P1 | Membro | 1. Abrir | Redireciona para `/feed` ou `/about` conforme acesso | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-067 | Circles | `/circles/:slug/about` | PF-01 | P0 | Comunidade pública | 1. Abrir sem sessão | Landing com galeria e CTA + modal de auth | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-068 | Circles | `/circles/:slug/plans` | PF-05 | P0 | Comunidade paga | 1. Abrir | Planos com preços corretos (mensal/anual) | financial | SANDBOX | médio | print | NÃO TESTADO |
| RT-069 | Circles | `/circles/:slug/feed` | PF-08 | P0 | Membro ativo | 1. Abrir | Feed carrega, composer visível | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-070 | Circles | `/circles/:slug/spaces/:spaceSlug` | PF-08 | P1 | Space existente | 1. Abrir | Feed filtrado pelo space | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-071 | Circles | `/circles/:slug/members` | PF-08 | P1 | — | 1. Abrir | Lista + filtros de ciclo de vida | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-072 | Circles | `/circles/:slug/leaderboard` | PF-08 | P2 | Gamificação ativa | 1. Abrir | 9 níveis e ranking | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-073 | Circles | `/circles/:slug/events` | PF-08 | P1 | — | 1. Abrir | Eventos e recorrências | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-074 | Circles | `/circles/:slug/classroom` | PF-08 | P1 | Conteúdo publicado | 1. Abrir | Pastas/páginas | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-075 | Circles | `/circles/:slug/resources` | PF-08 | P2 | Arquivo publicado | 1. Abrir e baixar | URL assinada 300s | security | PROD | médio | print + URL | NÃO TESTADO |
| RT-076 | Circles | `/circles/:slug/tasks` | PF-08 | P2 | — | 1. Abrir | Kanban/lista | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-077 | Circles | `/circles/:slug/messages` | PF-08 | P1 | — | 1. Abrir | DMs pop-up + badges | E2E | PROD | médio | print | NÃO TESTADO |
| RT-078 | Circles | `/circles/:slug/admin` | PF-06 | P0 | Dono | 1. Abrir todas as abas | Abas admin carregam e salvam | E2E | PROD | médio | vídeo | NÃO TESTADO |
| RT-079 | Circles | `/circles/:slug/settings` | PF-06 | P1 | Dono | 1. Abrir com `?section=` | Aba correta selecionada | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-080 | Circles | `/circles/:slug/profile` e `/profile/:memberId` | PF-08 | P2 | — | 1. Abrir próprio e de terceiro | Heatmap e atividades | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-081 | Circles | `/circles/:slug/post/:id` | PF-08 | P1 | Post existente | 1. Abrir link direto | Redireciona ao post no contexto correto | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-082 | Circles | `/circle-settings` e `/circle/settings` | PF-06 | P3 | — | 1. Abrir | Redirect para settings da comunidade | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-083 | Circles | Layout persistente | PF-08 | P1 | — | 1. Navegar entre abas | Sidebar não remonta, sem flash | manual | PROD | nenhum | vídeo | NÃO TESTADO |

### 5.5 Rotas admin Kivo (`AdminRoute`)

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RT-084 | Admin | `/analytics/executive` | PF-11 | P1 | Admin | 1. Abrir | MRR/Churn/LTV | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-085 | Admin | `/gtm` | PF-11 | P2 | Admin | 1. Abrir | Painel GTM | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-086 | Admin | `/gtm/playbook` | PF-11 | P3 | Admin | 1. Abrir | Playbook 14 dias | manual | PROD | nenhum | print | NÃO TESTADO |
| RT-087 | Admin | `/acquisition` | PF-11 | P2 | Admin | 1. Abrir | Pipeline inbound/outbound | E2E | PROD | baixo | print | NÃO TESTADO |
| RT-088 | Admin | `/ops` war room | PF-11 | P1 | Admin | 1. Abrir | Indicadores operacionais | E2E | PROD | nenhum | print | NÃO TESTADO |
| RT-089 | Admin | `/ops/launch` | PF-11 | P2 | Admin | 1. Abrir | Checklist de lançamento | manual | PROD | nenhum | print | NÃO TESTADO |
| RT-090 | Admin | `/ops/feedback` | PF-11 | P3 | Admin | 1. Abrir | Feedbacks | manual | PROD | nenhum | print | NÃO TESTADO |
| RT-091 | Admin | `/ops/week-plan` | PF-11 | P3 | Admin | 1. Abrir | Plano semanal | manual | PROD | nenhum | print | NÃO TESTADO |
| RT-092 | Admin | `/ops/financial-health` | PF-11 | P1 | Admin | 1. Abrir | Saúde financeira | financial | PROD | médio | print | NÃO TESTADO |
| RT-093 | Admin | `/admin/payouts` | PF-11 | P0 | Admin | 1. Abrir | Fila de saques | financial | SANDBOX | alto | print + SQL | NÃO TESTADO |
| RT-094 | Admin | `/admin/risk-review` | PF-11 | P0 | Admin | 1. Abrir | Score de risco e motivos | financial | SANDBOX | alto | print | NÃO TESTADO |
| RT-095 | Admin | `/admin/chargebacks` | PF-11 | P0 | Admin | 1. Abrir | Chargebacks e congelamentos | financial | SANDBOX | alto | print | NÃO TESTADO |
| RT-096 | Admin | `/admin/financial-health` | PF-11 | P1 | Admin | 1. Abrir | Reconciliação global | financial | PROD | médio | print | NÃO TESTADO |
| RT-097 | Admin | `/admin/go-live` | PF-11 | P1 | Admin | 1. Abrir | Checklist go-live | manual | PROD | nenhum | print | NÃO TESTADO |
| RT-098 | Admin | `/admin/subscriptions` | PF-11 | P1 | Admin | 1. Abrir | Assinaturas e status | financial | PROD | médio | print | NÃO TESTADO |
| RT-099 | Admin | Acesso negado a não-admin | PF-02 | P0 | Produtor comum | 1. Abrir `/admin/payouts` | Bloqueio/redirect; API também nega | security | PROD | alto | print + resposta | NÃO TESTADO |
| RT-100 | Admin | Deep link admin sem sessão | PF-01 | P0 | — | 1. Abrir `/ops` | Redirect para `/login` com `state.from` | security | PROD | médio | print | NÃO TESTADO |

---

## 6. Autenticação, autorização e sessão

### 6.1 Cadastro produtor (código de 4 dígitos)

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AU-001 | Auth | Signup produtor feliz | PF-01 | P0 | E-mail de teste | 1. `/signup` 2. Nome/e-mail/senha 3. Enviar | Modal de 4 dígitos abre; e-mail chega < 60s | E2E | PROD | baixo | print + log Resend | NÃO TESTADO |
| AU-002 | Auth | Código correto | PF-01 | P0 | AU-001 | 1. Digitar 4 dígitos | Auto-submit, conta confirmada, workspace criada, vai a `/onboarding` | E2E | PROD | médio | vídeo + SQL | NÃO TESTADO |
| AU-003 | Auth | Botão "Confirmar código" | PF-01 | P1 | Modal aberto | 1. Digitar 4 dígitos 2. Clicar botão | Botão habilita só com 4 dígitos; confirma | manual | PROD | nenhum | print | NÃO TESTADO |
| AU-004 | Auth | Código errado | PF-01 | P0 | Modal aberto | 1. Digitar código inválido | Erro genérico, sem enumeração, tentativa contabilizada | E2E | PROD | baixo | print | NÃO TESTADO |
| AU-005 | Auth | Limite de tentativas | PF-01 | P0 | Modal aberto | 1. Errar N vezes | Bloqueio do código, mensagem clara, exige reenvio | API | DEV | baixo | resposta JSON | NÃO TESTADO |
| AU-006 | Auth | Expiração do código | PF-01 | P0 | Código emitido | 1. Aguardar TTL 2. Tentar | `expired` uniforme; novo código necessário | API | DEV | baixo | resposta | NÃO TESTADO |
| AU-007 | Auth | Cooldown de reenvio | PF-01 | P1 | Código emitido | 1. Clicar reenviar imediatamente | Contador visível; sem novo e-mail antes do cooldown | E2E | PROD | baixo | print + logs | NÃO TESTADO |
| AU-008 | Auth | Reenvio após cooldown | PF-01 | P1 | Cooldown vencido | 1. Reenviar | Novo código válido; anterior invalidado | API | DEV | baixo | SQL | NÃO TESTADO |
| AU-009 | Auth | Rate limit por e-mail/IP | PF-01 | P0 | — | 1. Disparar muitas solicitações | 429/`rate_limited` sem enviar e-mails | security | DEV | baixo | respostas | NÃO TESTADO |
| AU-010 | Auth | Retomada com senha nova | PF-01 | P0 | Conta pendente não confirmada | 1. Refazer signup com senha diferente | Senha e metadados sincronizados; login pós-confirmação com a nova senha | integration | DEV | médio | logs + login | NÃO TESTADO |
| AU-011 | Auth | Retomada não altera conta confirmada | PF-01 | P0 | Conta já confirmada | 1. Tentar signup no mesmo e-mail | Nunca troca senha; resposta anti-enumeração | security | DEV | alto | resposta | NÃO TESTADO |
| AU-012 | Auth | `mode=resend` não altera senha | PF-01 | P0 | Conta pendente | 1. Reenviar código | Senha inalterada | security | DEV | alto | SQL/log | NÃO TESTADO |
| AU-013 | Auth | Falha transitória da Admin API | PF-01 | P0 | Simular 503 | 1. Confirmar código | 503 `temporarily_unavailable`; código NÃO consumido; dígitos preservados | integration | DEV | médio | log + retry OK | NÃO TESTADO |
| AU-014 | Auth | Retry após falha | PF-01 | P0 | AU-013 | 1. Reenviar o mesmo código | Confirma com sucesso | integration | DEV | médio | log | NÃO TESTADO |
| AU-015 | Auth | Replay/idempotência | PF-01 | P0 | Código já consumido | 1. Reenviar mesmo código | 200 sem efeitos duplicados (uma workspace apenas) | security | DEV | alto | SQL count | NÃO TESTADO |
| AU-016 | Auth | Concorrência de confirmação | PF-01 | P0 | 2 requisições simultâneas | 1. Disparar em paralelo | Advisory lock impede workspace duplicada | integration | DEV | alto | SQL count=1 | NÃO TESTADO |
| AU-017 | Auth | Falha ao criar workspace | PF-01 | P0 | Simular erro na RPC | 1. Confirmar | 503, código ainda válido, sem consumo | integration | DEV | médio | log | NÃO TESTADO |
| AU-018 | Auth | `account_type` ausente/erro | PF-01 | P0 | Linha inexistente | 1. Confirmar | 503 fail-safe, **sem** downgrade para MEMBER | security | DEV | alto | log | NÃO TESTADO |
| AU-019 | Auth | Ausência de magic link | PF-01 | P0 | — | 1. Grep produção + inspecionar e-mail | Nenhum `signInWithOtp`/resend nativo/magic link no cadastro | security | DEV | médio | grep + e-mail | NÃO TESTADO |
| AU-020 | Auth | E-mail sintaticamente inválido | PF-01 | P0 | — | 1. POST `auth-request-code` com e-mail inválido | 400, nenhuma conta criada, nenhum e-mail | API | PROD | nenhum | resposta + SQL | NÃO TESTADO |
| AU-021 | Auth | Sugestão de domínio (`useAuthEmailGuard`) | PF-01 | P2 | — | 1. Digitar `gmial.com` | Sugere correção e aceita clique | manual | PROD | nenhum | print | NÃO TESTADO |
| AU-022 | Auth | Senha fraca | PF-01 | P1 | — | 1. Usar senha < 8 chars | Bloqueio com mensagem PT-BR | manual | PROD | nenhum | print | NÃO TESTADO |
| AU-023 | Auth | Reabertura do modal após refresh | PF-01 | P1 | Verificação pendente | 1. Recarregar página | Modal reabre com e-mail correto | E2E | PROD | nenhum | print | NÃO TESTADO |
| AU-024 | Auth | "Usar outro e-mail" | PF-01 | P2 | Modal aberto | 1. Clicar | Limpa pendência e volta ao form | manual | PROD | nenhum | print | NÃO TESTADO |

### 6.2 Cadastro/login Circles e membro

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AU-025 | Auth | Signup em `/member/login` | PF-01 | P0 | — | 1. Aba "Criar conta" 2. Enviar | Código 4 dígitos; `account_type=MEMBER` | E2E | PROD | baixo | print + SQL | NÃO TESTADO |
| AU-026 | Auth | MEMBER **não** cria workspace | PF-05 | P0 | AU-025 confirmado | 1. Consultar `workspaces`/`workspace_members` | Zero linhas para o usuário | security | DEV | alto | SQL | NÃO TESTADO |
| AU-027 | Auth | Login membro com senha | PF-05 | P0 | Conta confirmada | 1. Aba Entrar | Redireciona ao `redirect` sanitizado ou `/member` | E2E | PROD | nenhum | print | NÃO TESTADO |
| AU-028 | Auth | Login com conta não confirmada | PF-01 | P0 | Conta pendente | 1. Tentar entrar | Mensagem específica + signOut automático | E2E | PROD | baixo | print | NÃO TESTADO |
| AU-029 | Auth | Signup via modal em `/circles/:slug/about` | PF-01 | P0 | Comunidade pública | 1. Clicar CTA 2. Criar conta | Modal 3 estados; pós-confirmação entra na comunidade | E2E | PROD | médio | vídeo | NÃO TESTADO |
| AU-030 | Auth | Join pendente concluído pós-login | PF-01 | P0 | Intenção salva | 1. Logar | `completePendingCommunityJoin` executa; redireciona ao feed ou `/circles` se PENDING | integration | PROD | médio | SQL + URL | NÃO TESTADO |
| AU-031 | Auth | Rotas que suprimem auto-redirect | PF-01 | P1 | — | 1. Logar em `/join/:slug`, `/member/login`, `/auth/callback`, `/circles/:slug/about` | Sem navegação concorrente | E2E | PROD | baixo | vídeo | NÃO TESTADO |
| AU-032 | Auth | Upgrade membro→produtor | PF-13 | P0 | Conta MEMBER | 1. Abrir `/dashboard` 2. Aceitar upgrade | `ProducerUpgradePrompt` cria workspace idempotente | integration | PROD | alto | SQL | NÃO TESTADO |
| AU-033 | Auth | Conta híbrida | PF-12 | P0 | Workspace + comunidade | 1. Alternar `/dashboard` ↔ `/circles` | Ambas as áreas acessíveis sem loop | E2E | PROD | médio | vídeo | NÃO TESTADO |
| AU-034 | Auth | Smart redirect pós-login | PF-12 | P1 | Vários vínculos | 1. Logar | workspace→dashboard; membership→/circles; entitlements→/member; fallback→explore | integration | PROD | baixo | URL | NÃO TESTADO |

### 6.3 Reset de senha, OAuth, sessão e autorização

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AU-035 | Auth | Solicitar reset | PF-01 | P1 | Conta existente | 1. `/forgot-password` | E-mail com link (único link permitido) | E2E | PROD | baixo | e-mail | NÃO TESTADO |
| AU-036 | Auth | Reset com hash válido | PF-01 | P1 | Link recente | 1. Definir nova senha | Senha trocada; login com nova senha | E2E | PROD | médio | vídeo | NÃO TESTADO |
| AU-037 | Auth | Reset com link expirado/reuso | PF-01 | P1 | Link usado | 1. Reabrir link | Erro claro, sem troca | security | PROD | médio | print | NÃO TESTADO |
| AU-038 | Auth | Reset de e-mail inexistente | PF-01 | P1 | — | 1. Enviar | Resposta uniforme (anti-enumeração) | security | PROD | baixo | print | NÃO TESTADO |
| AU-039 | Auth | Google OAuth (se exposto) | PF-01 | P1 | Provider ativo | 1. Entrar com Google | Conta criada/vinculada; sem OTP; redirect correto | E2E | PROD | médio | vídeo | NÃO TESTADO |
| AU-040 | Auth | OAuth com e-mail já existente | PF-01 | P1 | Conta por senha | 1. Entrar com Google | Vinculação sem duplicar usuário | security | PROD | alto | SQL | NÃO TESTADO |
| AU-041 | Auth | Logout | PF-02 | P0 | Sessão ativa | 1. Sair | Navega a `/login`; storage limpo; back não restaura sessão | security | PROD | médio | vídeo | NÃO TESTADO |
| AU-042 | Auth | Refresh de sessão | PF-02 | P1 | Sessão longa | 1. Deixar aberto > 1h 2. Agir | Token renovado sem deslogar | manual | PROD | baixo | console | NÃO TESTADO |
| AU-043 | Auth | Sessão em duas abas | PF-02 | P2 | 2 abas | 1. Logout em uma | Outra aba reflete logout | manual | PROD | baixo | vídeo | NÃO TESTADO |
| AU-044 | Auth | Login normal nunca pede OTP | PF-02 | P0 | Conta confirmada | 1. Login e-mail+senha | Entra direto, sem modal | E2E | PROD | baixo | vídeo | NÃO TESTADO |
| AU-045 | Auth | Open redirect | PF-01 | P0 | — | 1. `/member/login?redirect=https://evil.com` | `sanitizeReturnTarget` bloqueia; destino interno | security | PROD | alto | URL final | NÃO TESTADO |
| AU-046 | Auth | Deep link protegido | PF-01 | P1 | Sem sessão | 1. Abrir `/earnings` | `/login` e, após entrar, volta ao destino | E2E | PROD | baixo | vídeo | NÃO TESTADO |
| AU-047 | Auth | `requireEmailVerification` | PF-01 | P0 | Conta pendente | 1. Abrir rota protegida | Redireciona `/verify-email` | E2E | PROD | médio | URL | NÃO TESTADO |
| AU-048 | Auth | Consumidor em rota de criador | PF-05 | P0 | MEMBER sem workspace | 1. Abrir `/dashboard` | `ProducerUpgradePrompt`, nunca `/onboarding` em loop | E2E | PROD | médio | print | NÃO TESTADO |
| AU-049 | Auth | Erro de fetch de workspace | PF-02 | P1 | Simular falha RLS | 1. Abrir dashboard | Não redireciona falsamente ao onboarding | integration | DEV | médio | console | NÃO TESTADO |
| AU-050 | Auth | Escalada de papel via metadata | PF-05 | P0 | — | 1. Tentar setar `account_type=PRODUCER` no cliente | Servidor ignora; fonte é `user_account_types` | security | DEV | alto | SQL + resposta | NÃO TESTADO |

---

## 7. Onboarding, planos, workspace e membros

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ON-001 | Onboarding | Wizard completo | PF-02 | P0 | Workspace novo | 1. Perfil 2. Customização 3. Produto 4. Plano 5. Publicar | Conclui e vai a `/dashboard` | E2E | PROD | baixo | vídeo | NÃO TESTADO |
| ON-002 | Onboarding | StepProfile validação | PF-02 | P1 | — | 1. Salvar vazio | Bloqueio com mensagens | manual | PROD | nenhum | print | NÃO TESTADO |
| ON-003 | Onboarding | Slug do workspace | PF-02 | P0 | — | 1. Escolher slug já usado/reservado | `generate_unique_slug` resolve colisão; reservados rejeitados | integration | DEV | médio | SQL | NÃO TESTADO |
| ON-004 | Onboarding | Skip/retomada | PF-02 | P1 | Wizard incompleto | 1. Sair e voltar | Retoma no passo correto | manual | PROD | baixo | vídeo | NÃO TESTADO |
| ON-005 | Onboarding | Já com workspace | PF-02 | P2 | Workspace existente | 1. Abrir `/onboarding` | Redirect a `/dashboard` | E2E | PROD | nenhum | URL | NÃO TESTADO |
| ON-006 | Workspace | `create_workspace_with_owner` | PF-02 | P0 | — | 1. Criar workspace | Workspace + OWNER na mesma transação | integration | DEV | alto | SQL | NÃO TESTADO |
| ON-007 | Workspace | Idempotência de criação | PF-02 | P0 | Duas chamadas | 1. Executar em paralelo | Uma única workspace | integration | DEV | alto | SQL count | NÃO TESTADO |
| ON-008 | Planos | Plano default FREE | PF-02 | P0 | Workspace nova | 1. Ver `workspaces.plan` | `FREE` maiúsculo | integration | DEV | baixo | SQL | NÃO TESTADO |
| ON-009 | Planos | Limite de produtos FREE | PF-02 | P0 | No limite | 1. Criar produto além do limite | Trigger bloqueia + UI mostra upgrade | integration | DEV | médio | erro SQL + print | NÃO TESTADO |
| ON-010 | Planos | Limite de comunidades | PF-02 | P1 | No limite | 1. Criar comunidade extra | Bloqueio com CTA de upgrade | integration | PROD | médio | print | NÃO TESTADO |
| ON-011 | Planos | `usePlanLimits` hierárquico | PF-02 | P1 | Planos distintos | 1. Testar FREE/CREATOR/PRO | Limites corretos por plano | unit | DEV | nenhum | teste | NÃO TESTADO |
| ON-012 | Planos | Upgrade FREE→CREATOR | PF-02 | P0 | Cartão sandbox | 1. Assinar | `workspaces.plan` = CREATOR após webhook | financial | SANDBOX | alto | SQL + print | NÃO TESTADO |
| ON-013 | Planos | Upgrade CREATOR→PRO mid-cycle | PF-02 | P1 | Assinatura ativa | 1. Upgrade | Pró-rata via `upgrade-subscription-midcycle` | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| ON-014 | Planos | Downgrade por inadimplência | PF-02 | P0 | Fatura vencida | 1. Rodar cron | Carência 7d respeitada; depois FREE | financial | SANDBOX | alto | `cron_runs` + SQL | NÃO TESTADO |
| ON-015 | Planos | `sync_workspace_plan` | PF-02 | P0 | Divergência forçada | 1. Rodar sync | Plano converge à assinatura | integration | DEV | médio | SQL | NÃO TESTADO |
| ON-016 | Planos | Excedente pós-downgrade | PF-02 | P1 | Mais produtos que o limite | 1. Downgrade | Produtos existentes preservados; criação bloqueada | integration | DEV | médio | SQL | NÃO TESTADO |
| ON-017 | Membros | Convite de membro | PF-02 | P1 | — | 1. Convidar por e-mail | Convite enviado e aceito | E2E | PROD | médio | e-mail + SQL | NÃO TESTADO |
| ON-018 | Membros | Papel ADMIN | PF-03 | P1 | Convite ADMIN | 1. Aceitar 2. Navegar | Acesso conforme matriz (ver H-01) | security | PROD | alto | print | NÃO TESTADO |
| ON-019 | Membros | Papel MEMBER | PF-04 | P0 | Convite MEMBER | 1. Abrir `/earnings` | Bloqueio ou leitura sem saque | security | PROD | alto | print + API | NÃO TESTADO |
| ON-020 | Membros | Remoção de membro | PF-02 | P1 | Membro ativo | 1. Remover | Perde acesso imediatamente | security | PROD | alto | print | NÃO TESTADO |
| ON-021 | Multi-WS | Usuário em 2 workspaces | PF-02 | P1 | 2 vínculos | 1. Logar | Contexto correto; dados não se misturam | security | PROD | alto | SQL + print | NÃO TESTADO |
| ON-022 | Multi-WS | Troca de workspace | PF-02 | P2 | 2 vínculos | 1. Trocar contexto | Todas as telas refletem o novo workspace | manual | PROD | alto | vídeo | NÃO TESTADO |

> **HIPÓTESE A VALIDAR (H-02):** não foi encontrado seletor de troca de workspace na UI (`WorkspaceProvider` parece resolver 1 workspace). ON-022 pode virar `N/A` (pós-MVP).

---

## 8. Produtos, cursos e entrega

### 8.1 Criação, tipos e persistência

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PR-001 | Produtos | Seleção de tipo | PF-02 | P0 | — | 1. `/products/new` | Todos os tipos listados | E2E | PROD | nenhum | print | NÃO TESTADO |
| PR-002 | Produtos | Digital (`DigitalProductFlow`) | PF-02 | P0 | — | 1. Criar e publicar | Produto ativo com arquivo | E2E | PROD | baixo | print + SQL | NÃO TESTADO |
| PR-003 | Produtos | Curso (`CourseFlow`) | PF-02 | P0 | — | 1. Criar | Vai ao course builder | E2E | PROD | baixo | print | NÃO TESTADO |
| PR-004 | Produtos | Lead magnet (`CollectEmailsFlow`) | PF-02 | P0 | Flag v1/v2 | 1. Criar | Captura de e-mail funcional | E2E | PROD | baixo | print | NÃO TESTADO |
| PR-005 | Produtos | Lead magnet legado v1 | PF-02 | P1 | Flag OFF | 1. Abrir produto antigo | Editor v1 sem perda de dados | integration | DEV | médio | round-trip | NÃO TESTADO |
| PR-006 | Produtos | Lead magnet v2 round-trip | PF-02 | P1 | Flag ON | 1. Salvar e recarregar | `mapApiToEditorState` sem perda; `configVersion` carimbado | unit | DEV | médio | teste | NÃO TESTADO |
| PR-007 | Produtos | Rollback da flag | PF-02 | P0 | Produto salvo em v2 | 1. Desligar flag 2. Abrir | Editor v1 funciona sem corromper | integration | DEV | alto | print + JSON | NÃO TESTADO |
| PR-008 | Produtos | Comunidade (`CommunityFlow`) | PF-02 | P0 | — | 1. Criar | Comunidade + slug criados | E2E | PROD | médio | SQL | NÃO TESTADO |
| PR-009 | Produtos | Recorrente (`RecurringProductFlow`) | PF-02 | P0 | — | 1. Criar com intervalo | Preço recorrente correto | E2E | PROD | médio | SQL | NÃO TESTADO |
| PR-010 | Produtos | Coaching call | PF-02 | P2 | — | 1. Criar | Agenda vinculada | E2E | PROD | baixo | print | NÃO TESTADO |
| PR-011 | Produtos | Webinar | PF-02 | P2 | — | 1. Criar | Link/embed salvo | E2E | PROD | baixo | print | NÃO TESTADO |
| PR-012 | Produtos | URL/Mídia | PF-02 | P2 | — | 1. Criar | Redireciona para URL externa | E2E | PROD | baixo | print | NÃO TESTADO |
| PR-013 | Produtos | Custom | PF-02 | P2 | — | 1. Criar | Campos livres persistem | E2E | PROD | baixo | print | NÃO TESTADO |
| PR-014 | Produtos | Autosave | PF-02 | P0 | Editor aberto | 1. Editar e aguardar debounce | Indicador "salvo"; dado no banco | integration | PROD | médio | print + SQL | NÃO TESTADO |
| PR-015 | Produtos | Guard de alterações não salvas | PF-02 | P1 | Alteração pendente | 1. Sair da página | Aviso antes de descartar | manual | PROD | médio | print | NÃO TESTADO |
| PR-016 | Produtos | Versionamento de schema | PF-02 | P1 | Produto antigo | 1. Abrir | Migração de schema aplicada sem perda | unit | DEV | alto | teste | NÃO TESTADO |
| PR-017 | Produtos | Validação de publicação | PF-02 | P0 | Campos faltando | 1. Publicar | Bloqueio com checklist do que falta | E2E | PROD | baixo | print | NÃO TESTADO |
| PR-018 | Produtos | Despublicar | PF-02 | P1 | Produto ativo | 1. Despublicar | `/checkout/:slug` mostra indisponível | E2E | PROD | médio | print | NÃO TESTADO |
| PR-019 | Produtos | Duplicar produto | PF-02 | P2 | — | 1. Duplicar | Cópia sem vínculos indevidos | E2E | PROD | baixo | SQL | NÃO TESTADO |
| PR-020 | Produtos | Excluir produto com vendas | PF-02 | P0 | Produto vendido | 1. Excluir | Bloqueio ou soft-delete preservando entitlements | security | PROD | alto | SQL | NÃO TESTADO |
| PR-021 | Produtos | Preview em tempo real | PF-02 | P1 | Editor | 1. Alterar campos | Preview reflete em < 1s | manual | PROD | nenhum | vídeo | NÃO TESTADO |
| PR-022 | Produtos | Upload de capa | PF-02 | P1 | Imagem 5MB | 1. Enviar | Upload com prefixo `auth.uid()`; URL válida | security | PROD | médio | URL + storage | NÃO TESTADO |
| PR-023 | Produtos | Arquivo privado | PF-02 | P0 | Arquivo no bucket privado | 1. Publicar 2. Comprador baixa | URL assinada 24h; anônimo recebe 403 | security | PROD | alto | URL + 403 | NÃO TESTADO |
| PR-024 | Produtos | Listagem do bucket privado | PF-01 | P0 | — | 1. Tentar listar `private-files` | Negado | security | PROD | alto | resposta | NÃO TESTADO |
| PR-025 | Produtos | AI copy (`ai-generate`) | PF-02 | P2 | Cota disponível | 1. Gerar copy | Texto PT-BR; cota decrementa | integration | PROD | baixo | print + SQL | NÃO TESTADO |
| PR-026 | Produtos | Cota de IA excedida | PF-02 | P1 | Cota zerada | 1. Gerar | Bloqueio com mensagem e sem custo | security | DEV | médio | resposta | NÃO TESTADO |
| PR-027 | Produtos | Sugestão de preço IA | PF-02 | P3 | — | 1. Solicitar | Sugestão coerente | manual | PROD | nenhum | print | NÃO TESTADO |
| PR-028 | Produtos | Reviews builder | PF-02 | P2 | — | 1. Adicionar review | Aparece na página pública | E2E | PROD | baixo | print | NÃO TESTADO |
| PR-029 | Produtos | Form fields builder | PF-02 | P1 | — | 1. Adicionar campos | Campos aparecem no checkout e são salvos no pedido | integration | SANDBOX | médio | SQL | NÃO TESTADO |
| PR-030 | Produtos | Order bump configurado | PF-02 | P0 | 2 produtos | 1. Configurar bump | Aparece no checkout com preço correto | financial | SANDBOX | alto | print | NÃO TESTADO |

### 8.2 Course builder, aulas, progresso, quiz e certificado

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CB-001 | Curso | Criar módulo | PF-02 | P0 | Curso criado | 1. Adicionar módulo | Persistido e visível | E2E | PROD | baixo | print | NÃO TESTADO |
| CB-002 | Curso | Criar aula | PF-02 | P0 | Módulo | 1. Adicionar aula | Persistida | E2E | PROD | baixo | print | NÃO TESTADO |
| CB-003 | Curso | Reordenar módulos | PF-02 | P1 | ≥3 módulos | 1. Arrastar | RPC batch reorder; ordem estável após reload | integration | PROD | médio | print + SQL | NÃO TESTADO |
| CB-004 | Curso | Reordenar aulas | PF-02 | P1 | ≥3 aulas | 1. Arrastar rápido | Sem corrida (`isReorderingRef`) | integration | PROD | médio | vídeo | NÃO TESTADO |
| CB-005 | Curso | Editor Tiptap | PF-02 | P1 | Aula aberta | 1. Formatar texto e salvar | HTML íntegro após reload | E2E | PROD | baixo | print | NÃO TESTADO |
| CB-006 | Curso | Upload de vídeo/mídia na aula | PF-02 | P1 | Arquivo | 1. Enviar via dialog | Caminho com prefixo `auth.uid()` | security | PROD | médio | storage | NÃO TESTADO |
| CB-007 | Curso | Sincronização com `products`/`prices` | PF-02 | P0 | Curso publicado | 1. Publicar | Produto e preço refletem o curso | integration | DEV | alto | SQL | NÃO TESTADO |
| CB-008 | Curso | Templates de curso | PF-02 | P2 | — | 1. Usar template | Estrutura criada | E2E | PROD | baixo | print | NÃO TESTADO |
| CB-009 | Curso | Duplicar curso | PF-02 | P2 | — | 1. Duplicar | Cópia completa | E2E | PROD | baixo | SQL | NÃO TESTADO |
| CB-010 | Curso | Checklist de validação | PF-02 | P1 | Curso incompleto | 1. Tentar publicar | Lista itens pendentes | manual | PROD | baixo | print | NÃO TESTADO |
| CB-011 | Curso | Aba checkout do curso | PF-02 | P0 | — | 1. Configurar preço único e recorrente | Persistido em JSONB e em `prices` | integration | DEV | alto | SQL | NÃO TESTADO |
| CB-012 | Curso | Preview mobile | PF-02 | P2 | — | 1. Abrir preview | Layout mobile correto | manual | PROD | nenhum | print | NÃO TESTADO |
| CB-013 | Aluno | Consumo da aula | PF-10 | P0 | Curso comprado | 1. Abrir aula | Player e conteúdo carregam | E2E | PROD | baixo | vídeo | NÃO TESTADO |
| CB-014 | Aluno | Marcar aula concluída | PF-10 | P0 | Aula aberta | 1. Concluir | Progresso persiste após reload | integration | PROD | médio | SQL | NÃO TESTADO |
| CB-015 | Aluno | Progresso agregado | PF-10 | P1 | Várias aulas | 1. Concluir parcialmente | % correto no hub | integration | PROD | baixo | print | NÃO TESTADO |
| CB-016 | Aluno | Quiz — aprovação | PF-10 | P1 | Quiz configurado | 1. Responder correto | Aprovado; libera certificado | E2E | PROD | médio | print | NÃO TESTADO |
| CB-017 | Aluno | Quiz — reprovação/retentativa | PF-10 | P1 | — | 1. Errar | Bloqueia certificado; permite refazer | E2E | PROD | médio | print | NÃO TESTADO |
| CB-018 | Aluno | Emissão de certificado | PF-10 | P1 | Curso 100% + quiz | 1. Gerar | `generate-certificate` retorna certificado com código | integration | PROD | médio | arquivo + SQL | NÃO TESTADO |
| CB-019 | Aluno | Verificação pública | PF-01 | P2 | Certificado emitido | 1. `/verify/:code` | Dados conferem; código adulterado falha | security | PROD | médio | print | NÃO TESTADO |
| CB-020 | Aluno | Streak diário | PF-10 | P2 | Login em dias distintos | 1. Acessar | Streak incrementa (job `process-streaks`) | integration | PROD | baixo | SQL | NÃO TESTADO |

---

## 9. Loja, storefront público e SEO

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ST-001 | Loja | Editor — dados do perfil | PF-02 | P0 | — | 1. Editar nome/bio/avatar 2. Salvar | Refletido em `/:slug` | E2E | PROD | baixo | print | NÃO TESTADO |
| ST-002 | Loja | Tema e tokens | PF-02 | P0 | — | 1. Trocar tema | `resolveTokens()` aplica; sem cor hardcoded | manual | PROD | baixo | print | NÃO TESTADO |
| ST-003 | Loja | Presets de layout | PF-02 | P1 | — | 1. Alternar presets | `headerAlignment/density/cardStyle/mediaEmphasis/ctaStyle` aplicam | manual | PROD | baixo | print | NÃO TESTADO |
| ST-004 | Loja | Ordem dos blocos | PF-02 | P1 | ≥3 produtos | 1. Reordenar | `storefront_order` persiste | integration | PROD | baixo | SQL | NÃO TESTADO |
| ST-005 | Loja | Ocultar produto | PF-02 | P1 | — | 1. Ocultar | Some da loja pública | E2E | PROD | baixo | print | NÃO TESTADO |
| ST-006 | Loja | Preço R$ 0 | PF-02 | P1 | Produto gratuito | 1. Publicar | `getDisplayPrice()` oculta o valor | unit | DEV | baixo | teste | NÃO TESTADO |
| ST-007 | Loja | Sync editor↔preview | PF-02 | P1 | — | 1. Editar | Dirty flag, debounce e refetch corretos | manual | PROD | baixo | vídeo | NÃO TESTADO |
| ST-008 | Loja | Link-in-bio | PF-01 | P1 | Loja publicada | 1. Abrir em mobile | Layout link-in-bio correto | manual | PROD | nenhum | print | NÃO TESTADO |
| ST-009 | Loja | Lead magnet na loja | PF-01 | P0 | Lead magnet ativo | 1. Informar e-mail | Lead salvo; e-mail de entrega enviado | integration | PROD | médio | SQL + e-mail | NÃO TESTADO |
| ST-010 | Loja | Lead duplicado | PF-01 | P1 | Mesmo e-mail 2x | 1. Enviar | Upsert sem duplicar | integration | DEV | baixo | SQL | NÃO TESTADO |
| ST-011 | Loja | SEO título/descrição | PF-01 | P1 | — | 1. Ver `<head>` | Title < 60, description < 160, H1 único | manual | PROD | nenhum | HTML | NÃO TESTADO |
| ST-012 | Loja | Open Graph/Twitter | PF-01 | P1 | — | 1. Compartilhar link | Preview correto no WhatsApp/X | manual | PROD | nenhum | print | NÃO TESTADO |
| ST-013 | Loja | Alt text e semântica | PF-01 | P2 | — | 1. Auditar | Imagens com alt; HTML semântico | manual | PROD | nenhum | Lighthouse | NÃO TESTADO |
| ST-014 | Loja | Slug inexistente | PF-01 | P1 | — | 1. Abrir `/slug-que-nao-existe` | NotFound amigável | E2E | PROD | nenhum | print | NÃO TESTADO |
| ST-015 | Loja | Slug reservado | PF-01 | P0 | — | 1. Abrir `/settings` sem sessão | Não vira storefront | security | PROD | médio | print | NÃO TESTADO |
| ST-016 | Loja | Produto indisponível | PF-01 | P0 | Produto pausado | 1. Abrir checkout | Mensagem clara, sem permitir pagamento | E2E | PROD | alto | print | NÃO TESTADO |
| ST-017 | Loja | Loja de workspace suspenso | PF-01 | P1 | Workspace bloqueado | 1. Abrir | Comportamento definido e consistente | manual | PROD | médio | print | NÃO TESTADO |
| ST-018 | Loja | Badge "Feito com Kivo" | PF-01 | P3 | — | 1. Abrir loja | Badge presente conforme plano | manual | PROD | nenhum | print | NÃO TESTADO |
| ST-019 | Loja | Performance mobile | PF-01 | P1 | 3G lento | 1. Medir | LCP < 4s; sem layout shift grave | manual | PROD | nenhum | Lighthouse | NÃO TESTADO |
| ST-020 | Loja | Tracking na loja | PF-01 | P1 | Pixel configurado | 1. Visitar | `track-event` registra pageview | integration | PROD | baixo | network + SQL | NÃO TESTADO |

---

## 10. Checkout e pagamentos

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CO-001 | Checkout | Render do produto | PF-01 | P0 | Produto ativo | 1. Abrir `/checkout/:slug` | Nome, capa e preço corretos vindos do servidor | E2E | SANDBOX | baixo | print | NÃO TESTADO |
| CO-002 | Checkout | Validação do formulário | PF-01 | P0 | — | 1. Enviar vazio | Erros PT-BR por campo | manual | SANDBOX | nenhum | print | NÃO TESTADO |
| CO-003 | Checkout | CPF inválido | PF-01 | P0 | — | 1. Digitar CPF inválido | Bloqueio antes do gateway | unit+E2E | SANDBOX | baixo | print | NÃO TESTADO |
| CO-004 | Checkout | CPF válido com máscara | PF-01 | P1 | — | 1. Digitar | Máscara e normalização corretas | unit | DEV | nenhum | teste | NÃO TESTADO |
| CO-005 | Checkout | Captura de e-mail onBlur | PF-01 | P1 | — | 1. Preencher e-mail e sair do campo | `checkout_sessions` registra lead | integration | SANDBOX | médio | SQL | NÃO TESTADO |
| CO-006 | Checkout | PIX — geração | PF-01 | P0 | — | 1. Escolher PIX 2. Pagar | QR + copia-e-cola retornados; pedido PENDING | financial | SANDBOX | alto | print + SQL | NÃO TESTADO |
| CO-007 | Checkout | PIX — confirmação via webhook | PF-01 | P0 | CO-006 | 1. Simular pagamento no sandbox | Pedido COMPLETED, entitlement criado, e-mail enviado | financial | SANDBOX | alto | logs + SQL | NÃO TESTADO |
| CO-008 | Checkout | PIX — expiração | PF-01 | P1 | Cobrança vencida | 1. Aguardar | Pedido expira; sem entitlement | financial | SANDBOX | médio | SQL | NÃO TESTADO |
| CO-009 | Checkout | Cartão — tokenização no cliente | PF-01 | P0 | — | 1. Preencher cartão | `tokenize-card` retorna token; PAN nunca vai ao backend próprio | security | SANDBOX | alto | HAR | NÃO TESTADO |
| CO-010 | Checkout | Cartão aprovado | PF-01 | P0 | Cartão teste aprovado | 1. Pagar | COMPLETED e entrega imediata | financial | SANDBOX | alto | print + SQL | NÃO TESTADO |
| CO-011 | Checkout | Cartão recusado | PF-01 | P0 | Cartão teste recusado | 1. Pagar | Erro específico do gateway na UI; sem pedido pago | financial | SANDBOX | alto | print | NÃO TESTADO |
| CO-012 | Checkout | Parcelamento 1–12x | PF-01 | P0 | Habilitado | 1. Escolher 12x | Valores por parcela conferem com `simulate-installments` | financial | SANDBOX | alto | print + cálculo | NÃO TESTADO |
| CO-013 | Checkout | Boleto | PF-01 | P1 | Habilitado | 1. Gerar | Linha digitável + PDF; sem reserva de segurança | financial | SANDBOX | alto | print | NÃO TESTADO |
| CO-014 | Checkout | Cupom válido | PF-01 | P0 | Cupom ativo | 1. Aplicar | Desconto igual no front e no back | financial | SANDBOX | alto | print + resposta | NÃO TESTADO |
| CO-015 | Checkout | Cupom inválido/expirado | PF-01 | P0 | — | 1. Aplicar | Recusa clara; total inalterado | E2E | SANDBOX | médio | print | NÃO TESTADO |
| CO-016 | Checkout | Cupom esgotado (concorrência) | PF-01 | P0 | 1 uso restante | 1. Dois usuários resgatam juntos | `redeem_coupon` atômico: só um sucesso | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| CO-017 | Checkout | Ordem cupom→PIX | PF-01 | P0 | Cupom + PIX | 1. Pagar | Desconto aplicado antes da cobrança PIX | financial | SANDBOX | alto | resposta | NÃO TESTADO |
| CO-018 | Checkout | Rate limit `validate-coupon` | PF-01 | P1 | — | 1. Chamar em loop | 429 sem vazar cupons | security | DEV | baixo | respostas | NÃO TESTADO |
| CO-019 | Checkout | Order bump aceito | PF-01 | P0 | Bump ativo | 1. Marcar e pagar | Dois entitlements; total soma correta | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| CO-020 | Checkout | Order bump recusado | PF-01 | P1 | — | 1. Não marcar | Total sem o bump | financial | SANDBOX | médio | print | NÃO TESTADO |
| CO-021 | Checkout | Upsell pós-compra aceito | PF-10 | P1 | Oferta ativa | 1. Aceitar | Novo pedido vinculado | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| CO-022 | Checkout | Upsell recusado | PF-10 | P2 | — | 1. Recusar | Vai a `/order/success` normalmente | E2E | SANDBOX | baixo | URL | NÃO TESTADO |
| CO-023 | Checkout | **Valores nunca vêm do body** | PF-01 | P0 | — | 1. Adulterar preço na requisição de `create-payment` | Servidor recalcula; valor adulterado ignorado | security | SANDBOX | alto | HAR + SQL | NÃO TESTADO |
| CO-024 | Checkout | Erro do gateway → 502 | PF-01 | P0 | Forçar erro | 1. Chamar `create-payment` | HTTP 502, não 200 | API | DEV | médio | resposta | NÃO TESTADO |
| CO-025 | Checkout | Trava sandbox × produção | PF-11 | P0 | `ASAAS_ENV` | 1. Conferir base URL | Chave e ambiente coerentes; sandbox ignorado em PROD | security | PROD | alto | log | NÃO TESTADO |
| CO-026 | Checkout | Idempotência do webhook | PF-11 | P0 | Evento repetido | 1. Reenviar mesmo `webhook_events` id | Sem duplicar pedido/ledger | financial | SANDBOX | alto | SQL count | NÃO TESTADO |
| CO-027 | Checkout | Webhook com token inválido | PF-01 | P0 | — | 1. POST sem `ASAAS_WEBHOOK_TOKEN` | 401, nada processado | security | SANDBOX | alto | resposta | NÃO TESTADO |
| CO-028 | Checkout | Webhook fora de ordem | PF-11 | P1 | Confirmação antes da criação | 1. Enviar invertido | Sistema converge ou reagenda; sem estado inválido | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| CO-029 | Checkout | Duplo clique em pagar | PF-01 | P0 | — | 1. Clicar 2x rápido | Um único pedido/cobrança | financial | SANDBOX | alto | SQL count | NÃO TESTADO |
| CO-030 | Checkout | Refresh durante pagamento | PF-01 | P1 | — | 1. F5 no meio | Estado recuperado; sem cobrança dupla | manual | SANDBOX | alto | vídeo | NÃO TESTADO |
| CO-031 | Checkout | Botão voltar do navegador | PF-01 | P1 | — | 1. Voltar após pagar | Não reprocessa pagamento | manual | SANDBOX | alto | vídeo | NÃO TESTADO |
| CO-032 | Checkout | Queda de rede no submit | PF-01 | P1 | Offline no envio | 1. Cortar rede | Erro tratado; retry sem duplicar | manual | SANDBOX | alto | vídeo | NÃO TESTADO |
| CO-033 | Checkout | `check-payment-status` polling | PF-01 | P1 | Pedido PENDING | 1. Aguardar | UI muda para pago sem reload manual | integration | SANDBOX | médio | vídeo | NÃO TESTADO |
| CO-034 | Checkout | Comprovante/recibo | PF-10 | P1 | Pedido pago | 1. Abrir `/order/success/:id` | Dados do pedido + acesso ao produto | E2E | SANDBOX | médio | print | NÃO TESTADO |
| CO-035 | Checkout | E-mail de confirmação | PF-10 | P0 | Pedido pago | 1. Verificar caixa | E-mail PT-BR com CTA de acesso | integration | SANDBOX | médio | e-mail | NÃO TESTADO |
| CO-036 | Checkout | Abandono de carrinho | PF-01 | P1 | E-mail capturado, sem pagar | 1. Sair 2. Rodar `send-recovery-emails` | E-mail com `?session=<id>` restaura sessão | integration | SANDBOX | médio | e-mail + URL | NÃO TESTADO |
| CO-037 | Checkout | Restauração da sessão abandonada | PF-01 | P1 | Link de recuperação | 1. Abrir link | Campos e produto pré-preenchidos | E2E | SANDBOX | baixo | print | NÃO TESTADO |
| CO-038 | Checkout | Rastreio de afiliado no checkout | PF-01 | P0 | Link `?ref=` | 1. Comprar | `affiliate_session_id` gravado no pedido | integration | SANDBOX | alto | SQL | NÃO TESTADO |
| CO-039 | Checkout | Checkout de comunidade | PF-05 | P0 | Comunidade paga | 1. Assinar | `create-circle-subscription` cria assinatura + acesso | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| CO-040 | Checkout | Checkout de produto recorrente | PF-01 | P0 | Produto recorrente | 1. Assinar | Assinatura ativa; próxima cobrança agendada | financial | SANDBOX | alto | SQL | NÃO TESTADO |

---

## 11. Financeiro (pedidos, splits, carteira, saques, risco, fiscal)

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FI-001 | Financeiro | Criação do pedido | PF-01 | P0 | Checkout | 1. Pagar | `orders` com `total_amount` correto e unidade correta (ver memo de unidades) | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-002 | Financeiro | Registro em `payments` | PF-11 | P0 | Pedido pago | 1. Consultar | 1:1 com cobrança do Asaas | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-003 | Financeiro | `split_entries` criados como pending | PF-11 | P0 | `create-payment` | 1. Consultar | `gross_amount`, `gateway_fee`, `platform_fee`, `affiliate_fee`, `creator_net` | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-004 | Financeiro | Soma dos splits = bruto | PF-11 | P0 | FI-003 | 1. Somar componentes | Diferença = 0 centavo | financial | SANDBOX | alto | planilha | NÃO TESTADO |
| FI-005 | Financeiro | Regra 8% plataforma / 92% criador | PF-11 | P0 | `split_rules` default | 1. Conferir | Constraint `split_percent_sum_100` respeitada | financial | DEV | alto | SQL | NÃO TESTADO |
| FI-006 | Financeiro | Taxas por método | PF-11 | P0 | `fee_config` | 1. Comparar cartão/PIX/boleto | Taxas conforme configuração | financial | DEV | alto | SQL | NÃO TESTADO |
| FI-007 | Financeiro | Liquidação (settled) no webhook | PF-11 | P0 | Pagamento confirmado | 1. Rodar webhook | `split_entries` → settled + `wallet_ledger` credit/pending | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-008 | Financeiro | Reserva só em cartão | PF-11 | P0 | Pagamento cartão | 1. Conferir `reserve_entries` | 10% retido; PIX/boleto sem reserva | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-009 | Financeiro | Prazo de reserva por plano | PF-11 | P0 | CREATOR e PRO | 1. Comparar | CREATOR D+30, PRO D+15 | financial | DEV | alto | SQL | NÃO TESTADO |
| FI-010 | Financeiro | Hold days por método | PF-11 | P0 | `get_split_rule` | 1. Conferir | Cartão 30, PIX 2 (conforme regra) | financial | DEV | alto | SQL | NÃO TESTADO |
| FI-011 | Financeiro | `release-holds` | PF-11 | P0 | Lançamento vencido | 1. Rodar job | Pending → available; idempotente | financial | SANDBOX | alto | `cron_runs` + SQL | NÃO TESTADO |
| FI-012 | Financeiro | `release-reserves` | PF-11 | P0 | Reserva vencida | 1. Rodar job | Reserva liberada uma única vez | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-013 | Financeiro | `get-wallet-balance` | PF-02 | P0 | Sessão do produtor | 1. Chamar | Disponível/pendente/reserva batem com o ledger | financial | SANDBOX | alto | resposta + SQL | NÃO TESTADO |
| FI-014 | Financeiro | Saldo de outro workspace | PF-02 | P0 | — | 1. Forçar `workspace_id` alheio | 403/vazio | security | SANDBOX | alto | resposta | NÃO TESTADO |
| FI-015 | Financeiro | UI `/earnings` × RPC | PF-02 | P0 | — | 1. Comparar números | Iguais centavo a centavo | financial | SANDBOX | alto | print + SQL | NÃO TESTADO |
| FI-016 | Financeiro | Cadastro de conta bancária | PF-02 | P0 | — | 1. Cadastrar | Validação de banco/agência/conta/CPF-CNPJ | E2E | SANDBOX | alto | print | NÃO TESTADO |
| FI-017 | Financeiro | Saque acima do saldo | PF-02 | P0 | — | 1. Solicitar valor maior | Recusa server-side | security | SANDBOX | alto | resposta | NÃO TESTADO |
| FI-018 | Financeiro | Saque válido | PF-02 | P0 | Saldo disponível | 1. Solicitar | `payout_requests` criado; ledger debitado | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-019 | Financeiro | Idempotência do saque | PF-02 | P0 | Duplo clique | 1. Solicitar 2x | Um único pedido | financial | SANDBOX | alto | SQL count | NÃO TESTADO |
| FI-020 | Financeiro | `process-payouts` sucesso | PF-11 | P0 | Saque aprovado | 1. Rodar | Transferência Asaas + status atualizado | financial | SANDBOX | alto | log + SQL | NÃO TESTADO |
| FI-021 | Financeiro | `process-payouts` falha | PF-11 | P0 | Erro do gateway | 1. Rodar | HTTP 502 + estorno automático no ledger | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-022 | Financeiro | Idempotência do processador | PF-11 | P0 | Rodar 2x | 1. Executar duas vezes | Sem transferência duplicada | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-023 | Financeiro | Risk review | PF-11 | P0 | Saque suspeito | 1. Abrir `/admin/risk-review` | Score e motivos exibidos; aprovar/reprovar funciona | financial | SANDBOX | alto | print | NÃO TESTADO |
| FI-024 | Financeiro | Reversão de payout | PF-11 | P1 | Payout pago | 1. Reverter | Ledger volta corretamente | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-025 | Financeiro | Chargeback | PF-11 | P0 | Evento de chargeback | 1. Processar | Congela saldo; cancela comissões | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-026 | Financeiro | Refund total | PF-11 | P0 | Pedido pago | 1. Estornar | Entitlement revogado; ledger debitado | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-027 | Financeiro | Refund parcial | PF-11 | P1 | — | 1. Estornar parcial | Valores proporcionais | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-028 | Financeiro | Reserva rolante 30d 10% | PF-11 | P1 | Histórico | 1. Conferir | Política aplicada | financial | DEV | alto | SQL | NÃO TESTADO |
| FI-029 | Financeiro | `reconcile-payments` | PF-11 | P0 | Divergência forçada | 1. Rodar | Divergência detectada e corrigida/reportada | financial | SANDBOX | alto | log | NÃO TESTADO |
| FI-030 | Financeiro | `reconcile-asaas` | PF-11 | P0 | — | 1. Rodar diário | Relatório sem diferenças | financial | SANDBOX | alto | log | NÃO TESTADO |
| FI-031 | Financeiro | Unidades (centavos × reais) | PF-11 | P0 | — | 1. Auditar cada tabela | Conforme memo de unidades; sem conversão implícita | financial | DEV | alto | SQL | NÃO TESTADO |
| FI-032 | Financeiro | Arredondamento | PF-11 | P0 | Valor com dízima | 1. Pagar R$ 33,33 com split | Soma fecha sem centavo perdido | financial | SANDBOX | alto | planilha | NÃO TESTADO |
| FI-033 | Financeiro | Receita fantasma em renovação | PF-11 | P0 | Renovação falha | 1. Rodar `renew-subscriptions` | Só registra receita com pagamento confirmado | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| FI-034 | Fiscal | Emissão NFSe pós-COMPLETED | PF-02 | P2 | Flag ON | 1. Rodar `emit-nfse` | Nota emitida uma única vez (idempotente) | financial | SANDBOX | alto | log | NÃO TESTADO |
| FI-035 | Fiscal | Fechamento em `/fiscal` | PF-02 | P2 | — | 1. Abrir | Totais conferem com pedidos | financial | PROD | médio | print | NÃO TESTADO |
| FI-036 | Financeiro | `get_plan_fee_summary` | PF-02 | P1 | — | 1. Chamar | Taxas exibidas iguais às cobradas | financial | DEV | alto | SQL | NÃO TESTADO |
| FI-037 | Financeiro | Extrato/histórico | PF-02 | P1 | Movimentos | 1. Abrir histórico | Ordenação, filtros e saldo acumulado corretos | financial | PROD | médio | print | NÃO TESTADO |
| FI-038 | Financeiro | Gráfico de receita | PF-02 | P2 | — | 1. Abrir | Série temporal coerente com pedidos | manual | PROD | baixo | print | NÃO TESTADO |
| FI-039 | Financeiro | Escrita só por service_role | PF-02 | P0 | Cliente autenticado | 1. Tentar INSERT em `wallet_ledger` | Negado por RLS | security | DEV | alto | erro SQL | NÃO TESTADO |
| FI-040 | Financeiro | `payment-logs` do workspace | PF-02 | P1 | — | 1. Abrir | Só logs do próprio workspace | security | PROD | alto | print + SQL | NÃO TESTADO |

---

## 12. Assinaturas (SaaS, produto recorrente e comunidade)

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AS-001 | Assinatura | Criar assinatura Kivo (SaaS) | PF-02 | P0 | Cartão sandbox | 1. Assinar CREATOR | Assinatura ativa; `workspaces.plan` sincronizado | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AS-002 | Assinatura | Idempotência 30s | PF-02 | P0 | — | 1. Assinar 2x rápido | Uma assinatura só | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AS-003 | Assinatura | Rate limit 5 req/min | PF-02 | P1 | — | 1. Repetir chamadas | 429 | security | DEV | médio | respostas | NÃO TESTADO |
| AS-004 | Assinatura | Erro de gateway propagado | PF-02 | P1 | Cartão inválido | 1. Assinar | Toast com erro preciso do Asaas | E2E | SANDBOX | médio | print | NÃO TESTADO |
| AS-005 | Assinatura | Renovação bem-sucedida | PF-02 | P0 | Ciclo vencido | 1. Rodar `renew-subscriptions` | Nova cobrança + período estendido | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AS-006 | Assinatura | Renovação recusada | PF-02 | P0 | Cartão recusado | 1. Rodar | Status PAST_DUE; sem receita registrada | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AS-007 | Assinatura | Dunning nível 1/2/3 | PF-02 | P1 | Inadimplência | 1. Rodar `send-dunning-email` | 3 escalações com conteúdos distintos | integration | SANDBOX | médio | e-mails | NÃO TESTADO |
| AS-008 | Assinatura | Carência 7 dias | PF-02 | P0 | PAST_DUE | 1. Avançar datas | Acesso mantido 7d; depois downgrade | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AS-009 | Assinatura | Cancelamento pelo produtor | PF-02 | P0 | Ativa | 1. Cancelar | Acesso até o fim do ciclo; sem nova cobrança | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AS-010 | Assinatura | Cancelamento de comunidade | PF-08 | P0 | Assinatura de circle | 1. Cancelar | Perde acesso no fim do ciclo | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AS-011 | Assinatura | Retenção de cartão tokenizado | PF-08 | P1 | Assinatura ativa | 1. Consultar | Política de retenção respeitada | security | SANDBOX | alto | SQL | NÃO TESTADO |
| AS-012 | Assinatura | Upgrade mid-cycle | PF-02 | P1 | Ativa | 1. Upgrade | Pró-rata correto | financial | SANDBOX | alto | cálculo | NÃO TESTADO |
| AS-013 | Assinatura | Entitlement de assinatura | PF-10 | P0 | Assinatura ativa | 1. Acessar conteúdo | Liberado; ao cancelar, bloqueia | security | SANDBOX | alto | print | NÃO TESTADO |
| AS-014 | Assinatura | `reconcile-subscriptions` | PF-11 | P0 | Divergência | 1. Rodar | Estados convergem com Asaas | financial | SANDBOX | alto | log | NÃO TESTADO |
| AS-015 | Assinatura | `subscription-health-daily` | PF-11 | P1 | — | 1. Rodar | Relatório diário sem erro | integration | SANDBOX | médio | log | NÃO TESTADO |
| AS-016 | Assinatura | `/admin/subscriptions` | PF-11 | P1 | — | 1. Abrir | Lista com status reais | E2E | PROD | médio | print | NÃO TESTADO |
| AS-017 | Assinatura | `/member/billing` cancelar | PF-10 | P0 | Assinatura ativa | 1. Cancelar pelo membro | Fluxo funciona sem dialog nativo | E2E | SANDBOX | alto | vídeo | NÃO TESTADO |
| AS-018 | Assinatura | Planos anuais | PF-08 | P1 | Plano anual | 1. Assinar | Intervalo anual detectado e cobrado certo | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AS-019 | Assinatura | Troca de plano da comunidade | PF-08 | P1 | 2 planos | 1. Trocar | Transição sem perder acesso | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AS-020 | Assinatura | 5 modelos de precificação | PF-06 | P1 | `set_community_pricing_model` | 1. Alternar modelos | Troca segura via RPC, sem quebrar assinantes | integration | SANDBOX | alto | SQL | NÃO TESTADO |

---

## 13. Afiliados, indicações e comissões

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AF-001 | Afiliados | Programa habilitado | PF-02 | P1 | — | 1. Ativar em `/affiliates` | Link público de aplicação funciona | E2E | PROD | baixo | print | NÃO TESTADO |
| AF-002 | Afiliados | Aplicação e aprovação | PF-09 | P1 | — | 1. Aplicar 2. Aprovar | Status muda; afiliado vê dashboard | E2E | PROD | médio | print | NÃO TESTADO |
| AF-003 | Afiliados | Geração de link | PF-09 | P1 | Aprovado | 1. Copiar link | Host reconstruído dinamicamente (`window.location.host`) | manual | PROD | baixo | print | NÃO TESTADO |
| AF-004 | Afiliados | Registro de clique | PF-01 | P0 | Link `?ref=` | 1. Abrir | `validate_and_record_affiliate_click` grava clique | integration | SANDBOX | médio | SQL | NÃO TESTADO |
| AF-005 | Afiliados | Atribuição last-click 30d | PF-01 | P0 | 2 afiliados | 1. Clicar A depois B 2. Comprar | Comissão vai para B | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AF-006 | Afiliados | Expiração da atribuição | PF-01 | P0 | Clique com 31 dias | 1. Comprar | Sem comissão | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AF-007 | Afiliados | Cálculo sobre valor correto | PF-11 | P0 | Venda com cupom | 1. Conferir | Base = `total_amount` conforme regra documentada | financial | SANDBOX | alto | planilha | NÃO TESTADO |
| AF-008 | Afiliados | `process_order_commission` | PF-11 | P0 | Pedido pago | 1. Rodar | Comissão pendente criada; erro faz retry do webhook | financial | SANDBOX | alto | log + SQL | NÃO TESTADO |
| AF-009 | Afiliados | Cancelamento em estorno | PF-11 | P0 | Refund | 1. Estornar | Comissão cancelada uma única vez | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AF-010 | Afiliados | Liberação após maturação | PF-11 | P0 | Comissão vencida | 1. Rodar `commissions-release` | Vira disponível; idempotente | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AF-011 | Afiliados | Payout do afiliado | PF-09 | P0 | Saldo | 1. Solicitar | Mesmo pipeline de saque com validações | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AF-012 | Afiliados | Autoindicação (anti-fraude) | PF-09 | P0 | Afiliado compra o próprio link | 1. Comprar | Comissão bloqueada | security | SANDBOX | alto | SQL | NÃO TESTADO |
| AF-013 | Afiliados | Cliques inflados | PF-09 | P1 | Muitos cliques do mesmo IP | 1. Repetir | Deduplicação/limite aplicado | security | SANDBOX | médio | SQL | NÃO TESTADO |
| AF-014 | Afiliados | Alteração de colunas privilegiadas | PF-09 | P0 | — | 1. Tentar UPDATE em comissão/percentual | Trigger de guarda bloqueia | security | DEV | alto | erro SQL | NÃO TESTADO |
| AF-015 | Indicações | Indicação de assinatura 20% lifetime | PF-09 | P1 | Indicado assina | 1. Conferir | Comissão recorrente enquanto ativa | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| AF-016 | Indicações | `resolve-affiliate-code` | PF-01 | P1 | Código válido/inválido | 1. Chamar | Resolve ou nega sem vazar dados | API | DEV | médio | resposta | NÃO TESTADO |
| AF-017 | Afiliados | Dashboard 30d × lifetime | PF-09 | P2 | Histórico | 1. Abrir | Números batem com o banco | financial | PROD | médio | print + SQL | NÃO TESTADO |
| AF-018 | Afiliados | Visual do link (Stan-like) | PF-09 | P3 | Produto R$ 0 | 1. Abrir link | Preço R$ 0 mascarado | manual | PROD | nenhum | print | NÃO TESTADO |
| AF-019 | Afiliados | Atribuição de receita | PF-02 | P2 | Vendas por fonte | 1. Abrir analytics | `source_type`/`source_id`/`community_id` corretos | integration | PROD | médio | SQL | NÃO TESTADO |
| AF-020 | Afiliados | Afiliado não vê dados do workspace | PF-09 | P0 | — | 1. Tentar acessar `/dashboard` | Bloqueio | security | PROD | alto | print | NÃO TESTADO |

---

## 14. Circles (comunidades) — cobertura funcional

### 14.1 Descoberta, entrada e paywall

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CI-001 | Circles | Discovery público | PF-01 | P1 | Comunidades públicas | 1. Abrir `/circles/explore` | Cards com preço e descrição | E2E | PROD | nenhum | print | NÃO TESTADO |
| CI-002 | Circles | Join gratuito | PF-05 | P0 | Comunidade grátis | 1. Entrar | Membro ativo imediatamente | E2E | PROD | médio | SQL | NÃO TESTADO |
| CI-003 | Circles | Join com aprovação | PF-05 | P0 | Comunidade com aprovação | 1. Solicitar | Status PENDING; aparece em `/circles` | integration | PROD | médio | SQL | NÃO TESTADO |
| CI-004 | Circles | Aprovação pelo dono | PF-06 | P0 | Pedido pendente | 1. Aprovar | Membro ativo; notificado | E2E | PROD | médio | print | NÃO TESTADO |
| CI-005 | Circles | Rejeição | PF-06 | P1 | — | 1. Rejeitar | Sem acesso; mensagem clara | E2E | PROD | médio | print | NÃO TESTADO |
| CI-006 | Circles | Paywall com CTA | PF-05 | P0 | Comunidade paga | 1. Abrir sem assinar | Paywall com planos e botão de saída | E2E | PROD | médio | print | NÃO TESTADO |
| CI-007 | Circles | Paywall mensal × anual | PF-05 | P0 | 2 intervalos | 1. Abrir planos | Detecção automática do intervalo | E2E | SANDBOX | alto | print | NÃO TESTADO |
| CI-008 | Circles | Cast de role no join | PF-05 | P0 | — | 1. Entrar | Sem erro de tipo `community_member_role` | integration | DEV | médio | log | NÃO TESTADO |
| CI-009 | Circles | Convite por link | PF-06 | P1 | Link criado | 1. Compartilhar e usar | Entra na comunidade correta | E2E | PROD | médio | SQL | NÃO TESTADO |
| CI-010 | Circles | Link de convite expirado/limite | PF-01 | P1 | Limite atingido | 1. Usar | Recusa com mensagem | security | PROD | médio | print | NÃO TESTADO |
| CI-011 | Circles | Update de convite por terceiro | PF-08 | P0 | — | 1. Tentar alterar link alheio | RPC nega | security | DEV | alto | erro | NÃO TESTADO |
| CI-012 | Circles | Multi-tenancy | PF-06 | P0 | 2 comunidades no workspace | 1. Alternar | Dados isolados por slug | security | PROD | alto | print + SQL | NÃO TESTADO |
| CI-013 | Circles | Cache por slug | PF-08 | P1 | — | 1. Trocar comunidade | Chave `["community-slug", slug]` sem vazar cache | manual | PROD | médio | network | NÃO TESTADO |

### 14.2 Feed, posts e interações

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CI-014 | Circles | Criar post (composer inline) | PF-08 | P0 | Membro | 1. Publicar texto | Aparece no feed | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-015 | Circles | Post com imagem | PF-08 | P1 | — | 1. Anexar imagem | Upload e render OK | E2E | PROD | médio | print | NÃO TESTADO |
| CI-016 | Circles | Anexos (limite 5 / 20MB) | PF-08 | P1 | Arquivos | 1. Anexar 6 arquivos e 1 de 25MB | Bloqueio com mensagem | security | PROD | médio | print | NÃO TESTADO |
| CI-017 | Circles | Download de anexo protegido | PF-01 | P0 | Não-membro | 1. Abrir URL do anexo | Negado por RLS | security | PROD | alto | resposta | NÃO TESTADO |
| CI-018 | Circles | GIF picker | PF-08 | P3 | — | 1. Inserir GIF | Renderiza | manual | PROD | nenhum | print | NÃO TESTADO |
| CI-019 | Circles | Enquete (até 10 opções) | PF-08 | P1 | — | 1. Criar com 11 opções | Bloqueio em 10 | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-020 | Circles | Voto único × múltiplo | PF-08 | P1 | Enquete | 1. Votar | Regra respeitada; contagem correta | integration | PROD | médio | SQL | NÃO TESTADO |
| CI-021 | Circles | Encerrar enquete | PF-06 | P2 | — | 1. Encerrar | Sem novos votos | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-022 | Circles | Comentários | PF-08 | P0 | Post | 1. Comentar e responder | Threads corretas | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-023 | Circles | Reações (8 tipos) | PF-08 | P1 | — | 1. Reagir e desfazer | Popover com 8 emojis; contagem correta | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-024 | Circles | Editar/excluir post próprio | PF-08 | P1 | — | 1. Editar/excluir | Permitido | E2E | PROD | médio | print | NÃO TESTADO |
| CI-025 | Circles | Excluir post de terceiro | PF-08 | P0 | — | 1. Tentar | Negado (só autor/mod) | security | PROD | alto | resposta | NÃO TESTADO |
| CI-026 | Circles | Fixar post | PF-07 | P2 | Moderador | 1. Fixar | Aparece no topo | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-027 | Circles | Paginação/scroll do feed | PF-08 | P1 | >50 posts | 1. Rolar | Carrega sem duplicar | manual | PROD | baixo | vídeo | NÃO TESTADO |
| CI-028 | Circles | Spaces — criação e visibilidade | PF-06 | P1 | — | 1. Criar space privado | Só membros elegíveis veem | security | PROD | alto | print | NÃO TESTADO |
| CI-029 | Circles | Post em space | PF-08 | P1 | — | 1. Publicar no space | Aparece só no space | E2E | PROD | médio | print | NÃO TESTADO |
| CI-030 | Circles | XSS em post | PF-08 | P0 | — | 1. Publicar `<script>` | Escapado, não executa | security | PROD | alto | print | NÃO TESTADO |

### 14.3 Membros, perfis, gamificação

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CI-031 | Circles | Lista de membros e filtros | PF-06 | P1 | — | 1. Filtrar por status | Filtros de ciclo de vida corretos | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-032 | Circles | Ações otimistas (banir/promover) | PF-06 | P1 | — | 1. Executar | UI otimista + persistência | E2E | PROD | médio | SQL | NÃO TESTADO |
| CI-033 | Circles | Promover a moderador | PF-06 | P1 | — | 1. Promover | Ganha permissões de moderação | security | PROD | alto | print | NÃO TESTADO |
| CI-034 | Circles | Banir membro | PF-06 | P0 | — | 1. Banir | Perde acesso imediatamente | security | PROD | alto | print | NÃO TESTADO |
| CI-035 | Circles | @username por comunidade | PF-08 | P1 | — | 1. Definir username | Único na comunidade; sync com perfil global | integration | PROD | médio | SQL | NÃO TESTADO |
| CI-036 | Circles | Avatar customizado prioritário | PF-08 | P2 | OAuth + upload | 1. Trocar avatar | Custom prevalece sobre Google | manual | PROD | baixo | print | NÃO TESTADO |
| CI-037 | Circles | Perfil com heatmap | PF-08 | P2 | Atividades | 1. Abrir perfil | Heatmap coerente | manual | PROD | baixo | print | NÃO TESTADO |
| CI-038 | Circles | Leaderboard 9 níveis | PF-08 | P2 | Pontos | 1. Abrir | Ranking e `level_names` JSONB corretos | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-039 | Circles | Streak diário | PF-08 | P2 | Acessos consecutivos | 1. Rodar `process-streaks` | Streak correto | integration | PROD | baixo | SQL | NÃO TESTADO |
| CI-040 | Circles | Identidade global flag | PF-08 | P2 | 2 comunidades | 1. Alternar | Identidade conforme flag | manual | PROD | médio | print | NÃO TESTADO |

### 14.4 Eventos, lives, classroom, recursos, tarefas, mensagens

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CI-041 | Circles | Criar evento único | PF-06 | P1 | — | 1. Criar | Aparece no calendário | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-042 | Circles | Evento recorrente (máx 52) | PF-06 | P1 | — | 1. Criar semanal por 2 anos | Limite 52 instâncias | integration | PROD | médio | SQL | NÃO TESTADO |
| CI-043 | Circles | Lembrete de evento | PF-08 | P1 | Evento próximo | 1. Rodar `event-reminders` | E-mail/notificação enviados uma vez | integration | SANDBOX | médio | log | NÃO TESTADO |
| CI-044 | Circles | RSVP | PF-08 | P2 | — | 1. Confirmar presença | Persistido | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-045 | Circles | Live embed | PF-08 | P1 | Provedor embed | 1. Abrir live | Player embutido | manual | PROD | médio | print | NÃO TESTADO |
| CI-046 | Circles | Live link externo | PF-08 | P1 | Provedor link | 1. Abrir | Abre em nova aba | manual | PROD | baixo | print | NÃO TESTADO |
| CI-047 | Circles | Classroom pastas/páginas | PF-06 | P1 | — | 1. Criar e publicar | Membros veem; rascunho não | security | PROD | médio | print | NÃO TESTADO |
| CI-048 | Circles | Recursos — upload | PF-06 | P2 | — | 1. Subir arquivo | Salvo no bucket certo | security | PROD | médio | storage | NÃO TESTADO |
| CI-049 | Circles | Recursos — URL assinada 300s | PF-08 | P1 | — | 1. Baixar 2. Reusar após 6 min | Expira corretamente | security | PROD | alto | URL | NÃO TESTADO |
| CI-050 | Circles | Recursos — evento de download | PF-06 | P3 | — | 1. Baixar | Evento registrado | integration | PROD | baixo | SQL | NÃO TESTADO |
| CI-051 | Circles | Tarefas Kanban/List | PF-08 | P2 | — | 1. Criar/mover tarefa | Estado persiste | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-052 | Circles | DM 1:1 | PF-08 | P1 | 2 membros | 1. Enviar mensagem | Pop-up + entrega | E2E | PROD | médio | print | NÃO TESTADO |
| CI-053 | Circles | Badge de não lidas | PF-08 | P1 | Mensagem nova | 1. Observar | Badge some ao ler | manual | PROD | baixo | print | NÃO TESTADO |
| CI-054 | Circles | DM entre não-membros | PF-01 | P0 | — | 1. Tentar via API | Negado | security | DEV | alto | resposta | NÃO TESTADO |
| CI-055 | Circles | Realtime sem vazamento de canal | PF-08 | P1 | — | 1. Navegar entre páginas | `removeChannel` no cleanup; sem reconexões em loop | manual | PROD | médio | network | NÃO TESTADO |

### 14.5 Moderação, denúncias e abas administrativas

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CI-056 | Circles | Denunciar post | PF-08 | P1 | — | 1. Denunciar | Report criado | E2E | PROD | médio | SQL | NÃO TESTADO |
| CI-057 | Circles | Membro não altera denúncia | PF-08 | P0 | — | 1. Tentar UPDATE | Negado por RLS | security | DEV | alto | erro | NÃO TESTADO |
| CI-058 | Circles | Fila de moderação | PF-07 | P1 | Denúncias | 1. Resolver | Status atualizado | E2E | PROD | médio | print | NÃO TESTADO |
| CI-059 | Circles | Admin — aba Geral | PF-06 | P0 | — | 1. Editar nome/descrição | Salva via `update_community_space`/RPC | E2E | PROD | médio | SQL | NÃO TESTADO |
| CI-060 | Circles | Admin — aba Aparência | PF-06 | P1 | — | 1. Trocar capa/cores | Reflete na comunidade | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-061 | Circles | Admin — aba Planos/Preços | PF-06 | P0 | — | 1. Configurar planos | `circle_plans` sincronizado | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| CI-062 | Circles | Admin — aba Spaces | PF-06 | P1 | — | 1. Criar/ordenar spaces | Persistido | E2E | PROD | baixo | print | NÃO TESTADO |
| CI-063 | Circles | Admin — aba Membros | PF-06 | P1 | — | 1. Gerenciar | Ações aplicam | E2E | PROD | médio | print | NÃO TESTADO |
| CI-064 | Circles | Admin — aba Convites | PF-06 | P1 | — | 1. Criar link com limite | Limite respeitado | E2E | PROD | médio | SQL | NÃO TESTADO |
| CI-065 | Circles | Admin — aba Gamificação | PF-06 | P2 | — | 1. Renomear níveis | JSONB salvo | E2E | PROD | baixo | SQL | NÃO TESTADO |
| CI-066 | Circles | Admin — aba Onboarding/Checklists | PF-06 | P2 | — | 1. Concluir itens | Validação por existência real no banco | integration | PROD | baixo | SQL | NÃO TESTADO |
| CI-067 | Circles | Admin — aba Afiliados | PF-06 | P1 | — | 1. Configurar comissão | Persistido; aplicado nas vendas | financial | SANDBOX | alto | SQL | NÃO TESTADO |
| CI-068 | Circles | Admin — aba Financeiro/Conta | PF-06 | P1 | — | 1. Abrir | Números conferem | financial | PROD | médio | print | NÃO TESTADO |
| CI-069 | Circles | Admin — aba Sobre/Galeria | PF-06 | P2 | — | 1. Adicionar YouTube/Vimeo + reordenar | DnD e embeds funcionam | manual | PROD | baixo | print | NÃO TESTADO |
| CI-070 | Circles | Não-admin em aba admin | PF-08 | P0 | — | 1. Abrir `/circles/:slug/admin` | Bloqueio front e back | security | PROD | alto | print + resposta | NÃO TESTADO |

---

## 15. Leads, e-mail marketing e transacional

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EM-001 | Leads | Captura via lead magnet | PF-01 | P0 | Produto ativo | 1. Enviar e-mail | Lead persistido no workspace certo | integration | PROD | médio | SQL | NÃO TESTADO |
| EM-002 | Leads | Entrega automática | PF-01 | P0 | — | 1. Capturar | `send-lead-email` entrega o material | integration | PROD | médio | e-mail | NÃO TESTADO |
| EM-003 | Leads | Lista e busca | PF-02 | P1 | — | 1. Abrir `/leads` | Filtros e paginação; limite de 1000 linhas tratado | manual | PROD | médio | print | NÃO TESTADO |
| EM-004 | Leads | Exportação CSV | PF-02 | P2 | — | 1. Exportar | Arquivo com dados corretos | manual | PROD | médio | arquivo | NÃO TESTADO |
| EM-005 | Leads | Segmentos | PF-02 | P2 | — | 1. Criar segmento | Contagem correta | integration | PROD | baixo | SQL | NÃO TESTADO |
| EM-006 | E-mail | Criar campanha | PF-02 | P1 | Segmento | 1. Criar e enviar | Envio em lotes de 10 | integration | SANDBOX | médio | log | NÃO TESTADO |
| EM-007 | E-mail | Agendamento | PF-02 | P2 | — | 1. Agendar | Dispara na hora certa | integration | SANDBOX | médio | log | NÃO TESTADO |
| EM-008 | E-mail | Sequências (`process-email-sequences`) | PF-02 | P1 | Fluxo ativo | 1. Rodar | Passos na ordem, sem repetir | integration | SANDBOX | médio | SQL | NÃO TESTADO |
| EM-009 | E-mail | Remetente blindado | PF-11 | P0 | — | 1. Inspecionar headers | Sempre `mail.kivohub.com.br` | security | PROD | médio | headers | NÃO TESTADO |
| EM-010 | E-mail | SPF/DKIM/DMARC | PF-11 | P0 | — | 1. Checar DNS e headers | Autenticação passa | manual | PROD | alto | headers | NÃO TESTADO |
| EM-011 | E-mail | Transacional de confirmação (código) | PF-01 | P0 | Signup | 1. Verificar | Layout PT-BR, código legível | manual | PROD | médio | e-mail | NÃO TESTADO |
| EM-012 | E-mail | Transacional de compra | PF-10 | P0 | Compra | 1. Verificar | CTA dinâmico de entrega correto | manual | SANDBOX | médio | e-mail | NÃO TESTADO |
| EM-013 | E-mail | Dunning | PF-02 | P1 | Inadimplência | 1. Verificar | 3 níveis distintos | manual | SANDBOX | médio | e-mails | NÃO TESTADO |
| EM-014 | E-mail | Recuperação de carrinho | PF-01 | P1 | Abandono | 1. Verificar | Link `?session=` funciona | integration | SANDBOX | médio | e-mail | NÃO TESTADO |
| EM-015 | E-mail | `resend-webhook` — bounce | PF-11 | P0 | Evento bounce | 1. Enviar webhook | Contato marcado; sem novos envios | integration | SANDBOX | médio | SQL | NÃO TESTADO |
| EM-016 | E-mail | `resend-webhook` — complaint | PF-11 | P0 | Evento complaint | 1. Enviar | Supressão imediata | integration | SANDBOX | alto | SQL | NÃO TESTADO |
| EM-017 | E-mail | Unsubscribe | PF-10 | P0 | Link no rodapé | 1. Descadastrar | Não recebe mais marketing; transacional preservado | integration | PROD | alto | SQL | NÃO TESTADO |
| EM-018 | E-mail | Webhook Resend com assinatura inválida | PF-01 | P0 | — | 1. POST forjado | Rejeitado | security | DEV | alto | resposta | NÃO TESTADO |
| EM-019 | E-mail | Observabilidade de entrega | PF-11 | P1 | — | 1. Consultar auditoria | Status por destinatário disponível | integration | PROD | médio | SQL | NÃO TESTADO |
| EM-020 | E-mail | Notificação ao criador | PF-02 | P1 | Venda | 1. Rodar `notify-creator` | Criador notificado uma vez | integration | SANDBOX | médio | log | NÃO TESTADO |

---

## 16. Appointments, integrações, analytics, uploads e IA

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IN-001 | Appointments | Configurar disponibilidade | PF-02 | P2 | — | 1. Definir horários | Salvo | E2E | PROD | baixo | print | NÃO TESTADO |
| IN-002 | Appointments | Agendar em `/book/:slug` | PF-01 | P2 | Slot livre | 1. Agendar | Reserva criada; slot indisponível | integration | PROD | médio | SQL | NÃO TESTADO |
| IN-003 | Appointments | Conflito de horário | PF-01 | P2 | 2 pessoas no mesmo slot | 1. Agendar simultâneo | Só uma reserva | integration | DEV | médio | SQL | NÃO TESTADO |
| IN-004 | Appointments | Cancelamento | PF-10 | P3 | — | 1. Cancelar | Slot liberado | E2E | PROD | baixo | print | NÃO TESTADO |
| IN-005 | AutoDM | Conexão Instagram | PF-02 | P3 | Flag ON | 1. Conectar | Credenciais em Secrets, nunca no banco | security | DEV | alto | print | NÃO TESTADO |
| IN-006 | WhatsApp | `whatsapp-send` | PF-02 | P3 | Evolution API | 1. Enviar | JWT exigido; mensagem entregue | integration | DEV | médio | log | NÃO TESTADO |
| IN-007 | IA | `ai-generate` com JWT | PF-02 | P1 | — | 1. Chamar sem token | 401 | security | DEV | médio | resposta | NÃO TESTADO |
| IN-008 | IA | Custo/cota por workspace | PF-02 | P1 | — | 1. Consumir cota | Bloqueio ao exceder | security | DEV | médio | SQL | NÃO TESTADO |
| IN-009 | Analytics | `track-event` pageview | PF-01 | P1 | — | 1. Navegar | Eventos registrados sem PII sensível | integration | PROD | médio | SQL | NÃO TESTADO |
| IN-010 | Analytics | Funil de checkout | PF-02 | P1 | — | 1. Simular jornada | Etapas registradas | integration | SANDBOX | médio | SQL | NÃO TESTADO |
| IN-011 | Analytics | Experimentos A/B | PF-01 | P2 | Experimento ativo | 1. Visitar 2x | Variante persistente em `experiment_assignments` | integration | PROD | baixo | SQL | NÃO TESTADO |
| IN-012 | Analytics | Dashboard do produtor | PF-02 | P1 | Vendas | 1. Abrir `/analytics` | Números batem com pedidos | financial | PROD | médio | print + SQL | NÃO TESTADO |
| IN-013 | Settings | Integrações (pixels/domínio) | PF-02 | P1 | — | 1. Salvar pixel | Aplicado na loja pública | manual | PROD | médio | HTML | NÃO TESTADO |
| IN-014 | Settings | Perfil do workspace | PF-02 | P1 | — | 1. Editar | Persistido; reflete na loja | E2E | PROD | baixo | print | NÃO TESTADO |
| IN-015 | Storage | Upload > limite | PF-02 | P1 | Arquivo grande | 1. Enviar | Erro claro, sem travar UI | manual | PROD | médio | print | NÃO TESTADO |
| IN-016 | Storage | Upload de tipo perigoso | PF-02 | P0 | `.svg`/`.html`/`.exe` | 1. Enviar | Bloqueado ou servido sem execução | security | PROD | alto | resposta | NÃO TESTADO |
| IN-017 | Storage | Prefixo `auth.uid()` | PF-02 | P0 | — | 1. Subir arquivo | Caminho contém o uid; RLS impede acesso cruzado | security | DEV | alto | storage | NÃO TESTADO |
| IN-018 | Storage | Acesso cruzado a arquivo privado | PF-05 | P0 | Arquivo de outro usuário | 1. Tentar baixar | 403 | security | PROD | alto | resposta | NÃO TESTADO |
| IN-019 | IA | Conteúdo gerado em PT-BR | PF-02 | P2 | — | 1. Gerar | Sempre PT-BR | manual | PROD | nenhum | print | NÃO TESTADO |
| IN-020 | Tracking | Pixel `<noscript>` | PF-01 | P3 | — | 1. Ver HTML | `<noscript>` no `<body>`, não no `<head>` | manual | PROD | nenhum | HTML | NÃO TESTADO |

---

## 17. Ops, jobs, cron, alertas e health

| ID | Módulo | Feature | Perfil | Pri | Pré-condições | Passos | Esperado | Tipo | Amb | Risco | Evidência | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OP-001 | Ops | `health-check` | PF-11 | P0 | — | 1. Chamar | 200 com componentes OK | API | PROD | nenhum | resposta | NÃO TESTADO |
| OP-002 | Ops | Cron secret obrigatório | PF-01 | P0 | — | 1. Chamar job sem `X-Kivo-Cron-Secret` | 401 | security | PROD | alto | resposta | NÃO TESTADO |
| OP-003 | Ops | Registro em `cron_runs` | PF-11 | P1 | Job executado | 1. Consultar | Início/fim/status gravados | integration | SANDBOX | baixo | SQL | NÃO TESTADO |
| OP-004 | Ops | `retry-webhooks` | PF-11 | P0 | Webhook falho | 1. Rodar | Reprocessa sem duplicar efeitos | integration | SANDBOX | alto | SQL | NÃO TESTADO |
| OP-005 | Ops | Backoff/limite de retentativas | PF-11 | P1 | Falha persistente | 1. Rodar várias vezes | Para após N tentativas e alerta | integration | SANDBOX | médio | log | NÃO TESTADO |
| OP-006 | Ops | `ops-alerts` Telegram | PF-11 | P1 | Erro simulado | 1. Disparar | Alerta recebido | integration | SANDBOX | médio | print | NÃO TESTADO |
| OP-007 | Ops | `process-activation-nudges` | PF-11 | P2 | — | 1. Rodar | Nudges enviados uma vez | integration | SANDBOX | baixo | SQL | NÃO TESTADO |
| OP-008 | Ops | Logs de Edge Functions | PF-11 | P1 | — | 1. Consultar após testes | Sem 5xx inesperado; sem PII/secret em log | security | PROD | alto | log | NÃO TESTADO |
| OP-009 | Ops | Concorrência entre jobs | PF-11 | P1 | 2 execuções | 1. Sobrepor | Lock impede efeito duplo | integration | SANDBOX | alto | SQL | NÃO TESTADO |
| OP-010 | Ops | Fuso horário dos crons | PF-11 | P1 | — | 1. Conferir agendamentos | UTC/BRT documentado e coerente | manual | PROD | médio | SQL | NÃO TESTADO |
| OP-011 | Ops | War room `/ops` | PF-11 | P1 | — | 1. Abrir | Painéis carregam com dados reais | E2E | PROD | baixo | print | NÃO TESTADO |
| OP-012 | Ops | Go-live checklist | PF-11 | P1 | — | 1. Abrir `/admin/go-live` | Itens refletem estado real | manual | PROD | médio | print | NÃO TESTADO |

---

## 18. Segurança

### 18.1 RLS por domínio de tabela

| ID | Tabela/Grupo | Cenário | Pri | Passos | Esperado | Tipo | Risco | Status |
|---|---|---|---|---|---|---|---|---|
| SEC-001 | `workspaces`, `workspace_members` | Ler workspace alheio | P0 | Query direta com JWT de outro usuário | 0 linhas | security | alto | NÃO TESTADO |
| SEC-002 | `products`, `prices` | Ler/alterar produto alheio | P0 | SELECT/UPDATE cruzado | leitura só pública/publicada; update negado | security | alto | NÃO TESTADO |
| SEC-003 | `orders` | Comprador vê só o próprio | P0 | SELECT cruzado | 0 linhas | security | alto | NÃO TESTADO |
| SEC-004 | `payments` | Idem | P0 | SELECT cruzado | 0 linhas | security | alto | NÃO TESTADO |
| SEC-005 | `entitlements` / `user_asset_entitlements` | Acesso indevido | P0 | SELECT cruzado | 0 linhas | security | alto | NÃO TESTADO |
| SEC-006 | `wallet_ledger` | INSERT/UPDATE pelo cliente | P0 | Tentar escrever | negado (só service_role) | security | alto | NÃO TESTADO |
| SEC-007 | `split_entries` | Leitura cruzada | P0 | SELECT | só do próprio workspace | security | alto | NÃO TESTADO |
| SEC-008 | `reserve_entries` | Leitura cruzada | P0 | SELECT | só do próprio | security | alto | NÃO TESTADO |
| SEC-009 | `payout_requests` | Criar para outro workspace | P0 | INSERT forjado | negado | security | alto | NÃO TESTADO |
| SEC-010 | `bank_accounts` | Leitura cruzada | P0 | SELECT | 0 linhas | security | alto | NÃO TESTADO |
| SEC-011 | `fee_config`, `split_rules` | Alterar taxas | P0 | UPDATE por produtor | negado | security | alto | NÃO TESTADO |
| SEC-012 | `coupons` | Alterar cupom alheio | P0 | UPDATE | negado | security | alto | NÃO TESTADO |
| SEC-013 | `checkout_sessions` | Anon lê e-mails | P0 | SELECT anônimo | negado | security | alto | NÃO TESTADO |
| SEC-014 | `checkout_sessions` | UPDATE sem posse | P0 | UPDATE forjado | negado | security | alto | NÃO TESTADO |
| SEC-015 | `leads` | Leitura cruzada | P0 | SELECT | só do workspace | security | alto | NÃO TESTADO |
| SEC-016 | `community_members` | Ver membros de comunidade privada | P0 | SELECT como não-membro | 0 linhas | security | alto | NÃO TESTADO |
| SEC-017 | `community_posts`/comentários | Ler feed privado | P0 | SELECT como não-membro | 0 linhas | security | alto | NÃO TESTADO |
| SEC-018 | `community_invite_links` | UPDATE não escopado | P0 | UPDATE alheio | negado via RPC | security | alto | NÃO TESTADO |
| SEC-019 | `community_reports` | Membro altera denúncia | P0 | UPDATE | negado | security | alto | NÃO TESTADO |
| SEC-020 | `community_tasks` | Escrita por não-membro | P0 | INSERT | negado | security | alto | NÃO TESTADO |
| SEC-021 | `auth_verification_codes` | Leitura por anon/authenticated | P0 | SELECT | negado (só service_role) | security | alto | NÃO TESTADO |
| SEC-022 | `user_account_types` | UPDATE pelo próprio usuário | P0 | UPDATE para PRODUCER | negado | security | alto | NÃO TESTADO |
| SEC-023 | `user_roles` | Escalada de papel | P0 | INSERT admin | negado; `has_role` intacto | security | alto | NÃO TESTADO |
| SEC-024 | `realtime_messages` | RLS habilitado | P0 | Subscrever canal alheio | sem eventos | security | alto | NÃO TESTADO |
| SEC-025 | `affiliates`/comissões | Alterar percentual | P0 | UPDATE | trigger de guarda bloqueia | security | alto | NÃO TESTADO |
| SEC-026 | `webhook_events` | Leitura pública | P0 | SELECT anon | negado | security | alto | NÃO TESTADO |
| SEC-027 | Views | `security_invoker` | P0 | Consultar views sensíveis | respeita RLS do chamador | security | alto | NÃO TESTADO |
| SEC-028 | GRANTs | Tabelas novas sem GRANT | P1 | Rodar linter | nenhum erro de permissão em runtime | security | médio | NÃO TESTADO |

### 18.2 Aplicação, API e infraestrutura

| ID | Módulo | Cenário | Pri | Passos | Esperado | Tipo | Risco | Status |
|---|---|---|---|---|---|---|---|---|
| SEC-029 | IDOR | Trocar `orderId` na URL de sucesso | P0 | Abrir pedido alheio | negado | security | alto | NÃO TESTADO |
| SEC-030 | IDOR | Trocar `productId` em `/member/course` | P0 | Abrir curso não comprado | negado | security | alto | NÃO TESTADO |
| SEC-031 | IDOR | Trocar `memberId` em perfil de comunidade | P1 | Abrir perfil de outra comunidade | negado | security | médio | NÃO TESTADO |
| SEC-032 | CORS | Origem não permitida | P0 | OPTIONS com `https://evil.com` | não ecoa a origem | security | alto | NÃO TESTADO |
| SEC-033 | CORS | Nunca `*` | P0 | Inspecionar headers de todas as funções públicas | origem específica | security | alto | NÃO TESTADO |
| SEC-034 | JWT | Funções com `verify_jwt=true` | P0 | Chamar sem token | 401 | security | alto | NÃO TESTADO |
| SEC-035 | JWT | Validação em código | P0 | Token válido de outro usuário | função valida `getUser()` e escopo | security | alto | NÃO TESTADO |
| SEC-036 | Secrets | Nenhum segredo no bundle | P0 | Grep no build | só chaves publicáveis | security | alto | NÃO TESTADO |
| SEC-037 | Secrets | `service_role` nunca no front | P0 | Grep repositório/rede | ausente | security | alto | NÃO TESTADO |
| SEC-038 | Rate limit | Endpoints sensíveis | P1 | Flood em auth/cupom/IA | 429 | security | médio | NÃO TESTADO |
| SEC-039 | Open redirect | Parâmetros de retorno | P0 | `?redirect=//evil.com` | sanitizado | security | alto | NÃO TESTADO |
| SEC-040 | XSS | Campos ricos (bio, post, aula) | P0 | Injetar payload | escapado | security | alto | NÃO TESTADO |
| SEC-041 | CSRF | Ações state-changing | P1 | Requisição cross-site | bloqueada (token/SameSite) | security | médio | NÃO TESTADO |
| SEC-042 | Upload | Arquivo malicioso | P0 | Subir `.svg` com script | não executa ao ser servido | security | alto | NÃO TESTADO |
| SEC-043 | Enumeração | Login/reset/código | P0 | E-mail existente × inexistente | respostas idênticas | security | alto | NÃO TESTADO |
| SEC-044 | Senha vazada | Proteção de senha comprometida | P1 | Cadastrar senha conhecida vazada | bloqueio (Supabase leaked password protection) | security | médio | NÃO TESTADO |
| SEC-045 | Bucket | Listagem pública | P0 | Listar buckets privados | negado | security | alto | NÃO TESTADO |
| SEC-046 | Admin | `is_admin_user` sem hardcode inseguro | P0 | Verificar função | validação server-side | security | alto | NÃO TESTADO |
| SEC-047 | LGPD | Política de privacidade e base legal | P1 | Revisar `/privacy` | cobre dados coletados e finalidade | manual | médio | NÃO TESTADO |
| SEC-048 | LGPD | Exclusão de conta | P0 | Solicitar exclusão | processo definido e executável | manual | alto | NÃO TESTADO |
| SEC-049 | LGPD | Exportação de dados | P1 | Solicitar export | processo definido | manual | médio | NÃO TESTADO |
| SEC-050 | LGPD | Retenção de dados de cartão | P0 | Auditar tabelas | somente token; nunca PAN/CVV | security | alto | NÃO TESTADO |
| SEC-051 | Headers | HSTS/CSP/X-Content-Type | P1 | Inspecionar resposta | headers de segurança presentes | manual | médio | NÃO TESTADO |
| SEC-052 | Dependências | Scan de vulnerabilidades | P1 | Rodar dependency scan | sem CVE crítica | security | médio | NÃO TESTADO |
| SEC-053 | Linter Supabase | Avisos do linter | P1 | Rodar linter | zero erro; avisos justificados | security | médio | NÃO TESTADO |
| SEC-054 | Logs | Vazamento em log | P0 | Revisar logs pós-teste | sem token/senha/PAN | security | alto | NÃO TESTADO |

---

## 19. Qualidade não funcional

| ID | Área | Cenário | Pri | Esperado | Tipo | Status |
|---|---|---|---|---|---|---|
| NF-001 | Browser | Chrome desktop (últimas 2 versões) | P0 | Jornadas P0 sem erro de console | manual | NÃO TESTADO |
| NF-002 | Browser | Firefox | P1 | Idem | manual | NÃO TESTADO |
| NF-003 | Browser | Safari macOS | P0 | Idem (atenção a datas e storage) | manual | NÃO TESTADO |
| NF-004 | Browser | Edge | P2 | Idem | manual | NÃO TESTADO |
| NF-005 | Mobile | Safari iOS (iPhone) | P0 | Checkout e Circles usáveis | manual | NÃO TESTADO |
| NF-006 | Mobile | Chrome Android | P0 | Idem | manual | NÃO TESTADO |
| NF-007 | Responsivo | 320px | P1 | Sem overflow horizontal | manual | NÃO TESTADO |
| NF-008 | Responsivo | 375px | P0 | Layout correto | manual | NÃO TESTADO |
| NF-009 | Responsivo | 768px | P1 | Grid intermediário coerente | manual | NÃO TESTADO |
| NF-010 | Responsivo | 1024px | P1 | Sidebar/conteúdo corretos | manual | NÃO TESTADO |
| NF-011 | Responsivo | 1440px | P1 | Sem esticar demais | manual | NÃO TESTADO |
| NF-012 | A11y | Navegação por teclado | P1 | Toda jornada P0 navegável | manual | NÃO TESTADO |
| NF-013 | A11y | Foco visível e focus trap correto | P1 | Modais devolvem foco | manual | NÃO TESTADO |
| NF-014 | A11y | Contraste WCAG AA | P1 | ≥ 4.5:1 em textos | manual | NÃO TESTADO |
| NF-015 | A11y | Labels e ARIA em formulários | P1 | Leitor de tela anuncia campos | manual | NÃO TESTADO |
| NF-016 | A11y | Mensagens de erro com `role="alert"` | P2 | Anunciadas | manual | NÃO TESTADO |
| NF-017 | Perf | LCP da landing | P1 | < 2,5s em 4G | manual | NÃO TESTADO |
| NF-018 | Perf | Bundle/manualChunks | P1 | Sem chunk gigante; lazy routes funcionam | manual | NÃO TESTADO |
| NF-019 | Perf | Dashboard com muitos dados | P1 | < 3s para primeira pintura útil | manual | NÃO TESTADO |
| NF-020 | Rede | 3G lento | P1 | Skeletons, sem tela branca | manual | NÃO TESTADO |
| NF-021 | Rede | Offline | P1 | Erro tratado, sem crash | manual | NÃO TESTADO |
| NF-022 | Resiliência | Falha de carregamento de chunk | P0 | `lazyWithRetry` recarrega uma vez | manual | NÃO TESTADO |
| NF-023 | Resiliência | ErrorBoundary global | P0 | Erro isolado, com CTA de recuperação | manual | NÃO TESTADO |
| NF-024 | Resiliência | Suspense com timeout | P1 | Não fica em loading infinito | manual | NÃO TESTADO |
| NF-025 | Observabilidade | `reportAppError` | P1 | Erros de front chegam ao destino | integration | NÃO TESTADO |
| NF-026 | Backup | Snapshot do banco | P0 | Backup recente existente | manual | NÃO TESTADO |
| NF-027 | Restore | Ensaio de restauração | P0 | Restore validado em ambiente isolado | manual | NÃO TESTADO |
| NF-028 | Domínio | DNS de kivohub.com.br | P0 | Apex e www resolvem | manual | NÃO TESTADO |
| NF-029 | SSL | Certificado válido | P0 | HTTPS sem aviso; redirect http→https | manual | NÃO TESTADO |
| NF-030 | SEO | `robots.txt` e `sitemap.xml` | P1 | Acessíveis e coerentes | manual | NÃO TESTADO |
| NF-031 | SEO | Canonical | P2 | Presente nas páginas públicas | manual | NÃO TESTADO |
| NF-032 | i18n | 100% PT-BR | P1 | Sem strings em inglês na UI | manual | NÃO TESTADO |
| NF-033 | UI | Sem diálogos nativos | P0 | Nenhum `alert/confirm/prompt` | manual | NÃO TESTADO |
| NF-034 | UI | Navegação dentro de Dialog | P1 | Usa `<a>`/`window.location.href`, sem travar foco | manual | NÃO TESTADO |
| NF-035 | Dados | Limite de 1000 linhas do PostgREST | P1 | Listas grandes paginam corretamente | manual | NÃO TESTADO |

---

## 20. Plano de testes financeiros reais controlados (DOCUMENTAL — NÃO EXECUTAR)

> **Aviso.** Nenhuma transação real deve ser executada por este documento nem pelo agente. Esta seção descreve o roteiro que a pessoa responsável financeira executará manualmente, com autorização explícita, após todos os P0 de sandbox estarem APROVADOS.

**Pré-requisitos**: ambiente PROD com `ASAAS_ENV=production`, conta bancária do criador de teste validada, cartão corporativo próprio, planilha de conciliação aberta, admin Kivo de plantão.

| ID | Cenário | Valor sugerido | Método | O que conciliar (centavo a centavo) | Status |
|---|---|---|---|---|---|
| RF-001 | Venda mínima PIX | R$ 5,00 | PIX | `orders.total_amount`, `payments`, `split_entries` (bruto = gateway + plataforma + afiliado + criador), `wallet_ledger` pending, sem reserva | NÃO TESTADO |
| RF-002 | Venda mínima cartão à vista | R$ 5,00 | Cartão 1x | Idem + `reserve_entries` 10% conforme plano | NÃO TESTADO |
| RF-003 | Venda cartão parcelada | R$ 24,00 em 12x | Cartão 12x | Valor por parcela, taxa de parcelamento, líquido do criador | NÃO TESTADO |
| RF-004 | Venda boleto | R$ 5,00 | Boleto | Sem reserva; hold days corretos | NÃO TESTADO |
| RF-005 | Venda com cupom | R$ 10,00 - 50% | PIX | Desconto aplicado antes do split; base de comissão correta | NÃO TESTADO |
| RF-006 | Venda com afiliado | R$ 10,00 | PIX | `affiliate_fee` e comissão pendente | NÃO TESTADO |
| RF-007 | Venda com order bump | R$ 5,00 + R$ 5,00 | Cartão | Dois entitlements; total e splits somados | NÃO TESTADO |
| RF-008 | Assinatura de comunidade | menor plano | Cartão | 1ª cobrança + renovação no ciclo seguinte | NÃO TESTADO |
| RF-009 | Assinatura Kivo CREATOR | preço vigente | Cartão | `workspaces.plan` e fatura | NÃO TESTADO |
| RF-010 | Refund total | RF-001 | — | Estorno no ledger, entitlement revogado, comissão cancelada | NÃO TESTADO |
| RF-011 | Liberação de hold | RF-001 | — | Pending → available na data prevista | NÃO TESTADO |
| RF-012 | Liberação de reserva | RF-002 | — | Reserva liberada em D+30/D+15 conforme plano | NÃO TESTADO |
| RF-013 | Saque mínimo | saldo disponível | — | `payout_requests`, débito no ledger, extrato bancário | NÃO TESTADO |
| RF-014 | Conciliação final | todos | — | Soma de entradas − saídas = saldo exibido na UI, diferença 0 | NÃO TESTADO |

**Regra de conciliação:** para cada ID acima, registrar em planilha: valor bruto, taxa gateway, taxa plataforma, comissão afiliado, líquido criador, reserva, data de liberação prevista, data efetiva, extrato Asaas e extrato bancário. Qualquer diferença ≠ R$ 0,00 é **P0 REPROVADO**.

---

## 21. Checklist de infraestrutura, APIs e secrets (sem expor valores)

**Execução Onda 0 — 2026-08-11 (UTC). Commit-base:** `05b140c8b6af6f6cf3b5ccb2ecd4283db8d25bcf`. Nenhum valor de secret foi lido, impresso ou versionado: registra-se apenas presente/ausente.

| ID | Item | Verificação | Pri | Status | Evidência sanitizada (2026-08-11 UTC) |
|---|---|---|---|---|---|
| IF-001 | `ASAAS_API_KEY` | Presente, do ambiente correto, sem truncamento | P0 | APROVADO | Secret presente no escopo Edge Functions; valor não inspecionado. Ambiente confirmado por `ASAAS_ENV`. |
| IF-002 | `ASAAS_ENV` | `production` em PROD, `sandbox` em testes | P0 | APROVADO | Secret presente; funções derivam a base por `getAsaasBase()`. |
| IF-003 | `ASAAS_WEBHOOK_TOKEN` | Configurado no Asaas e no projeto, valores idênticos | P0 | BLOQUEADO | Ausente na lista de secrets do projeto. Paridade com o painel Asaas exige ação externa → **EXT-001**. |
| IF-004 | URL do webhook Asaas | Aponta para `webhook-asaas` em PROD | P0 | BLOQUEADO | Só verificável no painel Asaas → **EXT-002**. |
| IF-005 | `RESEND_API_KEY` | Válida; domínio verificado | P0 | APROVADO | Secret presente; nenhum e-mail disparado nesta rodada. |
| IF-006 | Webhook Resend | URL e segredo de assinatura configurados | P0 | BLOQUEADO | `RESEND_WEBHOOK_SECRET` ausente nos secrets → **EXT-003**. |
| IF-007 | `X-Kivo-Cron-Secret` | Definido e exigido por todos os jobs | P0 | APROVADO | Secret presente; `cron_invoke` envia o header e as funções agendadas o exigem. |
| IF-008 | `SUPABASE_SERVICE_ROLE_KEY` | Só em Edge Functions | P0 | APROVADO | SEC-036/037: `grep` no bundle de produção sem ocorrência de `service_role` ou JWT de serviço. |
| IF-009 | `LOVABLE_API_KEY` / gateway de IA | Configurado com cota | P1 | APROVADO | Secret presente (gerenciado); quota de IA aplicada por `ai_usage_log`. |
| IF-010 | SMTP/Auth do Supabase | Custom SMTP ativo; templates nativos não disparam no signup | P0 | APROVADO | Signup usa código próprio de 4 dígitos (`auth-request-code`); nenhum magic link no fluxo. |
| IF-011 | Providers de Auth | Google configurado com redirects corretos | P1 | BLOQUEADO | Config de provider só é auditável no painel → **EXT-004**. |
| IF-012 | Site URL e Redirect URLs | Apontam para kivohub.com.br e preview | P0 | BLOQUEADO | Painel Auth → **EXT-004**. Indireta: `https://kivohub.com.br/signup` e `/member/login` responderam 200. |
| IF-013 | Buckets de Storage | `private-files` privado; políticas por `auth.uid()` | P0 | APROVADO | `private-files` privado; `assets`/`community` públicos por design. Policies de leitura de `private-files` restritas ao próprio usuário. |
| IF-014 | pg_cron | Jobs agendados e ativos; `cron_runs` gravando | P0 | **REPROVADO → CORRIGIDO** | 13 jobs ativos. `reconcile-asaas`, `release-reserves` e `subscription-health-daily` gravavam TIMEOUT por falta de instrumentação. Corrigido com `startCronRun`/`finish`. Regressão: `src/test/cron-audit-contract.test.ts`. **Requer deploy — AGUARDANDO REVISÃO.** |
| IF-015 | Backups automáticos | Habilitados e testados | P0 | BLOQUEADO | Painel Supabase → **EXT-005**. |
| IF-016 | Alertas (Telegram/ops) | Canal recebendo | P1 | BLOQUEADO | Requer disparo real de alerta → **EXT-006**. |
| IF-017 | Domínio de e-mail | SPF/DKIM/DMARC válidos para `mail.kivohub.com.br` | P0 | BLOQUEADO | Painel Resend/DNS → **EXT-007**. |
| IF-018 | Vercel/hospedagem | Build de produção e rewrites (`vercel.json`) corretos | P0 | APROVADO | Build de produção concluído sem erro; rotas SPA profundas responderam 200 em PROD. |
| IF-019 | Migrations aplicadas | Migration do advisory lock em `ensure_producer_workspace_for` aplicada em PROD | P0 | APROVADO (com ressalva) | `pg_get_functiondef` confirma `pg_advisory_xact_lock(hashtext(...), hashtext(p_user_id::text))` na função viva. Ressalva: arquivo `20260811050000` não consta em `schema_migrations` (histórico, sem impacto funcional). |
| IF-020 | Funções de diagnóstico | `test-asaas`, `simulate-installments` não expostas publicamente | P1 | APROVADO (com ressalva) | `test-asaas` exige Authorization + admin. `simulate-installments` é pública **por projeto** (checkout anônimo em `PaymentTabs.tsx`); ressalva: sem rate limit próprio → item de backlog P2. |
| IF-021 | `create-asaas-account` | Depreciada e desligada | P1 | **REPROVADO → CORRIGIDO** | Deploy ainda respondia e podia criar subconta. Adicionado kill-switch 410 antes de qualquer chamada ao Asaas. Regressão: `src/test/deprecated-functions-contract.test.ts`. **Requer deploy — AGUARDANDO REVISÃO.** |
| IF-022 | Quality gate CI | Workflow verde no commit-base | P1 | APROVADO | Baseline local equivalente ao gate: typecheck 0 erros, 343+13 testes verdes, build OK, audit sem high/critical. |

### Baseline automatizado da Onda 0

| Comando | Resultado |
|---|---|
| Typecheck (`tsgo`) | APROVADO — 0 erros |
| Suíte completa (`vitest run`) | APROVADO — 343 testes / 33 arquivos + 13 novos de regressão |
| Build de produção | APROVADO |
| Dependency audit/scan | APROVADO — nenhuma vulnerabilidade high/critical |
| SEC-036 / SEC-037 / SEC-052 | APROVADO — bundle sem `service_role`, sem chave de serviço, sem segredo em repo versionado |
| Linter Supabase | 0 ERROR; 148 WARN informativos + `Leaked Password Protection Disabled` → **EXT-008** |

---

## 21.1 AÇÕES EXTERNAS DO LUCAS

Somente itens que exigem acesso a painel externo. Nenhum pode ser resolvido pelo agente.

| ID | Instrução exata | Painel / URL | Valor esperado | Risco se ignorado | Como comprovar |
|---|---|---|---|---|---|
| EXT-001 | Copiar o token de autenticação de webhook do Asaas e salvá-lo em Project Settings → Secrets como `ASAAS_WEBHOOK_TOKEN`, com o valor **idêntico** ao do painel. | Asaas → Integrações → Webhooks; Lovable → Project Settings → Secrets | Secret presente e igual ao painel | P0: webhook de pagamento pode ser aceito sem autenticação ou rejeitado em massa → pedidos não liberados | Print do painel com o campo preenchido (mascarado) + secret listado no projeto |
| EXT-002 | Confirmar que a URL do webhook do Asaas aponta para a função `webhook-asaas` do projeto de produção e está ativa, com fila sem pendências. | Asaas → Integrações → Webhooks | URL da função `webhook-asaas` em PROD, status ativo | P0: nenhum pagamento é processado | Print da URL (host mascarado) + status "Ativo" e fila zerada |
| EXT-003 | Criar um segredo forte (ex.: `openssl rand -hex 32`), colar no webhook do Resend e salvar o **mesmo valor** como `RESEND_WEBHOOK_SECRET`. | Resend → Webhooks; Lovable → Project Settings → Secrets | Mesmo valor nos dois lados | P1: eventos de e-mail (bounce/spam) podem ser forjados | Print do webhook criado + secret listado |
| EXT-004 | Validar Site URL, Redirect URLs e provider Google: devem conter `https://kivohub.com.br` e a URL de preview. | Supabase → Authentication → URL Configuration / Providers | Domínio de produção + preview autorizados | P0: login Google e retorno pós-auth quebram em produção | Print das listas de URLs e do provider habilitado |
| EXT-005 | Confirmar que os backups automáticos estão habilitados e executar/verificar um restore de teste. | Supabase → Database → Backups | Backups diários com data recente | P0: perda de dados irreversível | Print com data do último backup bem-sucedido |
| EXT-006 | Disparar um alerta de teste e confirmar o recebimento no canal de ops. | Telegram (canal de ops) + `/ops` | Mensagem de teste recebida | P1: incidentes em produção passam sem aviso | Print da mensagem recebida com timestamp |
| EXT-007 | Verificar SPF, DKIM e DMARC do domínio de envio; todos devem estar "Verified". | Resend → Domains (`mail.kivohub.com.br`) | 3 registros verificados | P0: e-mails de código e de compra caem em spam | Print da tela de domínio com os três selos verdes |
| EXT-008 | Ativar "Leaked Password Protection". | Supabase → Authentication → Policies (Password) | Opção habilitada | P1: aceite de senhas vazadas em cadastros | Print com o toggle ativo |



---

## 21.2 Exposição de RPCs SECURITY DEFINER (Security Advisor)

**Data:** 2026-08-11 UTC. **Origem:** Supabase Security Advisor + verificação independente por consulta a `has_function_privilege`.
**Remediation URLs (advisor):**
- `0028_anon_security_definer_function_executable` — https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- `0029_authenticated_security_definer_function_executable` — https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

**Inventário medido:** 0 ERROR no linter; 148 WARN de SECURITY DEFINER executável, sendo **52 funções não-trigger** e **16 triggers** com EXECUTE para `anon`.

### SEC-060 — P0 CONFIRMADO: `cron_secret()` acessível por `anon`

Prova de exploração (executada com a chave publicável, sem privilégio algum):

| Chamada | Papel | Resultado |
|---|---|---|
| `POST /rest/v1/rpc/cron_secret` | `anon` | **200** — retornou o segredo em texto (valor não registrado neste documento) |
| `POST /rest/v1/rpc/cron_runs_sweep` | `anon` | **200** — executou o sweep de auditoria |
| `POST /rest/v1/rpc/cleanup_rate_limits` | `anon` | **204** — apagou o histórico de rate limit |

**Impacto:** com o segredo em mãos, qualquer pessoa invoca todos os jobs (`X-Kivo-Cron-Secret`): repasses, liberação de reservas, conciliação, e-mails em lote. `cleanup_rate_limits` permite zerar o rate limit e viabilizar brute force nos códigos de verificação. **P0 — corrigir antes do go-live.**

### Classificação caso a caso (sem revogação em massa)

| Classe | Nº | Ação | Justificativa |
|---|---|---|---|
| Trigger-only | 16 | REVOKE de `anon` e `authenticated` | Gatilhos rodam como owner da tabela; nenhum EXECUTE direto é necessário. |
| Service/cron-only | 15 | REVOKE de `anon`+`authenticated`; GRANT a `service_role` quando chamada por Edge Function | `cron_secret`, `cron_invoke`, `cron_run_finish`, `cron_runs_sweep`, `cleanup_rate_limits`, `redeem_coupon`, `increment_product_sales` etc. Nenhuma tem call site no frontend. |
| Authenticated-only | 22 | REVOKE apenas de `anon` | Todas as call sites exigem `userId`/sessão (`useCourseBuilder`, `useJoinCommunity`, painéis financeiros). |
| `anon` intencional | 3 | **Sem mudança** | `complete_checkout_session`, `get_checkout_session_public`, `get_community_public_plans` — checkout sem login e landing pública. WARN aceito por projeto. |
| Predicado de RLS | 12 | **Sem mudança** | `is_*`, `has_role`, `get_community_*_for_user`: a policy é avaliada com o papel do chamador; revogar quebraria leitura pública legítima (storefront/landing). |

Fonte de verdade da classificação: `src/lib/security/rpcExposurePolicy.ts`.
Regressão contratual: `src/test/rpc-exposure-contract.test.ts` (impede que o frontend passe a chamar RPC server-only e trava `cron_secret` como server-only).
**Remediação aplicada em 2 migrations granulares (revoke por assinatura exata, sem revogação em bloco):**

1. Etapa 1 — `REVOKE` de `anon`/`authenticated` nas classes trigger-only, service-only e authenticated-only + `GRANT` a `service_role` onde há Edge Function chamadora. Linter: 149 → 134 issues.
2. Etapa 2 — descoberto na reverificação que várias funções mantinham `GRANT EXECUTE` para **PUBLIC**, o que anulava a etapa 1 (prova: `anon` ainda executava `cleanup_rate_limits`, HTTP 204). Aplicado `REVOKE ... FROM PUBLIC` por assinatura + `GRANT` explícito a `authenticated` na classe authenticated-only. Linter: 134 → **69 issues**.

**Reverificação pós-correção (mesma chave publicável, 2026-08-11 UTC):**

| Chamada | Antes | Depois |
|---|---|---|
| `rpc/cron_secret` | 200 (segredo devolvido) | **401 `42501` permission denied** |
| `rpc/cron_runs_sweep` | 200 | **401 `42501` permission denied** |
| `rpc/cleanup_rate_limits` | 204 | **401 `42501` permission denied** |
| `rpc/get_checkout_session_public` (deve funcionar) | 200 | **200** (sem regressão) |
| `rpc/get_community_public_plans` (deve funcionar) | 200 | **200** (sem regressão) |

**SEC-060: CORRIGIDO E VERIFICADO.** Suíte completa após a correção: **360 testes verdes / 36 arquivos**.


### Edge Functions ativas com `verify_jwt=false`

| Função | Versão | Situação |
|---|---|---|
| `test-asaas` | v79 | Valida `Authorization` + admin em código. APROVADO com ressalva (deploy exposto). |
| `simulate-installments` | v57 | Público **por projeto** (checkout anônimo em `PaymentTabs.tsx`). Ressalva: sem rate limit próprio → backlog P2. |
| `create-asaas-account` | v36 | Depreciada. Kill-switch 410 adicionado nesta rodada (IF-021); **requer deploy** para o v36 exposto deixar de aceitar chamadas. |



## 22. Matriz de cobertura: código existente × teste ausente

Legenda: **Cobertura** = automatizada hoje no repositório (arquivos em `src/test/`). **Lacuna** = risco não coberto por automação.

| Área do código | Cobertura automatizada atual | Lacuna observada | Ação sugerida | Pri |
|---|---|---|---|---|
| Auth 4 dígitos (`auth-confirm`, request/verify) | Alta (`auth-confirm-consume`, `auth-pending-signup`, `auth-email-code`, `auth-hardening-contract`, `auth-workspace-lock-contract`) | Sem E2E real de e-mail entregue | E2E manual + monitor de entrega | P0 |
| Guarda de e-mail (`authEmailGuard`) | Alta (`auth-email-guard`) | — | — | P3 |
| Checkout totals | Média (`checkout-totals`, `checkout.test`) | Sem teste de parcelamento e bump combinados | unit adicional | P0 |
| Comissões | Alta (`commissions`, `commissions-block1`) | Sem teste de autoindicação e fraude de clique | unit + integration | P0 |
| Product editor | Alta (vários testes de reducer/mappers/binding) | Sem teste de rollback de flag v2→v1 | integration | P1 |
| Course builder | Média (`course-builder`, integração) | Quiz, certificado e progresso sem cobertura | unit + E2E | P1 |
| Circles | Baixa (`community-access`, `pending-community-join`) | Feed, posts, anexos, moderação, planos sem automação | E2E | P0 |
| Rotas | Média (`routes-smoke`) | Smoke não cobre rotas Circles autenticadas | E2E | P1 |
| Financeiro (ledger/holds/reservas/payouts) | Baixa — validado por scripts manuais | Sem suite automatizada de reconciliação | testes SQL/integration | P0 |
| Webhook Asaas | Baixa | Idempotência e ordem de eventos sem automação | integration com fixtures | P0 |
| RLS | Nenhuma automatizada | Toda a matriz da seção 18.1 é manual | suite SQL por papel | P0 |
| E-mails (Resend/webhook) | Nenhuma | Bounce/complaint/unsubscribe manuais | integration | P1 |
| Jobs/cron | Nenhuma | Idempotência sob execução dupla | integration | P0 |
| Storefront/tema | Baixa | Presets e tokens sem teste visual | snapshot/visual | P2 |
| Appointments / AutoDM / WhatsApp / NFSe | Nenhuma | Módulos candidatos a flag OFF no MVP | — | P2 |
| A11y e responsivo | Nenhuma | Manual | checklist NF | P1 |

---

## 23. Ordem de execução em ondas

| Onda | Objetivo | Conteúdo | Critério de saída |
|---|---|---|---|
| **Onda 0 — Preparação** | Ambiente pronto | Seção 21 (IF-001…IF-022), criação de contas de teste dos 13 perfis, planilha de evidências | Todos os itens P0 de infra APROVADOS |
| **Onda 1 — Fundamentos** | App abre e autentica | Seção 5 (RT-001…RT-100), seção 6 completa | Zero P0 reprovado em rotas e auth |
| **Onda 2 — Segurança** | Sem vazamento | Seção 18 completa + linter e dependency scan | Zero P0 de segurança reprovado |
| **Onda 3 — Criação de oferta** | Produtor consegue vender | Seções 7, 8 e 9 | Produto publicado e visível na loja |
| **Onda 4 — Receita (sandbox)** | Dinheiro entra corretamente | Seções 10, 11, 12, 13 em SANDBOX | Conciliação sandbox fecha em 0 |
| **Onda 5 — Comunidade** | Retenção | Seção 14 completa | Fluxos P0 de Circles aprovados |
| **Onda 6 — Comunicação e ops** | Operação sustentável | Seções 15, 16, 17 | Jobs idempotentes e alertas funcionando |
| **Onda 7 — Não funcional** | Qualidade percebida | Seção 19 | Zero P0/P1 crítico em browsers-alvo |
| **Onda 8 — Financeiro real** | Prova final | Seção 20, com autorização explícita | Conciliação real centavo a centavo = 0 |
| **Onda 9 — Regressão final** | Congelamento | Reexecutar todos os P0 no commit de release | 100% dos P0 APROVADOS |

---

## 24. Critérios finais objetivos de GO/NO-GO

**GO exige, cumulativamente:**

1. 100% dos casos **P0** com status `APROVADO` (nenhum `NÃO TESTADO`, `REPROVADO` ou `BLOQUEADO`).
2. ≥ 95% dos casos **P1** `APROVADO`; os demais com mitigação documentada e ticket com responsável e prazo.
3. Zero achado de segurança **crítico ou alto** em aberto (seção 18) e linter do Supabase sem erro.
4. Conciliação financeira sandbox (seção 11) e real controlada (seção 20) com diferença **R$ 0,00**.
5. Nenhum job de cron com execução duplicada ou falha silenciosa na última janela de 48h.
6. Backup recente **e** ensaio de restore concluído.
7. Domínio, SSL, SPF/DKIM/DMARC e webhooks (Asaas e Resend) validados em PROD.
8. Suite automatizada verde no commit de release (typecheck + vitest + build).
9. Feature flags da seção 3.2 confirmadas na posição correta em PROD.
10. Plano de rollback escrito e testado: reverter deploy do front, desligar flags, pausar crons e congelar saques.

**NO-GO automático:** qualquer divergência financeira, qualquer vazamento entre workspaces/usuários, impossibilidade de cadastro/login, entrega não realizada após pagamento, ou webhook processando eventos duplicados.

---

## 25. Gaps observáveis no código — HIPÓTESES A VALIDAR

> Nenhum item abaixo é afirmação de defeito. São observações de leitura do código no commit-base que **precisam de validação em execução**. Nenhum caso deste documento pode ser marcado `APROVADO` sem evidência real.

| ID | Hipótese | Onde observado | Como validar | Pri |
|---|---|---|---|---|
| H-01 | Não há distinção efetiva de permissões entre OWNER/ADMIN/MEMBER no dashboard do produtor | `ProtectedRoute` só checa sessão/workspace; nenhuma checagem de papel encontrada nas páginas | ON-018, ON-019, SEC-001 | P0 |
| H-02 | Não existe seletor de troca de workspace na UI | `WorkspaceProvider` expõe `currentWorkspace` único | ON-021, ON-022 | P2 |
| H-03 | `AdminRoute` depende de lista de e-mails no cliente (`src/lib/admin.ts`) além do `is_admin_user` no banco | `ADMIN_EMAILS` hardcoded no front | RT-099, SEC-046 | P0 |
| H-04 | Rotas `/circles/:slug/admin` e `/messages` renderizam `CircleFeed` no `App.tsx` | mapeamento de rotas | RT-077, RT-078 | P1 |
| H-05 | Migration do advisory lock em `ensure_producer_workspace_for` pode não estar aplicada em PROD | arquivo de migration gerado mas não aplicado nas execuções anteriores | AU-016, IF-019 | P0 |
| H-06 | Diversas Edge Functions com `verify_jwt=false` dependem exclusivamente de validação interna | `supabase/config.toml` | SEC-034, SEC-035, OP-002 | P0 |
| H-07 | `create-payment` e `tokenize-card` são públicas (`verify_jwt=false`) | config | CO-023, CO-024, SEC-038 | P0 |
| H-08 | Ausência de suite automatizada de RLS | `src/test/` não contém testes SQL de policies | toda a seção 18.1 | P0 |
| H-09 | Módulos com integração externa não homologada (AutoDM, WhatsApp, NFSe, Appointments) | pastas e páginas presentes, sem testes | seção 3.2 | P1 |
| H-10 | `create-asaas-account` continua no repositório apesar de depreciada | `supabase/functions/create-asaas-account` | IF-021 | P2 |
| H-11 | Funções de diagnóstico (`test-asaas`, `simulate-installments`) publicadas | config | IF-020 | P1 |
| H-12 | Fluxo de exclusão/exportação de dados (LGPD) não localizado no código | ausência de rota/serviço específico | SEC-048, SEC-049 | P0 |
| H-13 | Reconciliação depende de múltiplas funções (`reconcile-payments`, `reconcile-asaas`, `reconcile-subscriptions`) sem painel unificado de divergências | pastas de funções | FI-029, FI-030, AS-014 | P1 |
| H-14 | Lead Magnet v2 sob flag pode divergir do v1 em round-trip | `featureFlags`/`ProductEditor` | PR-005, PR-006, PR-007 | P1 |
| H-15 | Cobertura E2E de Circles é baixa comparada ao peso do módulo | `src/test/` | seção 14 | P0 |

---

### Como registrar execução

Para cada caso executado, preencher: **Responsável**, **Data**, **Status**, **Evidência (link)** e **Bug vinculado**. Recomenda-se espelhar este documento em planilha com as mesmas colunas e IDs, mantendo o Markdown como fonte canônica dos casos e a planilha como registro de execução.

**Total de casos catalogados:** 100 (rotas) + 50 (auth) + 22 (onboarding/planos) + 50 (produtos/curso) + 20 (loja) + 40 (checkout) + 40 (financeiro) + 20 (assinaturas) + 20 (afiliados) + 70 (Circles) + 20 (e-mail/leads) + 20 (integrações) + 12 (ops) + 54 (segurança) + 35 (não funcional) + 14 (financeiro real) + 22 (infra) = **609 itens verificáveis**.

---

## 26. Fechamento da revisão técnica da Onda 0 — 2026-08-11 (UTC)

**HEAD verificado:** `68f2afbd` ("Revisão RPC Security por sig"). Histórico confirmado contendo `529448c2` ("Corrigiu cron_runs e key rotas") e `68f2afbd`. Árvore de trabalho limpa no início da rodada.

### 26.1 Revisão das quatro Edge Functions pendentes (código revisado, NÃO publicado)

| Função | Verificação de código | Status |
|---|---|---|
| `create-asaas-account` | Kill-switch ativo: `OPTIONS` responde CORS e qualquer outro método retorna **410 `deprecated`** antes de qualquer chamada ao Asaas. Nenhum caminho cria subconta. Cabeçalho documenta a decisão de custódia + ledger interno. | APROVADO NO CÓDIGO · **AGUARDANDO AUTORIZAÇÃO DE DEPLOY** |
| `reconcile-asaas` | `startCronRun(req)` no início; `finish("FAILED", …)` no early-return de `ASAAS_API_KEY` ausente, `finish("SUCCESS", …)` com `duration_ms` no caminho felizes e `finish("FAILED", …)` no `catch`. Todos os caminhos de saída instrumentados. | APROVADO NO CÓDIGO · **AGUARDANDO AUTORIZAÇÃO DE DEPLOY** |
| `release-reserves` | `startCronRun` + `finish` em sucesso (com `summary`) e falha (com `duration_ms`). | APROVADO NO CÓDIGO · **AGUARDANDO AUTORIZAÇÃO DE DEPLOY** |
| `subscription-health-daily` | `startCronRun` + `finish("SUCCESS", { alerts })` / `finish("FAILED", …, err.message)`. | APROVADO NO CÓDIGO · **AGUARDANDO AUTORIZAÇÃO DE DEPLOY** |

Contrato de regressão que trava esse comportamento: `src/test/cron-audit-contract.test.ts` e `src/test/deprecated-functions-contract.test.ts` (verdes).

### 26.2 Revisão das duas migrations de RPC (preparadas, NÃO aplicadas)

| Arquivo | Conteúdo revisado | Status |
|---|---|---|
| `supabase/migrations/20260811052805_…sql` | Etapa 1: `REVOKE EXECUTE` por assinatura exata de `anon, authenticated` nas classes service/cron-only e trigger-only; `GRANT EXECUTE … TO service_role` explícito onde Edge Functions/cron dependem. Preserva RPCs de checkout anônimo e predicados de RLS. | REVISADO · **AGUARDANDO AUTORIZAÇÃO DE APLICAÇÃO** |
| `supabase/migrations/20260811052931_…sql` | Etapa 2 (necessária): as funções mantinham `GRANT EXECUTE` para `PUBLIC`, então a etapa 1 sozinha não surtia efeito — prova registrada em 21.2 (`cleanup_rate_limits` executável por anon, HTTP 204). Faz `REVOKE … FROM PUBLIC` por assinatura e reconcede só a `authenticated`/`service_role` conforme a classificação. | REVISADO · **AGUARDANDO AUTORIZAÇÃO DE APLICAÇÃO** |

Nenhuma migration foi aplicada nesta rodada. Nenhuma função foi publicada. Nenhum frontend foi publicado.

### 26.3 Baseline reexecutado no HEAD `68f2afbd`

| Verificação | Comando | Resultado |
|---|---|---|
| Typecheck | `tsgo --noEmit -p tsconfig.app.json` | 0 erros |
| Testes específicos da Onda 0 | `vitest run cron-audit-contract deprecated-functions-contract rpc-exposure-contract` | verdes |
| Suíte completa (antes da Onda 1) | `vitest run` | **36 arquivos / 360 testes** verdes |
| Suíte completa (depois da Onda 1) | `vitest run` | **37 arquivos / 394 testes** verdes |
| Build | `vite build` | OK (`built in ~13s`), sem segredo no bundle |

---

## 27. Onda 1 — Fundamentos: rotas, autenticação e onboarding — 2026-08-11 (UTC)

Método: testes automatizados, inspeção read-only de código/config e smoke HTTP no preview local. **Nenhum usuário criado, nenhum e-mail enviado, nenhum dado alterado, nenhuma migration aplicada, nenhum deploy.**

### 27.1 Achado P1 corrigido — open redirect no login do produtor

| Campo | Registro |
|---|---|
| ID | **RT-OPENREDIRECT / AU-REDIRECT** |
| Severidade | **P1** (phishing pós-login: sessão válida e usuário jogado em host externo) |
| Evidência (sanitizada) | `src/pages/Login.tsx` usava `searchParams.get("redirect")` cru em três pontos (redirecionamento de usuário já logado, pós-`signInWithPassword` e pós-`mfa.verify`) e passava direto para `navigate()`. Alvos protocolo-relativos (`//host-externo`) e com contrabarra saem do domínio. `src/pages/AuthCallback.tsx` filtrava apenas `startsWith("/")` + `//`, sem bloquear `\` nem limitar tamanho. `MemberLogin.tsx` e `VerifyEmail.tsx` já usavam o sanitizador. |
| Correção | Ambas as páginas passaram a usar `sanitizeReturnTarget()` (`src/lib/authVerification.ts`), único ponto de decisão do destino de retorno. Destino inválido cai no `resolveSmartRedirect` normal. |
| Regressão | `src/test/wave1-routes-auth-contract.test.ts` — 9 alvos hostis rejeitados (`//evil.com`, `///evil.com`, `https://evil.com`, `javascript:`, `/\evil.com`, `\\evil.com`, `evil.com`, `mailto:`, path > 512) + contrato de código que exige que as 4 páginas de auth não leiam `redirect` sem sanitizar. |
| Commit | Onda 1 (este diff) |
| Status | **APROVADO após correção** |

### 27.2 Casos executados

| ID | Caso | Pri | Status | Evidência (sanitizada) |
|---|---|---|---|---|
| RT-001 | Catch-all `path="*"` → NotFound registrado | P0 | APROVADO | `src/App.tsx` contém `path="*"`; contrato no teste da Onda 1 |
| RT-002 | Deep-link/reload de rotas públicas responde 200 (SPA fallback) | P0 | APROVADO | Smoke HTTP local: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password` → 200 |
| RT-003 | Rota inexistente é servida pelo SPA (200 + 404 client-side), não 502/erro de build | P1 | APROVADO | `/this-route-does-not-exist-404` → 200; `routes-smoke.test.tsx` renderiza NotFound |
| RT-004 | Rotas de criador sob `ProtectedRoute` (`/store/editor`, `/products/:id/course-builder`, `/billing/upgrade-flow`) | P0 | APROVADO | contrato de código no teste da Onda 1 |
| RT-005 | Área admin exige `ProtectedRoute` + `AdminRoute` aninhados | P0 | APROVADO | contrato de código; bloco `<ProtectedRoute><AdminRoute>` |
| RT-006 | `/login` permanece pública; `/onboarding` com `requireWorkspace={false}` | P1 | APROVADO | contrato de código |
| RT-007 | Open redirect via `?redirect=` | P1 | APROVADO após correção | ver 27.1 |
| AU-001 | Sem sessão → `/login` preservando origem (`state.from`) | P0 | APROVADO | `ProtectedRoute.tsx`; contrato |
| AU-002 | E-mail não confirmado → `/verify-email` | P0 | APROVADO | `ProtectedRoute.tsx`; contrato |
| AU-003 | Não redireciona para onboarding durante loading nem em `fetchError` de workspace (falso negativo por RLS) | P0 | APROVADO | guard `!workspaceLoading && !fetchError && !currentWorkspace` |
| AU-004 | `SIGNED_OUT` devolve ao `/login`; listener limpo no unmount (sem leak/loop de sessão) | P0 | APROVADO | `AuthProvider.tsx`; contrato |
| AU-005 | Rotas donas do próprio pós-login (`/join`, `/member/login`, `/auth/callback`, `/circles/:slug/about`) não sofrem navegação automática | P1 | APROVADO | `shouldSkipAutoRedirect`; contrato |
| AU-006 | Login/signup sem magic link e sem OTP do Supabase (só código próprio de 4 dígitos) | P0 | APROVADO | contrato: ausência de `signInWithOtp`/`magiclink` em `Login`, `MemberLogin`, `Signup`; `auth-email-code.test.tsx` verde |
| AU-007 | Login por e-mail+senha: sucesso, credencial inválida e sessão nula (por mock/contrato) | P0 | APROVADO | `src/test/auth.test.tsx` (8 testes) |
| AU-008 | MFA/TOTP: challenge → verify → destino sanitizado | P1 | APROVADO | leitura de `Login.tsx` + contrato de destino |
| AU-009 | Recuperação de senha: `resetPasswordForEmail` aponta para `${origin}/reset-password`; a rota exige contexto `recovery` e chama `updateUser` | P0 | APROVADO | contrato sobre `ForgotPassword.tsx` / `ResetPassword.tsx` |
| ON-001 | `MEMBER` nunca cai no dashboard de criador (destino `/circles`, `/member` ou `/circles/explore`) | P0 | APROVADO | `smartRedirect.ts` + `account-roles.test.tsx` |
| ON-002 | `PRODUCER` com workspace → `/dashboard`; sem workspace → `/onboarding` | P0 | APROVADO | `account-roles.test.tsx` |
| ON-003 | Conta legada sem `account_type` usa inferência pelas tabelas reais | P1 | APROVADO | `account-roles.test.tsx` |
| ON-004 | Conta híbrida (workspace + comunidade) não é tratada como consumidora | P0 | APROVADO | `isConsumerOnly` retorna false com workspace; contrato + teste |
| ON-005 | Consumidor em área de criador recebe `ProducerUpgradePrompt`, não o onboarding | P0 | APROVADO | `ProtectedRoute.tsx`; contrato |
| ON-006 | `nav intent` de comunidade tem prioridade máxima no destino pós-login | P1 | APROVADO | `account-roles.test.tsx` |
| ON-007 | `/onboarding` sai de cena quando o workspace já existe | P1 | APROVADO | `Onboarding.tsx`; contrato |

### 27.3 Bloqueados nesta rodada (exigem ação externa — não simulados)

| ID | Caso | Motivo do bloqueio | Ação externa |
|---|---|---|---|
| AU-E2E-01 | Signup real de produtor com recebimento do código de 4 dígitos na caixa de entrada | Exige criar usuário real e enviar e-mail | **EXT-009** |
| AU-E2E-02 | Recuperação de senha ponta a ponta (link real + troca de senha) | Exige caixa de e-mail real | **EXT-010** |
| AU-E2E-03 | Login com Google (OAuth real, consentimento no provedor) | Exige conta Google e domínio autorizado | **EXT-011** |
| AU-E2E-04 | Confirmação de que `ensure_producer_workspace` com advisory lock impede workspace duplicado sob concorrência | Migration ainda não aplicada | **EXT-012** (após autorização de aplicação) |
| RT-E2E-01 | Deep-link em domínio publicado (`kivohub.com.br`) após deploy | Publicação proibida nesta rodada | **EXT-013** |

### 27.4 Ações externas adicionais do Lucas (Onda 1)

| ID | Instrução exata | Painel/URL | Valor esperado | Risco | Como comprovar |
|---|---|---|---|---|---|
| EXT-009 | Criar uma conta de produtor de teste em ambiente DEV e confirmar o código de 4 dígitos recebido | Preview Kivo → `/signup` | Código chega em < 2 min, conta confirmada, destino `/onboarding` | Baixo (usuário de teste) | Print do fluxo com e-mail mascarado + `user_account_types.account_type = PRODUCER` |
| EXT-010 | Solicitar recuperação de senha para o usuário de teste e trocar a senha em `/reset-password` | Preview Kivo → `/forgot-password` | E-mail recebido, senha alterada, login novo funciona | Baixo | Print do formulário concluído + login posterior |
| EXT-011 | Executar login com Google no preview e no domínio publicado | Supabase → Auth → Providers | Retorno em `/auth/callback` e destino coerente com o papel | Médio (config de domínio) | Print do callback + URL final |
| EXT-012 | Autorizar a aplicação das duas migrations de RPC e da migration de advisory lock | Supabase → SQL/Migrations | `cron_secret` inacessível por anon; workspace único sob concorrência | **Alto** (permissões) | Reexecutar smoke anon: `rpc/cron_secret` → 404/403 |
| EXT-013 | Autorizar deploy das 4 Edge Functions revisadas e publicação do frontend | Lovable → Publish · Supabase → Functions | `create-asaas-account` → 410; jobs com `cron_runs` populado | Médio | Logs das funções + tabela `cron_runs` |

### 27.5 Contagens da Onda 1

- Casos executados: **23** (RT 7 · AU 9 · ON 7) — **23 APROVADOS**, sendo **1 aprovado após correção**.
- Casos **BLOQUEADOS** por dependência externa: **5** (AU-E2E-01..04, RT-E2E-01).
- Falhas P0 encontradas: **0**. Falhas P1 encontradas e corrigidas: **1** (open redirect).
- Testes: **394** verdes em **37** arquivos (+34 novos no contrato da Onda 1). Typecheck 0 erros. Build OK.
- Arquivos alterados: `src/pages/Login.tsx`, `src/pages/AuthCallback.tsx`, `src/test/wave1-routes-auth-contract.test.ts` (novo), este checklist.
- **AGUARDANDO AUTORIZAÇÃO DE DEPLOY:** 4 Edge Functions (`create-asaas-account`, `reconcile-asaas`, `release-reserves`, `subscription-health-daily`), 2 migrations de RPC, 1 migration de advisory lock, publicação do frontend.
- Próximo bloco recomendado: **Onda 2 — produtos, cursos e entrega (PR/CB)**, mantendo pagamentos fora de escopo.

## 28. Onda 2 — Produtos, cursos e entrega — 2026-08-11 (UTC)

### 28.1 Reconciliação de pendências da Onda 0

| ID | Item | Status | Evidência sanitizada |
|---|---|---|---|
| IF-021 | `create-asaas-account` implantada com kill-switch | APROVADO | Deploy autorizado pós-Onda 0; smoke `curl` → HTTP **410 Gone**, mensagem de depreciação. Nenhuma chamada externa. |
| IF-014 | `reconcile-asaas`, `release-reserves`, `subscription-health-daily` implantadas com auditoria `cron_runs` | APROVADO | Smoke com segredo inválido → HTTP **401**; logs `Unauthorized call`; `cron_runs` sem novas linhas de teste. Nenhum efeito financeiro. |
| SEC-060 | Migrations granulares de RPC (`20260811052805`, `20260811052931`) | APROVADO (aplicadas) | Verificado por leitura em `supabase_migrations.schema_migrations` + `pg_proc`/ACL. Advisor caiu 149 → 69. |
| AU-WS-LOCK | Advisory lock em `ensure_producer_workspace_for` | APROVADO (aplicada) | `pg_get_functiondef` contém `pg_advisory_xact_lock`; execução revogada de `anon`. |

### 28.2 Casos executados (Produtos)

| ID | Caso | Status | Evidência |
|---|---|---|---|
| PR-ISO-001 | Isolamento de produtos entre workspaces | APROVADO | `pg_policies.products`: leitura por `is_workspace_member(workspace_id)` OU (`status='PUBLISHED'` AND `is_storefront_visible` AND `deleted_at IS NULL`); escrita só admin/membro do workspace. |
| PR-PUB-001 | Publicação/despublicação e visibilidade na vitrine | APROVADO | Anon só alcança linhas publicadas e visíveis; rascunhos invisíveis por RLS. |
| PR-LIM-001 | Limite de produtos por plano | APROVADO | Triggers `enforce_plan_product_limit` / `..._on_restore` presentes e com execução revogada de `anon` (trigger-only). |
| PR-EDIT-001 | Autosave/draft do editor e round-trip de estado | APROVADO | Suíte `product-editor-*` (mappers, reducer, binding matrix, versioning, single-read-path) verde. |

### 28.3 Uploads, Storage e entrega — 3 falhas P0/P1 corrigidas

| ID | Caso | Status | Evidência / correção |
|---|---|---|---|
| ST-RLS-001 | Upload de entregável respeita RLS do bucket privado | **CORRIGIDO (era P0)** | Policy exige `(storage.foldername(name))[1] = auth.uid()`. `ProductDeliveryStep.tsx` subia em `deliveries/...` → falha total de upload. Agora `${user.id}/deliveries/...`. |
| ST-SIGN-001 | Entregável privado só acessível por URL assinada | **CORRIGIDO (era P0)** | Caminho salvo sem marcador `private-files/` fazia `isPrivateFileUrl` retornar false e o consumidor abrir URL crua (403). Marcador canônico gravado no save. |
| ST-IDOR-001 | Upload de mídia de aula não permite gravar fora do próprio prefixo | **CORRIGIDO (era P1)** | `course/LessonEditor.tsx` e `circle/LessonEditor.tsx` agora prefixam `${user.id}/` no bucket privado. |
| ST-SIGN-002 | Download pós-compra do produto digital | **CORRIGIDO (era P0)** | `OrderSuccess.tsx` chamava `window.open(downloadUrl)` cru. Agora assina via `getSignedPrivateUrl({ path, productId })` com estado de carregamento e toast de erro. |
| ST-SIGN-003 | Assinatura validada no servidor (entitlement + traversal) | APROVADO | `sign-private-file`: exige Bearer, `getClaims`, allowlist de caminhos derivada de `entitlements` com `revoked_at IS NULL`, rejeita `..`, expiração 300s. |
| ST-SIGN-004 | Consumidores de biblioteca/curso assinam mídia | APROVADO | `MemberLibrary.tsx` e `MemberCourse.tsx` usam `getSignedPrivateUrl`. |

### 28.4 Cursos — P0 de autorização (SQL preparada, NÃO aplicada)

| ID | Caso | Status | Evidência |
|---|---|---|---|
| CB-RLS-001 | RLS de `courses`/`course_modules`/`course_lessons` | APROVADO | Todas as operações condicionadas a `is_workspace_member(courses.workspace_id)`. |
| CB-REORDER-IDOR | Reordenação autorizada apenas para o dono do curso | **CORRIGIDO EM MIGRATION VERSIONADA — AGUARDANDO AUTORIZAÇÃO PARA APLICAR** | `pg_get_functiondef` mostrava `batch_reorder_lessons/modules` como `SECURITY DEFINER` fazendo `UPDATE ... WHERE id = ...` **sem checagem de dono** → escrita cross-tenant (contorna a RLS). Correção agora versionada em `supabase/migrations/20260811070000_batch_reorder_fail_closed_ownership_guard.sql` (Bloco A, ver 28.4.1). `docs/pending-sql/` eliminado. **Migration NÃO aplicada nesta rodada.** |
| CB-PROG-001 | Progresso, retomada, quiz e certificado | APROVADO | Suítes `course-builder.test.ts`, `course-builder-integration.test.tsx` verdes; certificados legíveis só pelo aluno (por e-mail do JWT) ou pelo workspace dono. |

#### 28.4.1 Bloco A — migration versionada, fail-closed e atômica (2026-08-11, HEAD `52bb8e6d`)

- **Arquivo**: `supabase/migrations/20260811070000_batch_reorder_fail_closed_ownership_guard.sql` (timestamp posterior ao HEAD; **não aplicada**, aguarda EXT-014). O SQL solto em `docs/pending-sql/` foi removido para não existir caminho de aplicação fora do versionamento.
- **Autenticação**: `auth.uid() IS NULL` → `EXCEPTION 28000`, antes de qualquer outra coisa.
- **Estrutura do payload**: exige array `jsonb`; cada item precisa ser objeto com as chaves `id` e `position` não nulas; casts estritos `::uuid` e `::int`; rejeita array vazio, ids duplicados e `position < 0` (`22023`).
- **Autorização total (fail-closed)**: compara `count(*)` do payload com `count(*)` dos ids que passam por `JOIN courses ... WHERE public.is_workspace_member(c.workspace_id)` — o **mesmo predicado das policies já vigentes** de `course_lessons`/`course_modules`, sem inventar papel novo. Divergência → `EXCEPTION 42501` ("unauthorized or unknown lesson/module in payload").
- **Sem subset silencioso**: payload misto (ids próprios + ids de outro workspace, ou id inexistente) aborta a chamada **antes** do `UPDATE`. Há exatamente **um** `UPDATE` por função, executado só após a checagem, e a função roda na transação da chamada — não existe reordenação parcial.
- **Sem tabela temporária**: a validação roda sobre o próprio payload, mantendo a função reentrante dentro de uma mesma transação.
- **Preservado**: `SECURITY DEFINER`, `SET search_path TO 'public'`, `CREATE OR REPLACE` (sem `DROP FUNCTION`, sem quebra de dependências) e nenhum `EXCEPTION WHEN` que engula erro.
- **Grants mínimos por assinatura exata**: `REVOKE EXECUTE` de `PUBLIC` e `anon`; `GRANT EXECUTE` apenas para `authenticated` e `service_role`, sempre com `(jsonb)` explícito.
- **Regressão**: `src/test/wave2-batch-reorder-guard-contract.test.ts` (**28 casos**) cobre payload misto, ausência de update parcial, ordem guard→update, validação de estrutura/uuid/position, `SECURITY DEFINER`/`search_path` e a matriz de grants por assinatura.
- **Baseline do Bloco A**: typecheck **0 erros**, Vitest **466 testes / 40 arquivos** verdes, build de produção OK. Nenhuma migration aplicada, nenhum deploy, nenhuma publicação, nenhuma ação externa executada.

### 28.5 Regressão adicionada

- `src/test/wave2-products-delivery-contract.test.ts` (15 casos): todo upload para `private-files` começa por `${user.id}/`, `getUser()` obrigatório antes do upload, marcador canônico gravado, `OrderSuccess` proibido de abrir URL crua, consumidores assinando, e contrato de segurança de `sign-private-file`.

### 28.6 Baseline da Onda 2

- Typecheck: **0 erros**.
- Vitest: **409 testes / 38 arquivos** verdes.
- Nenhuma migration aplicada, nenhuma Edge Function publicada, frontend não publicado nesta rodada.

### 28.7 Ações externas geradas

| ID | Instrução | Painel | Risco se ignorado |
|---|---|---|---|
| EXT-014 | Autorizar aplicação da migration `supabase/migrations/20260811070000_batch_reorder_fail_closed_ownership_guard.sql` (correção de IDOR na reordenação de módulos/aulas) | Lovable → migration tool | ALTO: usuário autenticado de outro workspace pode reordenar aulas de cursos alheios |
| EXT-015 | Autorizar publicação do frontend para que as correções de upload/assinatura de entrega cheguem a produção | Lovable → Publish | ALTO: hoje o upload de entregável de produto digital falha por RLS em produção |

---

## 29. Onda 2 — Revisão técnica complementar — 2026-08-11 (UTC)

| Campo | Valor |
|---|---|
| Commit-base da revisão | `52bb8e6d1f7e578f6010ea2a3a29828cd33b928e` |
| Escopo | Reabertura dos 5 achados da revisão. Sem deploy, sem publicação, sem migration aplicada, sem transação real. |

### 29.1 P0 CB-REORDER-IDOR — migration versionada, fail-closed e atômica

- SQL solto removido: `docs/pending-sql/` **não existe mais** (a pasta era um caminho paralelo ao versionamento e podia ser aplicada fora de ordem).
- Arquivo canônico: `supabase/migrations/20260811070000_batch_reorder_fail_closed_ownership_guard.sql` — **preparado, não aplicado** (aguarda EXT-014).
- Semântica **fail-closed**: a função valida o payload (array, `uuid` válido, `position >= 0`, sem ids duplicados), carrega os itens em tabela temporária `ON COMMIT DROP` e compara `count(*)` do payload com o `count(*)` dos itens que passam por `JOIN courses ... WHERE is_workspace_member(c.workspace_id)`. Se **um único** id for inexistente ou de outro workspace, levanta `EXCEPTION 42501` **antes** de qualquer `UPDATE`.
- **Atomicidade**: o `UPDATE ... FROM` é uma única instrução executada só após a autorização; como a função roda dentro da transação da chamada, qualquer exceção reverte tudo (não existe reordenação parcial).
- Predicado de autorização = `is_workspace_member`, exatamente o mesmo já vigente nas policies de `course_modules`/`course_lessons` — nenhum papel novo inventado.
- `anon`/`PUBLIC` sem `EXECUTE`; `authenticated` e `service_role` mantidos.

### 29.2 Entrega em `OrderSuccess` — o comprador convidado NÃO tem sessão (nenhum bypass criado)

| Pergunta | Resposta com evidência |
|---|---|
| O comprador convidado tem sessão ao cair em `/order/success/:id`? | **Não.** O checkout aceita compra sem login; nenhuma sessão é criada no sucesso. |
| Então a leitura do pedido funciona? | **Não.** A RLS de `orders` libera leitura apenas para o comprador autenticado (e-mail do JWT) ou para o workspace dono. Sem sessão, a query retorna vazio → a tela cai em "Pedido não encontrado". |
| Isso significa que a correção 401 quebrou o fluxo? | O fluxo de download por link cru **já estava quebrado** (403 do bucket privado). A correção não introduziu regressão: ela tornou o estado real explícito. |
| Como ficou | Sem sessão: tela "Entre para ver seu pedido" + CTA de login com `return_target` sanitizado para `/order/success/:id`. Com sessão e sem URL de arquivo visível (o `file_url` de `digital_assets` só é legível pelo workspace dono): CTA para `/member/library`, que resolve entitlement e gera URL assinada. |
| Bypass | **Nenhum.** `sign-private-file` continua exigindo `Authorization: Bearer` + `auth.getClaims(token)`; não foi criado token público, nem rota anônima, nem bucket público. |
| Pendência de produto (não de código) | Para o convidado receber o arquivo é preciso vincular a compra a uma identidade (criação de conta pós-compra por e-mail da ordem ou link assinado enviado por e-mail). Registrado como decisão de produto — fora do escopo desta revisão. |

### 29.3 Integridade em `CreateProduct` — fim do "publicado incompleto"

- Antes: `prices` e `subscription_plans` falhavam apenas com `console.error`, e `product_media`/`digital_assets`/`commission_rules` sem checagem alguma — o produto era criado já `PUBLISHED` e a UI dizia "publicado com sucesso" mesmo sem preço ou entregável.
- Agora: o produto **nasce sempre `DRAFT`**; dependências obrigatórias (`prices`, `subscription_plans` quando recorrente, `digital_assets` quando há arquivos) **lançam erro** e abortam a publicação; o `status = PUBLISHED` é um `UPDATE` posterior, só com o produto íntegro. Nada de toast de sucesso em caminho de falha.
- Dependências não essenciais (`product_media`, `commission_rules`) avisam via `toast.warning` e não bloqueiam.
- Regra nova: publicar `DIGITAL`/`LEAD_MAGNET` exige arquivo **ou** URL de entrega (`hasRequiredDelivery`), evitando produto vendável sem entrega.

### 29.4 Uploads — limite real, blocklist e cleanup de órfãos

| Item | Antes | Agora |
|---|---|---|
| Limite anunciado | "Até 2GB por arquivo" (falso) | `MAX_UPLOAD_LABEL` = **50 MB**, o limite global do projeto (nenhum bucket define `file_size_limit`) |
| Validação client-side | inexistente | `validateUploadFile`: nome válido, sem traversal/separadores, tamanho > 0, `<= 50 MB`, blocklist de extensão |
| Blocklist | inexistente | `BLOCKED_EXTENSIONS` cobre executáveis (`exe`, `msi`, `bat`, `sh`, `dll`…), scripts (`js`, `php`, `py`, `ps1`…) e ativos que executam no navegador (`html`, `svg`) |
| Nome do objeto | `Date.now()-file.name` cru | `safeObjectName()`: normalizado, sem caracteres hostis, stem limitado, sufixo único |
| Órfãos no bucket | remover da lista deixava o arquivo no storage | `removeFile` chama `storage.remove([path])` com `toStorageObjectPath`; o prefixo `auth.uid()` garante que ninguém apaga arquivo de terceiro |
| Input | mantinha o valor após erro | `e.target.value = ""` sempre, permitindo reenvio do mesmo arquivo |

### 29.5 Regressão comportamental adicionada

- `src/test/wave2-review-behavior.test.ts` (**29 casos**) exercita as funções puras — não só strings: fronteira exata de 50 MB, arquivo vazio, traversal, blocklist inteira iterada, case-insensitive, unicidade e sanitização de `safeObjectName`, extração de path para cleanup, matriz de `hasRequiredDelivery` por tipo, `buildLoginHref` com vetores hostis (`https://evil.com`, `//evil.com`, `javascript:`) e as garantias da migration de reorder.

### 29.6 Baseline da revisão

- Typecheck (`tsgo --noEmit`): **0 erros**.
- Vitest: **438 testes / 39 arquivos** verdes (era 409/38).
- Nenhuma migration aplicada, nenhuma Edge Function publicada, frontend não publicado.

### 29.7 Riscos residuais

| Risco | Severidade | Situação |
|---|---|---|
| Reordenação cross-tenant continua explorável em produção até EXT-014 | ALTO | Correção pronta e testada, aguardando autorização de migration |
| Comprador convidado não consegue baixar o entregável sem criar conta | MÉDIO | Decisão de produto pendente; nenhum bypass será criado |
| Limite de 50 MB pode ser pequeno para vídeo/curso pesado | MÉDIO | Elevar o limite no painel Supabase e atualizar `MAX_UPLOAD_BYTES` juntos (ação externa) |
| Órfãos anteriores à correção seguem no bucket | BAIXO | Varredura de limpeza a agendar depois do go-live |

---

## 30. Onda 3 — Checkout, Pagamentos, Assinaturas e Financeiro — 2026-08-11 (UTC)

**HEAD base:** `58e14d7e5d3d72edba431c5b8ce610bdc26b1336`
**Modo:** auditoria de código + testes de contrato. **Sem** deploy, publicação, migration aplicada, secret, criação de usuário, e-mail ou chamada real a Asaas/Resend/WhatsApp.
**Baseline de entrada:** 466 testes verdes / 40 arquivos. **Saída:** **570 testes verdes / 42 arquivos**, typecheck 0 erros, build OK (`built in 17.84s`).

### 30.1 Evidência automatizada
- `src/test/wave3-payments-financial-contract.test.ts` (**70 casos**) cobrindo CORS, rate limit, adulteração de payload, webhook, split, carteira, reembolso e saque.
- `src/test/wave3-refund-increment-behavior.test.ts` (**34 casos**) — testes **comportamentais** de reembolso com cliente Supabase falso: IN_PROGRESS sem efeito, primeiro parcial, segundo parcial cumulativo, replay de cada evento, dois IDs novos no mesmo payload, parcial→total, evento fora de ordem, over-refund, falha intermediária/reentrega e fechamento centavo a centavo.
- Comandos: `bunx vitest run src/test/wave3-refund-ledger-balance.test.ts` → 27/27; `bunx vitest run src/test/wave3-refund-increment-behavior.test.ts` → 34/34; `bunx vitest run src/test/wave3-payments-financial-contract.test.ts` → 70/70; suíte completa, `bunx tsgo --noEmit` e `bun run build` registrados em 30.6.

### 30.2 Achados corrigidos nesta rodada

| ID | Sev | Achado | Correção |
|---|---|---|---|
| FI-ASAAS-PROXY | **P0** | `test-asaas` aceitava `api_key`/`environment` do corpo, sem JWT e com CORS `*`: oráculo de validação de chaves Asaas roubadas e forçamento de `production`. | Reescrita: exige JWT + `is_admin_user`, usa somente `ASAAS_API_KEY`/`ASAAS_ENV` do ambiente, CORS restrito, nunca ecoa o corpo do gateway. |
| FI-REFUND-PARTIAL | **P0** | `handleRefunded` usava `paymentData.value` (valor da **cobrança**) como valor devolvido e cancelava a venda inteira no ledger: reembolso parcial zerava o pedido. | **Reaberto e re-corrigido** — ver FI-REFUND-V2. A correção anterior (soma de `refunds[]` + débito parcial) era **insuficiente**: as alegações de "resolvido" da rodada anterior ficam retificadas aqui. |
| FI-REFUND-V2 | **P0** | Revisão independente contra a doc oficial Asaas (Payment events): (a) `PAYMENT_PARTIALLY_REFUNDED` **não era tratado** no switch; (b) `PAYMENT_REFUND_IN_PROGRESS` (agendado/em processamento) já mexia em ledger/refunds; (c) o handler somava todo `refunds[]` mas persistia só o **primeiro id**, ignorando/duplicando históricos cumulativos; (d) parcial mantinha 100% de comissão/reserva/split e debitava só o produtor, que absorvia sozinho o reembolso. | Lógica extraída para `supabase/functions/_shared/refunds.ts`. Switch: `PAYMENT_REFUNDED` e `PAYMENT_PARTIALLY_REFUNDED` → reembolso **concluído**; `PAYMENT_REFUND_IN_PROGRESS` → **auditoria apenas**, zero escrita (provado em teste). O tipo vem do **eventType**, nunca de `payment.status`. Cada item de `refunds[]` é processado **por ID de gateway**, uma vez, com o **seu próprio valor**, comparado com o já persistido. Fail-closed: payload sem `refunds[]` com id+valor inequívocos → exceção → 500/retry, **sem** fallback ao valor da cobrança (inclusive no total). Acumulado, limites 0..cobrança, classificação de total (tolerância 1 centavo), reversão dos componentes e fechamento único (revogar acesso, cancelar comissão/reserva) acontecem **dentro** de uma RPC transacional. **Retificação:** a rodada anterior descrevia "reversão proporcional de gateway/plataforma/afiliado/produtor/reserva" — ver FI-REFUND-V3 para o que é reversão gravada de fato e o que era apenas cálculo sem efeito; o handler não faz nenhuma escrita direta. Erro em qualquer incremento propaga → webhook 500, **não** marca `PROCESSED`. |

**Migration versionada (NÃO aplicada):** `supabase/migrations/20260811074500_process_refund_increment_atomic.sql` — fonte **única**, agora no caminho canônico (as pastas intermediárias `docs/pending-migrations/` e `supabase/migrations-pending/` foram removidas). O timestamp é posterior ao último aplicado (`20260811070000`) e o arquivo permanece **não aplicado** nesta rodada. Conteúdo: guardas de pré-aplicação (aborta em duplicados `(order_id, gateway_refund_id)` e em divergência de tipo/unidade de `refunds.amount`, `payments.amount`, `wallet_ledger.amount`, `split_entries.creator_net`; exige `ux_wallet_ledger_order_type`), índice único parcial `(order_id, gateway_refund_id)` em `refunds` e RPC `process_refund_increment(uuid, uuid, text, integer, integer)` (`SECURITY DEFINER`, `search_path` fixo, `EXECUTE` só para `service_role`, `FOR UPDATE` no pedido, `RAISE` em over-refund/cobrança divergente/comissão paga/venda já cancelada). **Enquanto não aplicada, o fluxo de reembolso fica BLOQUEADO por desenho:** a RPC não existe, o handler recebe erro e o webhook devolve 500 para retry — nenhum reembolso é processado pela metade.

**Ordem de rollout (obrigatória):** aplicar a migration **primeiro**, deploy do `webhook-asaas` **depois**. A ordem inversa não corrompe nada (fail-closed), mas mantém reembolsos em retry.

| ID | Sev | Achado (revisão independente da RPC) | Correção |
|---|---|---|---|
| FI-REFUND-V3-LEDGER | **P0** | Transição parcial→total deixava saldo negativo: parciais criavam débito `available` e o fechamento total cancelava **só** a linha `sale`, então os débitos parciais continuavam contando. Venda 100 + parcial 30 + total 70 terminava em **−30** residual. | No fechamento, `sale` **e** `refund` vão juntos para `canceled` (ambos saem de `get_wallet_balance`). Teste comportamental prova `available/pending/total = 0/0/0`, sem resíduo. |
| FI-REFUND-V3-STAGE | **P0** | Débito do produtor entrava como `available` mesmo quando o crédito da venda ainda estava `pending`/retido, criando **saldo disponível negativo** antes da liberação. | O débito herda `status` e `available_at` da linha `sale`. Venda `pending` → refund `pending` com o mesmo `available_at`; o `release-holds` (que **não** filtra por `type`) libera crédito e reversão **juntos**. `sale` `canceled` → 55000 (reconciliação), nunca débito duplo. |
| FI-REFUND-V3-UNIQUE | **P0** | O desenho anterior pressupunha uma linha de ledger **por incremento**, mas `ux_wallet_ledger_order_type` = `UNIQUE (order_id, type) WHERE order_id IS NOT NULL` permite **uma única** linha `refund` por pedido: o 2º parcial falharia. | A linha única é atualizada por `UPSERT` com o valor **acumulado** (não o delta) — auto-corretivo e idempotente. Teste confirma exatamente 1 linha `refund` com o acumulado após dois parciais. |
| FI-REFUND-V3-DRIFT | **P0** | Base proporcional cumulativa era recalculada sobre colunas de `split_entries` **já reduzidas** por parciais anteriores, gerando drift (cobrança 199,90 com dois parciais de 66,63 debitava 88,84 em vez de 133,26). | Delta derivado do **remanescente** (`componente × valor_do_evento / cobrança_ainda_não_reembolsada`), e no total reverte o que resta. Débito acumulado = crédito original − fatia remanescente. Teste centavo a centavo fecha em 0. |
| FI-REFUND-V3-FICTICIA | P1 | A versão anterior calculava `v_gw_d`/`v_pf_d` e reportava gateway/plataforma como "revertidos" **sem gravar efeito nenhum** — reversão fictícia. | Leitura do schema real: **não existe** ledger de gateway/plataforma (`wallet_ledger_type_check` = sale/fee/refund/withdrawal/adjustment/chargeback) e a taxa do Asaas é uma única linha `type='fee'` negativa. O registro contábil real desses componentes é `split_entries`, consumido por `get_creator_balance`: o parcial **reduz as colunas** e o total marca `status='refunded'`. A linha `fee` **não** é estornada (o Asaas não devolve a própria taxa) — decisão documentada no SQL. O retorno da RPC traz `split_reversal.recorded_in` declarando onde cada reversão ficou (`split_entries.columns_reduced` / `split_entries.status=refunded` / `none:no_split_entry`). |
| FI-REFUND-V3-ATOM | P1 | Atomicidade alegada para o payload inteiro, quando cada RPC é uma transação por incremento. | Documentado no SQL e testado: falha no 2º incremento mantém o 1º aplicado e íntegro, webhook devolve 500 sem marcar `PROCESSED`, e o reenvio reconhece o 1º como `duplicate` e conclui só o 2º. |

**Unidades confirmadas por leitura do schema:** `payments.amount`, `orders.total_amount` e `refunds.amount` são `numeric` (**reais**); `wallet_ledger.amount` e `split_entries.*` são `integer` (**centavos**); `reserve_entries.amount` é `bigint` (centavos). A RPC converte explicitamente (`/100` ao gravar `refunds`, `round(amount*100)` ao ler) e a migration **aborta na aplicação** se qualquer um desses tipos mudar — um BRL-versus-centavos silencioso erraria por 100×.

**Duplicados pré-existentes:** consulta read-only em `public.refunds` retornou **0 linhas** (tabela vazia), logo o índice único não colide hoje; ainda assim a migration aborta com mensagem explícita se houver duplicados, em vez de escolher um registro.

**`ON CONFLICT` com índice parcial:** válido e já em produção neste banco — `process_order_commission` usa `ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL`, mesmo recurso que a RPC de refund infere nos dois upserts.

**`PAYMENT_REFUND_IN_PROGRESS`:** confirmado zero efeito (só log), coberto por teste que registra todas as escritas do cliente. **Id de evento:** a idempotência do webhook usa o `payload.id` de topo (id oficial do evento) com sufixo do tipo — `const rawEventId = payload?.id || paymentData?.id`, `externalEventId = \`${rawEventId}:${eventType}\``.

| CO-CORS-WILDCARD | P1 | `create-payment`, `tokenize-card`, `simulate-installments`, `check-payment-status` respondiam com `Access-Control-Allow-Origin: *`. | Todas passam a derivar CORS por requisição via `_shared/cors.ts` (`corsHeadersFor(req)`). |
| CO-NO-RATELIMIT | P1 | Endpoints públicos sem teto: fábrica de pedidos/cobranças e *card testing* / BIN enumeration. | `checkRateLimit` por IP: `create-payment` 10/min (aplicado **antes** de qualquer escrita), `tokenize-card` 5/min, `simulate-installments` 30/min; resposta 429 em PT-BR. |

### 30.3 Verificado sem defeito (evidência em teste)
- **Adulteração de checkout:** `workspace_id` derivado do produto; `price_id` obrigado a pertencer ao `product_id`; produto precisa estar `PUBLISHED` e não deletado; order bump validado contra `order_bumps` ativo do produto principal; valor/desconto nunca vêm do cliente; parcelas limitadas por `prices.max_installments`; pedido zerado bloqueado; PAN/CVV nunca trafegam (só `card_token`).
- **Idempotência e falha de gateway:** `idempotency_key` reaproveita pedido; erro de gateway → 502, pedido `FAILED` e cupom liberado.
- **Webhook Asaas:** fail-closed sem `ASAAS_WEBHOOK_TOKEN`; comparação em tempo constante → 401; chave de idempotência inclui o tipo do evento; `PROCESSED` → duplicate; `PAYMENT_MISMATCH`, `ALREADY_COMPLETED`, `TEST_IGNORED`; evento desconhecido sem efeito financeiro; `FAILED`/`DEAD_LETTER` com backoff e 500 para retry.
- **Split:** invariante `bruto = gateway + plataforma + afiliado + produtor` fecha ao centavo em 6 cenários; comissão maior que o líquido não gera `creator_net` negativo.
- **Carteira:** hold conta como `pending`; hold vencido migra sem alterar o total; saque/chargeback sempre debitam em módulo; `settled`/`canceled` não movem saldo.
- **Taxas e reserva:** boleto com taxa fixa em centavos; reserva de segurança **apenas** em cartão; `create-payment` não escreve em `wallet_ledger` (só a confirmação escreve); `split_entries` nasce `pending` com `available_at` nulo.
- **Paridade de desconto:** ordem subtotal → cupom → PIX idêntica no front (`src/lib/checkout-totals.ts`) e no back (`_shared/coupon.ts`); PIX nunca incide sobre o subtotal cheio.
- **Saque:** exige JWT (`verify_jwt = true`), workspace vem de `workspace_members`, só `OWNER`/`ADMIN`, conta bancária obrigada ao workspace, saldo recalculado no servidor pela regra compartilhada, mínimo por `fee_config`, `idempotency_key`.

### 30.4 Superfície morta / sem consumidor no frontend
- `test-asaas`: nenhum `supabase.functions.invoke("test-asaas")` no `src/`. Mantida como diagnóstico administrativo (agora fechada), não removida para não alterar contrato de deploy nesta rodada.

### 30.5 BLOQUEADO / EXT (exige ação externa do Lucas)
- **EXT-009** — E2E financeiro real (cartão aprovado/recusado, PIX pago, boleto, reembolso total e parcial, chargeback) em sandbox Asaas. Requer secret e transação real: fora do escopo autorizado.
- **EXT-010** — Configurar `ASAAS_WEBHOOK_TOKEN` no ambiente de homologação (já registrado na Onda 0); sem ele o webhook responde 500 por desenho.
- **EXT-011** — Deploy das funções alteradas nesta onda (`create-payment`, `tokenize-card`, `simulate-installments`, `check-payment-status`, `test-asaas`, `webhook-asaas` + novo módulo `_shared/refunds.ts`) — pendente de autorização explícita de produção.
- **EXT-013** — Aplicar `supabase/migrations/20260811074500_process_refund_increment_atomic.sql` (conteúdo integral, com esse nome). Ordem obrigatória: **migration primeiro**, deploy do `webhook-asaas` depois. Sem ela o reembolso é fail-closed (500/retry) e nada é processado pela metade.

---

## 31. Onda 4 — Carteira, ledger, reservas, saques e chargebacks — 2026-08-11 (UTC)

HEAD auditado: `794f33e58744eff2193d5e569d683c0df7ba5b73`
Modo: homologação sem deploy, sem migration aplicada, sem transação real.
Baseline: 622 testes verdes, typecheck limpo, build OK (15.97s).

### 31.1 Achados P0

| ID | Achado | Evidência | Status |
|----|--------|-----------|--------|
| P0-WA-01 | `public.get_wallet_balance` somava `amount` cru e contava `settled` como disponível. A migration `20260811033030` (hardening de RPC) sobrescreveu a regra canônica de `20260808072056`. Como `create-payout-request` grava o débito de saque com `amount` POSITIVO, **cada saque aumentava o saldo disponível** em vez de reduzi-lo; o mesmo valia para `fee`, `refund` e `chargeback`. | `pg_get_functiondef(get_wallet_balance)` vs `supabase/functions/_shared/wallet-balance.ts` | Corrigido na migration `20260811090000` (não aplicada) |
| P0-WA-02 | Duas convenções de sinal coexistindo: Edge Function gravava `withdrawal` positivo, `CashOutModal` gravava negativo. Qualquer soma estava errada em um dos caminhos. | `create-payout-request/index.ts` vs `CashOutModal.tsx` | Trigger `fn_wallet_ledger_normalize_sign` normaliza débitos para `abs()` |
| P0-WA-03 | `withdrawals` (legada) aceitava INSERT direto do cliente, sem validação de saldo, sem posse da conta bancária e sem processador — e o INSERT complementar em `wallet_ledger` era negado pela RLS, deixando saques fantasma sem débito. Nenhum job consome a tabela. | RLS: só `SELECT` em `wallet_ledger`; `withdrawals` tinha política de INSERT | Tabela vira somente leitura; front passa a chamar `create-payout-request` |
| P0-WA-04 | Criação de saque não transacional (`SELECT` saldo → `INSERT`): duas requisições concorrentes liam o mesmo saldo e criavam dois saques. | `create-payout-request/index.ts` (fluxo antigo) | RPC `create_payout_request_atomic` com `pg_advisory_xact_lock` + débito no mesmo commit |
| P0-WA-09 | Resolução de chargeback em `AdminChargebacks` era uma sequência de writes do cliente (`chargeback_cases` → `chargeback_timeline` → `split_entries` → `wallet_ledger`), sem atomicidade, sem checagem de admin no servidor, sem transição válida e barrada pela RLS. Pior: ao **ganhar** a disputa o fluxo restaurava o split e cancelava o débito, mas deixava o crédito da venda `canceled` (o webhook o cancela) e a reserva `forfeited` — o produtor vencia a disputa e continuava sem o dinheiro. | `AdminChargebacks.tsx` + `webhook-asaas` (handler de chargeback) | RPC `resolve_chargeback_case`: admin-only, advisory lock, idempotente por estado, devolve venda + split + reserva + transação |
| P0-WA-08 | `release-reserves` (diário 08:00) e `release-holds` (horário :40) disputavam as mesmas linhas de `reserve_entries`; só `release-holds` creditava o `wallet_ledger`. Quando `release-reserves` vencia a corrida, a reserva era marcada `released` **sem crédito** — o produtor perdia o valor. Pior: `security_reserves` nunca era creditada por ninguém. | `cron.job` + código das duas funções | `release-reserves` passa a cuidar só de `security_reserves`, com crédito idempotente por reserva |

### 31.2 Achados P1

| ID | Achado | Status |
|----|--------|--------|
| P1-WA-05 | Aprovar/rejeitar saque em `AdminRiskReview` era `UPDATE` direto do cliente, bloqueado pela RLS (`payout_requests` só tem política de `SELECT`): o botão era um no-op silencioso e nenhuma trava impedia o solicitante de aprovar o próprio saque. | RPC `review_payout_request` (admin, revisor ≠ solicitante, transições válidas, débito/estorno no ledger) |
| P1-WA-06 | `calculate_payout_risk` filtrava `payout_requests` por status inexistentes (`requested`, `paid`): a trava de velocidade nunca via os saques reais. | Corrigida para `pending/in_review/approved/processing/completed` |
| P1-WA-07 | `anon` com DML completo em `withdrawals`, `refunds`, `payout_items` e `chargeback_cases` (bloqueado apenas pela RLS, sem defesa em profundidade). | `REVOKE ALL` + `GRANT SELECT` a `authenticated`, `ALL` a `service_role` |

### 31.3 Itens BLOQUEADO/EXT (fora do escopo desta rodada)

- **EXT-WA-01** — Transferência real Asaas (`process-payouts`) exige credenciais e conta de homologação: E2E financeiro não executado.
- **EXT-WA-02** — Divergência de modelo: `withdrawals` (legada) x `payout_requests` (oficial). A migration desta onda congela a legada; a remoção definitiva da tabela fica para uma onda de limpeza.
- **EXT-WA-03** — A reserva de segurança (`security_reserves`) não é debitada do `wallet_ledger` no momento da venda, então o valor retido também aparece como disponível. Decisão de produto (retenção real x retenção informativa) pendente antes de mexer no crédito da venda.
- **EXT-WA-04** — O job `ops-alerts-every-5min` traz a anon key embutida no comando do `pg_cron`; migrar para `public.cron_invoke` como os demais.

### 31.4 Artefatos

- Migration **não aplicada**: `supabase/migrations/20260811090000_wave4_wallet_payout_hardening.sql`
- Testes: `src/test/wave4-wallet-payout-contract.test.ts` (31 casos)
- Código: `create-payout-request`, `release-reserves`, `CashOutModal.tsx`, `AdminRiskReview.tsx`, `AdminChargebacks.tsx`
- Pendência de rollout: aplicar a migration **antes** de fazer deploy das Edge Functions desta onda (a RPC precisa existir).

### 31.5 Hardening QA-4A-V2 (revisão do diff 794f33e..2c26bb8) — 2026-08-11 (UTC)

Sem deploy, sem migration aplicada, sem API externa, sem transação real.

| # | Achado da revisão | Correção | Status |
|---|---|---|---|
| 1 | `release-reserves` marcava `security_reserves='released'` e só depois inseria o crédito: falha no insert = reserva liberada sem dinheiro | RPC `release_security_reserve(uuid)` na migration canônica `20260811090000`: `FOR UPDATE`, valida `held`/vencimento/chargeback/refund, crédito idempotente + transição no MESMO commit, outcomes discriminados, `SECURITY DEFINER` com `search_path` fixo, `REVOKE` PUBLIC/anon/authenticated e `GRANT` só `service_role`. A Edge Function apenas chama a RPC | PASS (contrato+comportamento) / NEEDS_E2E (lock real) |
| 2 | Reserva podia ser creditada sem ter sido debitada na origem (inflação de saldo) | Evidência read-only: `security_reserves` **não tinha** coluna `order_id` (EF quebrava em runtime), `transaction_id` era NOT NULL, `COUNT(*)=0` reservas e `0` créditos de liberação; settlement credita `creator_net` integral. Migration adiciona `order_id`, `ledger_debit_id` (FK) e `wallet_ledger.security_reserve_id` + índice único parcial. Sem `ledger_debit_id` a RPC devolve `NEEDS_PRODUCT_DECISION` e **mantém retido** — não credita, não libera | NEEDS_PRODUCT_DECISION (segregar 10% no settlement é bloco próprio) |
| 3 | Divergência de commit: `AdminChargebacks.tsx` / `resolve_chargeback_case` reportados mas ausentes do diff | Ambos estão versionados na migration `20260811090000` (§9) e em `src/pages/AdminChargebacks.tsx`, cobertos por testes de contrato | PASS |
| 4 | `create_payout_request_atomic` / `review_payout_request` frouxas | `p_requested_by` revalidado como OWNER/ADMIN no banco (`REQUESTER_NOT_ALLOWED`); `p_fee >= 0` (`INVALID_FEE`) e `p_amount = p_fee + p_net_amount` (`AMOUNT_MISMATCH`); aprovação usa o MESMO `pg_advisory_xact_lock('payout:'||workspace)` e revalida saldo (`INSUFFICIENT_BALANCE`); idempotência por `wallet_ledger.payout_request_id` (FK) com índice único que **ignora** `canceled`; preflight fail-closed contra duplicidade histórica; `audit_logs` transacional em aprovação/rejeição/auto-aprovação | PASS (contrato) / NEEDS_E2E (concorrência real) |
| 5 | `GRANT SELECT` amplo podia permitir leitura cross-workspace | RLS confirmada ligada em `refunds`, `chargeback_cases`, `payout_items`, `security_reserves`, `wallet_ledger`, `payout_requests`, `withdrawals`; policies de SELECT escopadas por `workspace_members`. `payout_items` tinha policy `FOR ALL` para o role `public` → substituída por SELECT para `authenticated` via `is_workspace_member`. Nenhuma policy usa `auth.role()` | PASS |
| 6 | Testes só por regex | `src/test/wave4-reserve-release-behavior.test.ts` (25 casos, model-based): venda 100 / reserva 10 antes-durante-depois, hold sem disponível negativo, refund e chargeback antes da liberação, replay, dois workers, falha simulada de crédito | PASS |

Suíte: **653/653** ✓ · typecheck limpo ✓ · build ✓

Ordem de rollout (quando autorizado): (1) aplicar `20260811090000` (preflights abortam se houver duplicidade histórica); (2) deploy `release-reserves` e `create-payout-request`; (3) regenerar types; (4) decidir a segregação da reserva no settlement antes de qualquer crédito de liberação.

### 31.6 Hardening QA-4A-V3-LEDGER-PROOF (revisão do conteúdo real em `f492e879`) — 2026-08-11 (UTC)

Sem deploy, sem migration aplicada, sem chamada ao Asaas e sem transação real.

| # | Achado da revisão | Correção | Status |
|---|---|---|---|
| 1 | `release_security_reserve` aceitava como prova de segregação qualquer linha não cancelada do mesmo workspace (inflaria saldo) | Prova **estruturada** na migration canônica `20260811090000`: `wallet_ledger.reserve_role` (`segregation_debit` \| `release_credit`) com CHECK, FK `security_reserve_id`, índices únicos `uniq_wallet_ledger_reserve_segregation` / `uniq_wallet_ledger_reserve_release` e `uniq_security_reserves_ledger_debit` (um débito não prova duas reservas). A RPC exige: mesma reserva, papel `segregation_debit`, mesmo workspace, `abs(amount) = reserve.amount`, `currency='BRL'`, pedido compatível, tipo efetivamente devedor (`fee` ou `adjustment` negativo), status ≠ `canceled`/`settled`. Qualquer desvio → `NEEDS_PRODUCT_DECISION` mantendo `held` | PASS (contrato + comportamento) / NEEDS_E2E (índices sob concorrência real) |
| 2 | Antecipação de liquidez: liberava R$10 como `available` com venda/débito ainda `pending` até t=30 | O crédito herda o estágio econômico do débito: origem madura → `available`/`now()`; origem em hold → `pending` com o **mesmo** `available_at`; origem `pending` sem `available_at` → novo outcome `ORIGIN_NOT_LIQUID` mantendo `held`. Teste centavo a centavo: em t=20 `available=0`, `pending=100`; em t=30 `available=100` | PASS |
| 3 | `resolve_chargeback_case` podia devolver 2x | Equação real mapeada de `webhook-asaas/handleChargeback`: passo 6a `sale → canceled` (Δ −100) e 6b `chargeback → settled` (Δ 0, pois `settled` não entra em `get_wallet_balance` nem em `_shared/wallet-balance.ts`). Δ de abertura = −100 uma única vez ⇒ na vitória, restaurar a venda (+100) e cancelar o lançamento informativo converge ao saldo original **exatamente uma vez**. Restauração passou a preservar o estágio (`CASE WHEN available_at IS NULL THEN 'available' ELSE 'pending' END`, sem reescrever `available_at`) e é **suprimida** quando o pedido já tem `refunds.status='PROCESSED'` (`financial_reversal_skipped`) | PASS (model-based: aberto/perdido/ganho, replay, concorrência, hold, refund) / NEEDS_E2E (advisory lock real) |
| 4 | Migration não validada contra o schema real | Verificado read-only: `wallet_ledger.amount` `integer` (centavos), `currency`/`status` NOT NULL, checks de `status` (`pending\|available\|settled\|canceled`) e `type` (`sale\|fee\|refund\|withdrawal\|adjustment\|chargeback`), `chargeback_cases_status_check` (`new\|evidence_pending\|submitted\|won\|lost`), `security_reserves.transaction_id` NOT NULL (a migration o torna nullable) e **`ux_wallet_ledger_order_type UNIQUE (order_id, type) WHERE order_id IS NOT NULL`**. Consequência aplicada: o crédito de liberação **não grava `order_id`** (colidiria com outro `adjustment` do pedido e, sob `ON CONFLICT DO NOTHING`, liberaria a reserva sem crédito); o vínculo fica via `security_reserve_id → security_reserves.order_id`. `ON CONFLICT DO NOTHING` removido do crédito | PASS (schema versionado) / não aplicada em produção |
| 5 | Preservar correções v2 | RPC transacional de reserva, advisory locks de payout, chaves estruturadas (`payout_request_id`, `security_reserve_id`), `audit_logs` transacional e RLS/grants financeiros permanecem intactos e cobertos por teste | PASS |
| 6 | Decisão de produto da reserva real | Continua **bloqueada**: o settlement credita `creator_net` integral e não debita os 10%, logo nenhuma reserva real existe. Nenhuma política inventada; o caminho segue fail-closed | NEEDS_PRODUCT_DECISION |

Equações verificadas:

```text
abertura do chargeback : sale(canceled) = -100 ; chargeback(settled) = 0   → saldo 0
vitória                : sale(restaurado ao estágio) = +100 ; chargeback(canceled) = 0 → saldo 100
liberação de reserva   : debito(-10, estágio X) + credito(+10, estágio X) = 0 antes de X
                         venda 100 - reserva 10 = 90 disponível ; após liberação = 100
```

Testes: `src/test/wave4-reserve-release-behavior.test.ts` (50 casos, model-based + contrato) · suíte **678/678** ✓ · typecheck limpo ✓ · build ✓

Ordem de rollout (quando autorizado): (1) aplicar `20260811090000` — os preflights abortam com duplicidade histórica de crédito de liberação ou débito reutilizado; (2) deploy `release-reserves` e `create-payout-request`; (3) regenerar types; (4) só então decidir a segregação dos 10% no settlement — sem ela toda liberação permanece `NEEDS_PRODUCT_DECISION`.

### 31.7 Auditoria QA-4A-V4-RESERVE-ORIGIN (HEAD `8872d36f`) — 2026-08-11 (UTC)

Sem deploy, sem migration aplicada, sem Asaas/API externa, sem transação real. Verificação de schema/dados **somente read-only**.

**1) Fonte canônica da política (descoberta, não inventada)**

| Dimensão | Fonte canônica | Valor real em produção | Status |
|---|---|---|---|
| Percentual | `public.fee_config.reserve_percent` por `plan_type` | `creator = 10`, `creator_pro = 10` | PASS (inequívoco) |
| Janela de liberação | `public.fee_config.reserve_hold_days` | `creator = 30`, `creator_pro = 15` (D+N absoluto da venda) | PASS (inequívoco) |
| Elegibilidade | código de `create-payment` e `webhook-asaas` + memória do projeto | **somente cartão** (PIX/boleto sem reserva) | PASS (inequívoco) |
| Plano FREE | `fee_config` | **não existe linha `free`** → `reserve_percent` cai para `0` no código | NEEDS_PRODUCT_DECISION |
| **Base de cálculo** | conflito real entre caminhos | `security_reserves` usa `transactions.net_amount`; `reserve_entries` usa `split_entries.creator_net` | **FAIL / NEEDS_PRODUCT_DECISION** |
| **Modelo vigente** | conflito real | dois modelos coexistem (`security_reserves` e `reserve_entries`) | **FAIL / NEEDS_PRODUCT_DECISION** |

**2) Caminhos que criam crédito do produtor / reserva (mapeamento completo)**

| Caminho | O que grava | Achado |
|---|---|---|
| `create-payment` (pré-pagamento) | `split_entries` + `security_reserves` (base `net_amount`) | insere `order_id` em `security_reserves`, **coluna inexistente no schema aplicado** → insert falha |
| `webhook-asaas` bloco `transactions` | `security_reserves` (base `net_amount` final) | mesmo defeito de coluna; silenciado por `catch` "non-fatal" |
| `webhook-asaas` liquidação | `process_order_commission` (fonte única de `split_entries` + `wallet_ledger`) + `reserve_entries` (base `creator_net`) | `process_order_commission` **não** contém nenhuma referência a reserva (verificado via `pg_proc.prosrc`) → credita `creator_net` **integral** |
| `release-holds` (cron ativo) | liberava `reserve_entries` + inseria `adjustment` positivo | **P0: criação de dinheiro** — creditava 10% sem débito de origem |
| `release-reserves` (cron) | RPC `release_security_reserve` | já fail-closed desde o v3 (`NEEDS_PRODUCT_DECISION`) |
| `reconcile-asaas` / renovação de assinatura | reutilizam o mesmo webhook/RPC de liquidação | sem caminho alternativo de crédito |

**3) Evidência read-only (banco real, 2026-08-11)**

```text
fee_config                : creator 10%/30d · creator_pro 10%/15d
security_reserves         : 0 linhas · sem coluna order_id · sem ledger_debit_id
reserve_entries           : 1 linha  · amount=437 · reserve_percent=10 · held · release_at 2026-09-07
wallet_ledger (order 52d06af2) : sale +4850 pending (available_at D+14) · fee -140 settled
migration 20260811090000  : 0 colunas novas e 0 RPCs presentes → NÃO aplicada
```

Equação atual (P0 corrigido nesta rodada):

```text
origem      : sale = +4850           (creator_net INTEGRAL, nenhum débito de 437)
release-holds (antes) : + adjustment 437  → saldo 5287  = creator_net + 10%  (dinheiro inventado)
release-holds (agora) : nenhum crédito    → saldo 4850  = creator_net        (fail-closed)
modelo correto (após decisão) : sale 4850 - segregacao 437 = 4413 ; após liberação = 4850
```

**4) Correção aplicada (única, fail-closed, sem inventar política)**

`supabase/functions/release-holds/index.ts` deixou de creditar `wallet_ledger` na liberação de `reserve_entries`. Reservas vencidas permanecem `held`, a prorrogação por chargeback ativo é preservada, e o resumo do job passa a reportar `reserves_needs_product_decision`. Nada do bloco 1 (liberação normal de `wallet_ledger` pending vencido) foi alterado. Nenhuma alteração em `process_order_commission`, `create-payment`, `webhook-asaas` ou na migration canônica — corrigir a segregação exige a decisão de produto abaixo.

**5) Decisão que Lucas precisa tomar (bloqueia o encerramento do 4A-reserva)**

1. Modelo único: `security_reserves` (novo, com RPC atômica e prova estruturada) **ou** `reserve_entries` (legado, hoje o único com dados)? Manter os dois duplica reserva na mesma venda.
2. Base de cálculo dos 10%: `transactions.net_amount` (antes do split de afiliado/plataforma) **ou** `split_entries.creator_net` (o que é efetivamente creditado)? Só a segunda é segregável do saldo do produtor.
3. Plano FREE: criar linha em `fee_config` (`plan_type='free'`) ou aceitar 0% de reserva explicitamente?
4. Reservas legadas já vencidas (`reserve_entries` `held` sem débito de origem): liberar sem crédito (produtor perde 10%) ou reprocessar contabilmente com débito retroativo?

**6) Estado dos demais itens da Onda 4A (podem fechar sem essa decisão)**

| Item | Status |
|---|---|
| Saques: `create_payout_request_atomic` / `review_payout_request` (advisory lock, `p_amount = p_fee + p_net_amount`, revalidação de saldo na aprovação, `audit_logs` transacional, idempotência por `payout_request_id`) | PASS (contrato+comportamento) / NEEDS_E2E (lock e índices em banco real) · **pendente aplicar `20260811090000`** |
| RLS/grants financeiros (`payout_items` sem policy `FOR ALL`, `REVOKE` de `anon`, SELECT por workspace) | PASS no SQL versionado / NEEDS_E2E (isolamento cross-workspace em banco real) |
| Chargeback (`resolve_chargeback_case`, convergência única, guard de refund) | PASS (model-based) / NEEDS_E2E |
| Transferência real Asaas (payout efetivo) | EXTERNAL |
| Reserva de segurança ponta a ponta | **NEEDS_PRODUCT_DECISION** (fail-closed em `release-holds` e `release-reserves`) |

Testes: `src/test/wave4-reserve-origin-behavior.test.ts` (10 casos: origem integral, inflação detectada, fail-closed, modelo correto, hold sem antecipação, replay + 4 contratos do job).

Rollout: (1) decisão de produto dos itens 5.1–5.4; (2) migration de segregação na origem (`process_order_commission`) + `20260811090000`; (3) deploy de `release-holds`/`release-reserves`; (4) reprocessar reservas legadas.

### 31.8 QA-4A-V5-RESERVE-MODEL — decisão de produto aplicada (repo-only) — 2026-08-11 (UTC)

Base: HEAD `88cbc84a`. **Zero deploy, zero migration aplicada, zero chamada externa, zero movimentação financeira real.**

**Política aprovada e implementada no repositório**
- `public.reserve_entries` é a **única** fonte canônica. `public.security_reserves` fica **congelada**: histórico preservado, novas escritas bloqueadas por trigger fail-closed (`trg_security_reserves_frozen`), caminho de remoção documentado no header de `release-reserves`.
- Reserva = **10% de `split_entries.creator_net`**, em centavos, com arredondamento determinístico **para baixo**:
  - `reserve  = floor(creator_net * round(pct*100) / 10000)`
  - `available = creator_net - reserve`
  - ⇒ `available + reserve = creator_net` **exato**, inclusive em valores pequenos (`creator_net=5 → reserva 0`) e não divisíveis por 10 (`1007 → 100 + 907`).
- **FREE = 10% / 30 dias** por configuração explícita: `public.reserve_policy_for_workspace()` mapeia FREE e CREATOR → tier `creator`, CREATOR_PRO → `creator_pro`, e falha com `RESERVE_POLICY_DRIFT` se o `fee_config` divergir da política. Sem fallback implícito espalhado no código.
- Reserva legada (1 linha, `held`, sem débito de segregação) marcada `reconciled_legacy` com `reconciliation_note` auditável, **sem crédito e sem débito retroativo** (o produtor já recebeu 100%).

**Ciclo contábil ponta a ponta (RPCs transacionais)**
- `settle_order_reserve(order_id)`: cria/vincula `reserve_entries` a `order_id + split_entry_id + workspace_id` e grava o débito `segregation_debit` no `wallet_ledger` **no mesmo commit**. PIX/boleto ⇒ `NOT_APPLICABLE`.
- `release_reserve_entry(reserve_id)`: libera **uma única vez** após `release_at` (D+30/D+15), herda `status`/`available_at` do débito de origem (não antecipa liquidez), prorroga em chargeback ativo (`HELD_CHARGEBACK`), e devolve `NEEDS_PRODUCT_DECISION` para reservas sem débito (legado) — fail-closed.
- `reverse_reserve_entry(order_id, remaining_net, reason, final_status)`: refund parcial (recalcula a reserva sobre o líquido remanescente), refund total, chargeback perdido e cancelamento. Reversível também quando outro fluxo já marcou `forfeited/reversed` sem emitir crédito ⇒ **ordem dos eventos não importa**.
- `restore_reserve_entry(order_id)`: chargeback ganho devolve a reserva ao estado retido.
- Idempotência **estrutural**: `uniq_reserve_entries_order`, `uniq_reserve_entries_split_entry`, `uniq_wallet_ledger_reserve_entry_role (reserve_entry_id, reserve_role)`. Sem idempotência por texto.
- Locks em ordem estável (`orders → split_entries → reserve_entries → wallet_ledger`), `FOR UPDATE`, `search_path` fixo, `public.` qualificado, ownership/status/valores validados dentro da transação.
- Privilégios: todas as RPCs com `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role`. `reserve_entries` com RLS por workspace, `SELECT` para `authenticated`, DML só `service_role`.

**Caminho único de settlement (sem crédito de 100%)**
- `webhook-asaas`: bloco manual de reserva substituído por `settle_order_reserve` com **fail-closed** (`throw` em erro); caminho legado de `transactions` não escreve mais reserva; chargeback usa `reverse_reserve_entry`.
- `create-payment`: escrita em `security_reserves` **removida** (criava reserva sem débito de origem — causa raiz do P0 de criação de dinheiro).
- `_shared/refunds.ts`: após cada incremento, recalcula a reserva pelo `creator_net` remanescente (fail-closed).
- `release-holds`: reservas vencidas via `release_reserve_entry` (crédito atômico e idempotente).
- `release-reserves`: **deprecada**, somente leitura, `writes_performed: 0`, mantida no cron apenas para não quebrar o agendamento.
- Frontend (`Income.tsx`, `SecurityReservesSection.tsx`) e `get-wallet-balance` leem `reserve_entries`; saque usa apenas o disponível (reserva fica fora).

**Migrations (NÃO aplicadas)**
- `supabase/migrations/20260811100000_wave5_reserve_model_canonical.sql` (nova, canônica). Compatível com as pendentes da Onda 4 (`20260811074500`, `20260811090000`) via `ADD COLUMN IF NOT EXISTS`/`CREATE ... IF NOT EXISTS`. Nenhuma migration já aplicada foi modificada. Nenhum `*.tsbuildinfo`.

**Testes**
- `src/test/wave5-reserve-model.test.ts` — 60 casos: arredondamento/centavos, soma exata no settlement, release em 30d/antes do prazo/replay/concorrência, refund parcial e total antes e depois do release, chargeback perdido e ganho, eventos fora de ordem, IDOR/ownership, privilégios anon/authenticated negados, ausência de caminho ativo escrevendo `security_reserves` ou creditando `creator_net` integral, saque sem reserva.
- Testes das Ondas 3/4 atualizados para o modelo v5 (sem afrouxar garantias: escrita direta em tabela financeira continua proibida).
- Suíte completa: **748/748 PASS** (47 arquivos). Typecheck `tsgo --noEmit`: **limpo**. Build Vite: **OK (16.1s)**.

**Pendências / bloqueadores (explícitos)**
- ⏳ **Aplicação da migration `20260811100000` PENDENTE** — e ela depende de `20260811074500` e `20260811090000`, também **não aplicadas**. Enquanto não aplicada, as RPCs não existem em produção e o `webhook-asaas` novo falharia fechado no settlement: **aplicar migrations e só então deployar as Edge Functions**.
- ⏳ **Deploy PENDENTE** de `webhook-asaas`, `create-payment`, `release-holds`, `release-reserves` e do frontend.
- ⏳ Remoção física de `security_reserves` (DROP) fica para depois do período de retenção fiscal; remover também do agendamento `pg_cron` a função `release-reserves`.
- ⛔ **E2E financeiro real NÃO executado** (sem transação Asaas, sem dinheiro real). Nenhum item E2E externo marcado como aprovado.

### 31.9 — QA-4A-V6-RESERVE-ATOMICITY (repositório, NÃO aplicado)

Base efetiva: estado versionado que contém integralmente o V5 (wiring `9ff38535`).
Migration criada (NÃO aplicada): `supabase/migrations/20260811110000_wave6_reserve_atomicity.sql`.

P0 corrigidos:

1. **Reversão cumulativa (P0-1)** — `reverse_reserve_entry` grava o crédito
   ACUMULADO (`original_amount - reserva_alvo`), monotônico
   (`greatest(v_base - v_target, v_prev)`), nunca o delta isolado.
   Prova: reserva 100 → 80 → 60 ⇒ crédito acumulado 40, retido 60, sem centavo preso.
2. **Atomicidade do settlement (P0-2)** — nova RPC `settle_order_atomic(uuid, integer)`
   executa `process_order_commission` + `settle_order_reserve` no MESMO commit, sob
   `pg_advisory_xact_lock` por pedido. Qualquer desfecho estrutural inválido
   (`SPLIT_NOT_FOUND`, `OWNERSHIP_MISMATCH`, `SALE_LEDGER_MISSING`, `UNKNOWN`) levanta
   exceção ⇒ rollback integral. Não existe janela com `creator_net` integral disponível.
   Call sites migrados: `webhook-asaas` e `post-purchase` (caminhos reais de liquidação).
3. **Relógio do hold (P0-3)** — `reserve_entries.settled_at` passa a marcar o instante
   econômico do settlement; `release_at = settled_at + reserve_hold_days`.
   Removido o uso de `split_entries.created_at`.

Invariantes mantidos: `reserve = floor(creator_net * 1000 / 10000)`;
`available = creator_net - reserve`; `available + reserve = creator_net`;
FREE = 10% / 30 dias; `security_reserves` permanece congelada (sem fonte concorrente).

Segurança: todas as funções novas/alteradas com `search_path` fixo,
`REVOKE ALL ... FROM PUBLIC, anon, authenticated` e `GRANT EXECUTE ... TO service_role`.

Evidência desta rodada: suíte completa **789/789 PASS** (48 arquivos), incluindo
`src/test/wave6-reserve-atomicity.test.ts` (41 casos: arredondamento, 90/10,
30 dias desde `settled_at`, rollback, replay/concorrência, 100→80→60 ⇒ 40,
parcial→total ⇒ 0, refund/chargeback antes e depois do release, IDOR, privilégios).
Typecheck limpo; build Vite OK (16.18s).

Pendências honestas (NÃO executadas nesta rodada):
- Migration `20260811110000` **não aplicada**; deve ir junto/depois do deploy do código.
- Deploy das Edge Functions `webhook-asaas` e `post-purchase` pendente.
- E2E financeiro real (Asaas: pagamento, refund parcial/total, chargeback, saque)
  **NÃO executado** — permanece BLOQUEADO/EXT.
