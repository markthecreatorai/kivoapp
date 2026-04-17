# Paridade Stan × Kivo — Lead Magnet

> Documento de comparação funcional entre o fluxo de criação de **Lead Magnet** da Stan Store e o fluxo atual da Kivo (`CollectEmailsFlow`).
> **Escopo:** apenas o produto tipo *Coletar Emails / Aplicações* (`LEAD_MAGNET`).
> **Base de comparação Stan:** capturas em `/page/lead-magnet/create` (abas Thumbnail, Product, Options).
> **Base de comparação Kivo:** `/products/:id/edit` → `CollectEmailsFlow.tsx` (abas Visual, Conteúdo, Configuração).

---

## 1. Matriz detalhada de paridade

| # | Área | Comportamento Stan | Comportamento Kivo atual | Gap | Impacto | Ação técnica |
|---|---|---|---|---|---|---|
| 1 | **Estrutura de abas** | 3 abas: `Thumbnail` · `Product` · `Options` (ícones à esquerda, pill ativa em roxo) | 3 abas: `Visual` · `Conteúdo` · `Configuração` (ícones, layout `TabsList` cheio) | Nomenclatura e ordenação semântica diferentes — Stan separa **mídia/forma (Thumbnail)** + **entrega (Product)** + **automações (Options)**; Kivo mistura "form fields" e "delivery" e "email" todos na mesma aba `config`. | **P1** | Reorganizar `CollectEmailsFlow` em 3 abas alinhadas: **Thumbnail** (imagem + textos + form), **Product** (entrega: arquivo/URL), **Options** (drip + email confirmação). Manter rota e `formatId`. |
| 2 | **Aba 1 – Thumbnail (Stan): seleção de imagem com mini-preview lado a lado** | Card grande com thumbnail à esquerda + slot "Choose Image" à direita, mostrando dimensão recomendada (`400×400`). | Aba `Visual` mostra apenas um `Input` de URL e um preview opcional embaixo. **Não há upload nativo** — só link. | Falta upload direto + label de dimensão recomendada inline + slot visual unificado. | **P1** | Substituir `Input` URL puro por componente `ImageUploadField` (já existe em `course/`) e exibir badge `400×400` ou `1200×630`. Manter URL como fallback. |
| 3 | **Aba 1 – Stan: blocos numerados (1 Select image · 2 Add text · 3 Collect info)** | Steps numerados visualmente (círculos `1`, `2`, `3`) dentro da mesma aba — guia o usuário linearmente. | Sem numeração. Campos agrupados por subtítulos `<h2>`. | UX menos guiada para o creator iniciante. | **P2** | Adicionar componente `StepCard` (já existe em `editor/`) para numerar visualmente os 3 blocos da aba Thumbnail. |
| 4 | **Title / Subtitle / Button com contadores de caracteres** | Cada campo mostra `22/50`, `52/100`, `17/30` no canto superior direito do label. | Já implementado: `form.name.length/50`, `/100`, sem contador no botão. | Falta contador no campo "Texto do Botão" (`/30`). | **P2** | Adicionar `<p>{form.ctaText.length}/30</p>` ao bloco de CTA. |
| 5 | **Bloco "Collect info" (campos do formulário)** | "Basic info fields can't be edited" + Name/Email já bloqueados + botão **+ Add Field** com dropdown (`Phone`, `Text`, `Multiple choice`, `Dropdown`, `Checkboxes`). | "Campos base" + chips Nome/Email + `<FormFieldsBuilder>` para extras. | Tipos de campo extras não cobrem `Multiple choice`, `Dropdown`, `Checkboxes` (verificar `FormFieldsBuilder`). Falta UX de dropdown contextual no botão "Add Field". | **P0** | Auditar `FormFieldsBuilder.tsx`. Se não suportar, expandir tipos suportados (radio/select/checkbox). Adaptar UI para o padrão "+ Add Field → menu" do Stan. |
| 6 | **Aba 2 – Product (Stan): "Upload Attachment & Files" com toggle Upload File / Redirect to URL** | Toggle binário no topo direito, conteúdo abaixo muda. Pré-visualiza no mobile como "Open 1 URL → These will be delivered to your inbox". | Já existe (`form.deliveryType`: `url`/`file`) com 2 botões lado a lado. Upload de arquivo é placeholder (somente texto). | Funcionalmente alinhado, **mas upload de arquivo real não está implementado** (só mostra dropzone vazia). | **P0** | Implementar upload real para bucket `private-files/lead-magnets/{workspace_id}/...` com signed URL, seguindo o padrão de `course-asset-paths`. |
| 7 | **Aba 2 – preview do arquivo anexado dentro do mobile** | Após adicionar URL/arquivo, mostra "card" com nome do recurso clicável (`Get My FREE Guide Now!`). | Preview da aba `config` mostra apenas o formulário de captura, não a entrega. | Creator não vê preview do que o lead receberá. | **P1** | Adicionar variante de preview para a futura aba "Product" mostrando estado pós-submit (ícone arquivo + nome + CTA "Open"). |
| 8 | **Aba 3 – Options (Stan): "Email Flows" — Add Flow** | Card destacado com CTA roxo `+ Add Flow` (drip de boas-vindas, nutrição). | Card "Fluxos de E-mail Automáticos (Drip)" presente, **bloqueado com badge `Pro`** + grayscale. | Stan oferece drip aberto; Kivo gateia atrás de plano. Decisão de produto. | **P1** | Decisão estratégica: manter gating Pro **OU** liberar 1 fluxo no plano Free com limite. Recomenda-se **manter gating** (alinhado com `plan-limits-enforcement`) e melhorar copy do upsell. |
| 9 | **Aba 3 – Confirmation Email** | Subject com **chips inline** (`Product Name`, `My Username`) — variáveis renderizadas como pills clicáveis dentro do input. Body com toolbar rica (`H`, `B`, strike, italic, lista, imagem, link) + botão **Personalize** (insere variáveis). | Já existe (`confirmationSubject` + `RichTextEditor` com vars `nome_cliente`, `meu_nome`, `nome_produto`). Subject é texto livre, **sem chips inline**. | Subject não suporta inserção visual de variáveis. Variáveis disponíveis (3) são menos que Stan (2 nomeadas + customer name no body). | **P1** | Estender `Input` do subject para `RichTextEditor` em modo single-line OU criar componente `MergeTagInput` que aceita `{{nome_produto}}` e renderiza chips. |
| 10 | **Aba 3 – "Restore Default" inline em cada campo** | Link `Restore Default` no canto direito inferior do Subject e do Body. | Não existe. Creator não consegue resetar template. | Sem fallback rápido — risco de "perder" o template padrão. | **P2** | Adicionar `<button onClick={resetField}>Restaurar padrão</button>` ao Subject e Body, com defaults definidos no `CollectEmailsFlow`. |
| 11 | **Body padrão "Hi {Customer Name}! Here is your download for: {Product File(s)} - @{My Username}"** | Template padrão semântico, autoexplicativo. | Default genérico: `"Obrigado por se inscrever!"` | Template Kivo é pobre — não usa variáveis nem entrega o asset. | **P0** | Atualizar default para incluir `{{nome_cliente}}`, link/nome do arquivo, assinatura. Garantir que `send-lead-email` faça merge dessas variáveis. |
| 12 | **Footer: Save As Draft + Publish (sticky bottom-right)** | Dois botões à direita do footer: outline `Save As Draft` + primary `Publish`. | Footer com `Salvar Rascunho` (esquerda) + `Avançar` ou `Publicar Lead Magnet` (direita) — **avança aba a aba**. | Stan permite publicar de qualquer aba; Kivo força navegar até a última. | **P2** | Decidir: manter "wizard linear" (atual) OU exibir Publish global. Recomenda-se **manter linear** (alinha com `editor-ux-wizard`) mas habilitar Publish na primeira aba se já houver dados mínimos. |
| 13 | **Preview mobile contextual (muda por aba)** | Preview lateral fixo sempre mostra o estado final (form de captura completo). | **Preview já é contextual** — destaca o bloco editado em cada aba (ring). | Kivo é **superior**: melhor pedagogia visual. | — | **MANTER**. Não alterar. |
| 14 | **Header: breadcrumb "My Store / Add New Product" + URL pública à direita** | `← My Store / Add New Product` + `stan.store/marklucas` clicável. | Header da página atual depende do layout `DashboardLayout`. Sem breadcrumb ativo nem link público. | Falta navegação rápida + CTA "ver loja pública". | **P2** | Adicionar breadcrumb `Loja › Editar produto` + chip clicável `kivohub.com.br/{slug}` no topo do `ProductEditor.tsx`. |
| 15 | **"Improve this page" link discreto** | Link inferior direito acima do footer. | Não existe (canal de feedback é `FeedbackButton` global). | OK — Kivo já tem solução equivalente. | **P2** | Nada a fazer (cobertura via `FeedbackButton`). |
| 16 | **Tipo "Lead Magnet" como entrada do fluxo** | Stan trata como "Add New Product" → Lead Magnet (página única dedicada). | Kivo: `NewProduct.tsx` lista 5 formatos, "Coletar Emails / Aplicações" cria draft `LEAD_MAGNET` e redireciona pro editor. | Diferença arquitetural intencional (Kivo serve múltiplos formatos). | — | **MANTER**. |
| 17 | **Preço/Free badge no preview** | Não exibe badge "Grátis" no preview (o produto é implicitamente free). | Preview Kivo mostra badge verde "Grátis" na aba config. | Kivo é **mais explícito**, melhora confiança. | — | **MANTER**. |
| 18 | **Reviews/Depoimentos** | Não existe na Stan para Lead Magnet. | `ReviewsBuilder` presente na aba config. | Kivo é **superior**. | — | **MANTER** (feature exclusiva Kivo). |

