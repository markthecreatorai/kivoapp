# Kivo — Master Checklist de QA para Lançamento do MVP

## 1. Cabeçalho

| Campo | Valor |
|---|---|
| Commit-base | `fa67aeab87287bb331d06a8fc3f2fa17ffcf5b91` |
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
