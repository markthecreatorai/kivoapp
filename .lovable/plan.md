

# Plano: Aperfeiçoar aba Opções com blocos de crescimento e checklist robusto

## Situação atual

A `OptionsTab` tem 3 StepCards: Branding, Checklist, Status. Falta a seção de "Blocos de crescimento" e o checklist não valida no backend antes de publicar.

## Mudanças

### 1. Reestruturar OptionsTab em 4 StepCards

**Step 1 — Branding do curso** (existente, sem mudança funcional)
- Descrição curta, imagem hero, fonte do título, cores (fundo + destaque)

**Step 2 — Blocos de crescimento** (novo)
- 5 cards toggle (switch on/off) com ícone e descrição:
  - Reviews (exibir avaliações de alunos)
  - Email Flows (automação pós-compra)
  - Order Bump (oferta adicional no checkout)
  - Affiliate Share (permitir afiliados)
  - Confirmation Email (email de confirmação)
- Cada toggle salva no campo `growth_blocks` (JSONB) na tabela `courses`
- Cards desabilitados visualmente quando off, com badge "Em breve" para features não implementadas

**Step 3 — Checklist de publicação** (aprimorado)
- Manter checklist existente com ícones visuais (check verde, X vermelho, alerta amarelo)
- Adicionar itens: thumbnail preenchida, preço definido (se checkout ativo)
- Separar visualmente itens obrigatórios (bloqueiam) de recomendados (alerta)
- Exibir contagem: "5/7 itens completos"

**Step 4 — Status do curso** (aprimorado)
- Ao clicar "Publicar", validar checklist no frontend E confirmar no backend via `updateCourse` com flag `validate: true`
- Se backend retornar erro, exibir mensagem detalhada com os itens pendentes
- Atualizar badge de status instantaneamente com optimistic update + rollback em erro

### 2. Migração SQL — coluna `growth_blocks`

```sql
ALTER TABLE courses ADD COLUMN IF NOT EXISTS growth_blocks jsonb DEFAULT '{}';
```

### 3. Checklist expandido em `useCourseBuilder.ts`

Adicionar 2 novos itens ao `getCoursePublishChecklist`:
- `thumbnail`: thumbnail_title preenchido (severity: warning)
- `price`: checkout_price_cents > 0 (severity: warning)

### 4. Validação backend na publicação

Alterar `saveStatus2` para: ao publicar, enviar todos os dados do checklist junto. Se `updateCourse` falhar, exibir toast com mensagem detalhada do erro (ex: "Faltam: título do curso, pelo menos 1 aula publicada").

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| Nova migração SQL | Adicionar `growth_blocks` jsonb |
| `src/hooks/useCourseBuilder.ts` | Expandir interface Course + checklist com 2 itens novos |
| `src/pages/editor/CourseFlow.tsx` | OptionsTab com 4 StepCards; blocos de crescimento com toggles; publicação com feedback detalhado |