---

## 2. Classificação consolidada de gaps

### 🔴 P0 — Bloqueia fidelidade funcional (sprint 1 obrigatório)
| Gap | Razão |
|---|---|
| **#5** Tipos extras de campo (radio/select/checkbox) no `FormFieldsBuilder` | Sem isso, o creator não consegue qualificar leads como na Stan. |
| **#6** Upload real de arquivo na entrega | Hoje só URL funciona; o "Upload File" é placeholder e quebra a promessa do Lead Magnet. |
| **#11** Template padrão do email de confirmação com variáveis e link do asset | Sem isso, o lead não recebe o entregável → Lead Magnet inútil. |

### 🟡 P1 — Diferença relevante de UX (sprint 1 desejável)
| Gap | Razão |
|---|---|
| **#1** Reorganização de abas (Thumbnail / Product / Options) | Aproxima fluxo mental ao da Stan, separa preocupações. |
| **#2** Upload de imagem nativa + dimensão recomendada | Reduz fricção do creator iniciante. |
| **#7** Preview do "pós-submit" (asset entregue) | Creator precisa visualizar o que o lead recebe. |
| **#8** Decisão sobre gating "Drip Flows Pro" | Definir se mantém Pro ou libera 1 flow no Free. |
| **#9** Subject + Body com chips de variáveis (`MergeTagInput`) | UX premium de email builder. |

