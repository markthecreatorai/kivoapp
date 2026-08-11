# Kivo — Master Checklist de QA para Lançamento do MVP

## 1. Cabeçalho

| Campo | Valor |
|---|---|
| Commit-base | `68f2afbd` (HEAD na execução da Onda 1, 2026-08-11 UTC; inclui `529448c2` e `68f2afbd`) |
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
