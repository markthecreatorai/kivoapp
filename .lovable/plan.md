
# Plano: Testes e Gate de Release do Course Builder

## 1. Testes unitários — `src/test/course-builder.test.ts`

Funções puras testáveis sem mocks de Supabase:

**`getCoursePublishChecklist`** (7 cenários):
- Curso completo → todos passam
- Curso vazio → falha em title, modules, lessons, published-lessons
- Título < 3 chars → falha title
- Sem módulos → falha modules
- Sem aulas publicadas → falha published-lessons
- Sem preço → falha price (severity warning)
- Sem thumbnail title → falha thumbnail (warning)

**`useProductDraft`** (via `renderHook`, 4 cenários):
- Inicia sem dirty
- `updateField` marca dirty + atualiza draft
- `markSaved` limpa dirty e seta lastSavedAt
- `reset` limpa tudo

**`MODULE_TEMPLATES`** (3 cenários):
- Todos têm key, label, moduleName, lessons
- Sem keys duplicadas
- Contém welcome, core, bonus

## 2. Testes de integração — `src/test/course-builder-integration.test.tsx`

Com mock de Supabase (padrão do projeto `vi.mock`):

- Curso incompleto bloqueia publicação (errors count ≥ 4)
- Curso completo não tem erros bloqueantes
- Tab order = thumbnail → checkout → course → options
- Navegação next/prev funciona corretamente
- Separação error vs warning: erros passam com conteúdo mínimo, warnings falham sem hero/price/thumbnail

## 3. Documentação E2E — `docs/course-builder-e2e-scenarios.md`

Cenários documentados para automação futura (Playwright não configurado no projeto):
- Fluxo completo: criar curso → módulo → aula → publicar
- Bloqueio por checklist incompleto
- Reorder módulo via DnD + persistência
- Upload de vídeo/material
- Erro de rede: reorder falha → rollback visual
- Preview mobile sem overflow

## 4. Release doc — `docs/course-builder-release.md`

**Release Checklist (10 itens):**
1. Migrações SQL aplicadas sem erro
2. RLS policies ativas em courses/modules/lessons/materials
3. Testes unitários passam (`vitest`)
4. Testes de integração passam
5. Build sem erros TypeScript
6. Fluxo manual: criar curso → módulo → aula → publicar
7. Reorder DnD persiste corretamente
8. Upload vídeo + material funciona
9. Preview mobile sem overflow
10. Telemetria: eventos `course_builder_opened` e `course_publish_success` chegam

**Rollout gradual (useExperiment):**
- 10%: `useExperiment("course_builder_v2")` variant B
- 50%: ajustar peso no banco
- 100%: remover flag

**Rollback criteria:**
- Erro rate publish > 5%
- Tickets suporte +20%
- ErrorBoundary crash > 1%

**Métricas de sucesso:**
- 90%+ cursos passam checklist na 1ª tentativa
- Tempo criação < 15 min
- Taxa publicação > 70% dos drafts

## Arquivos criados

| Arquivo | Conteúdo |
|---|---|
| `src/test/course-builder.test.ts` | 14 testes unitários |
| `src/test/course-builder-integration.test.tsx` | 5 testes de integração |
| `docs/course-builder-release.md` | Release checklist + rollout + rollback |
| `docs/course-builder-e2e-scenarios.md` | Cenários E2E documentados |

## O que NÃO muda
- Código de produção
- Configuração de CI existente