### 🟢 P2 — Cosméticos / nice-to-have (sprint 2+)
| Gap | Razão |
|---|---|
| **#3** Steps numerados (1·2·3) na aba Thumbnail | Pedagogia visual. |
| **#4** Contador `/30` no botão CTA | Consistência. |
| **#10** "Restaurar padrão" inline em Subject/Body | Recuperação rápida. |
| **#12** Publish global no footer | Decisão de UX. |
| **#14** Breadcrumb + link da loja pública no header | Navegação. |

---

## 3. Lista de decisões

### ✅ Manter da Kivo (vantagens competitivas)
1. **Preview contextual com `ring` por aba** (#13) — melhor que Stan.
2. **Badge "Grátis" explícito** no preview (#17).
3. **`ReviewsBuilder`** integrado (#18) — Stan não tem.
4. **Wizard linear "Avançar → Avançar → Publicar"** (#12) — alinha com `editor-ux-wizard`.
5. **Múltiplos formatos no mesmo editor** via `formatId` (#16) — arquitetura escalável.
6. **`useLeadCapture` com Zod + idempotência + analytics** (já implementado).
7. **Theme tokens dinâmicos no preview** (`useStorefrontTheme`).

### 🔄 Alterar para emular Stan
1. Renomear/reagrupar abas para **Thumbnail / Produto / Opções** (#1).
2. Substituir `Input` URL de imagem por **`ImageUploadField`** (#2).
3. Implementar **upload real de arquivo** para `private-files/lead-magnets/` (#6).
4. Expandir `FormFieldsBuilder` com **radio / dropdown / checkbox** (#5).
5. Reescrever **template default do email de confirmação** com variáveis e link do asset (#11).
6. Adicionar **`MergeTagInput` (chips inline)** no Subject e melhorar `RichTextEditor` no Body (#9).
7. Adicionar **preview "pós-submit"** quando aba ativa for "Produto" (#7).

### 🚩 Feature-flag (decisão futura)
1. **`leadmagnet.drip_flows_in_free`** — liberar 1 drip no plano Free? (default: `false`, mantém gating Pro).
2. **`leadmagnet.publish_global`** — Publish disponível em qualquer aba? (default: `false`, mantém wizard).
3. **`leadmagnet.steps_numbered`** — exibir steps numerados visuais? (default: `true` após implementação).

---

## 4. Critério de aceite — Sprint 1 (Paridade Mínima Funcional)

A entrega da sprint 1 é considerada **aceita** quando todos os critérios abaixo passam:

### Funcional (P0)
- [ ] **Upload de arquivo real** funciona no slot "Enviar Arquivo" da aba Configuração (asset salvo em `private-files/lead-magnets/{workspace_id}/{product_id}/{filename}`, retorna signed URL com TTL de 7 dias).
- [ ] `FormFieldsBuilder` aceita **pelo menos 5 tipos**: `text`, `phone`, `radio` (multiple choice), `select` (dropdown), `checkbox`.
- [ ] Template default do email de confirmação contém:
  - Saudação com `{{nome_cliente}}`
  - Linha "Aqui está seu download:" com link do asset (URL ou arquivo)
  - Assinatura com nome do creator (`{{meu_nome}}`)
- [ ] `send-lead-email` faz merge correto das 3 variáveis e entrega o link do asset (testado E2E com lead real).

### UX (P1 desejáveis)
- [ ] Aba 1 renomeada e contém: imagem (com upload) + textos + formulário (3 blocos numerados visualmente).
- [ ] Aba 2 dedicada à entrega (Upload File / Redirect to URL).
- [ ] Aba 3 dedicada a Email confirmação + Drip (gated).
- [ ] Preview lateral mostra o **estado pós-submit** quando aba ativa for "Produto" (mostra arquivo/URL com ícone).
- [ ] Drip Flows mantém gating Pro **com copy refinado** (ex: "Desbloqueie sequências automáticas no plano Pro").

### Não-regressão
- [ ] Lead Magnets existentes (`metadata.format_id = 'collect_emails'` ou `lead_magnet`) continuam editáveis sem migração manual.
- [ ] Preview contextual (`ring` por aba) **continua funcionando**.
- [ ] `ReviewsBuilder` **continua disponível** (movido para a aba apropriada).
- [ ] Wizard linear "Avançar → Avançar → Publicar" preservado.

### Observabilidade
- [ ] Evento `LEAD_CAPTURED` continua sendo registrado em `analytics_events`.
- [ ] Asset entregue gera entrada em `asset_download_logs` se for arquivo (não URL).
- [ ] Erros de upload reportados via `reportAppError`.

---

## 5. Resumo executivo

| Métrica | Valor |
|---|---|
| Gaps totais identificados | **18** |
| P0 (bloqueantes) | **3** (#5, #6, #11) |
| P1 (UX relevante) | **5** (#1, #2, #7, #8, #9) |
| P2 (cosméticos) | **5** (#3, #4, #10, #12, #14) |
| Vantagens Kivo a manter | **7** itens |
| Decisões de feature-flag | **3** flags |

**Recomendação:** Sprint 1 deve focar nos **3 itens P0** + **#1 (reagrupamento de abas)** para entregar paridade funcional + alinhamento mental com Stan. Demais P1 e P2 podem ir para Sprint 2.
