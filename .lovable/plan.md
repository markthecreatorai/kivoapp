# Plano: Testes e Gate de Release do Course Builder

## 1. Testes unitários — `src/test/course-builder.test.ts`

Funções puras testáveis sem mocks de Supabase:

**`getCoursePublishChecklist`** — 6 cenários:
- Curso vazio → falha em title, modules, lessons, published-lessons (severity error)
- Curso completo → todos passam
- Título < 3 chars → falha apenas title
- Sem módulos → falha modules
- Sem aulas publicadas → falha published-lessons
- Sem preço → falha price (warning, não bloqueia)

**`useProductDraft`** (via `renderHook`):
- `updateField` marca dirty
- `updateFields` marca múltiplos dirty
- `markSaved` limpa dirty e seta lastSavedAt
- `reset` limpa tudo

**`MODULE_TEMPLATES`** — validação de estrutura:
- Todos têm key, label, moduleName, lessons[]
- Sem duplicatas de key

## 2. Testes de integração — `src/test/course-builder-integration.test.tsx`

Com mock de Supabase (padrão do projeto):

**Navegação entre abas:**
- Renderizar CourseFlow com MemoryRouter
- Verificar que 4 abas existem e clique alterna conteúdo

**Checklist bloqueia publicação:**
- Montar OptionsTab com curso incompleto
- Verificar botão "Publicar" desabilitado
- Verificar itens vermelhos visíveis

**Criação de módulo (mock optimistic):**
- Verificar que "Adicionar módulo" chama mutation
- Verificar que toast de sucesso aparece

## 3. E2E — Documentação (não implementação Playwright)

O projeto não tem Playwright configurado. Em vez de configurar infra E2E completa, criar **documentação de cenários E2E** como checklist manual + script futuro:

```
docs/course-builder-e2e-scenarios.md
```

## 4. Release checklist + Rollout — `docs/course-builder-release.md`

**Release Checklist (10 itens):**
1. Migrações SQL aplicadas sem erro
2. RLS policies ativas nas tabelas courses/modules/lessons/materials
3. Testes unitários passam (vitest)
4. Testes de integração passam
5. Build sem erros TypeScript
6. Fluxo manual: criar curso → módulo → aula → publicar
7. Fluxo manual: reorder módulos (DnD) persiste
8. Upload de vídeo + material funciona
9. Preview mobile sem overflow
10. Telemetria: eventos course_builder_opened e course_publish_success chegam

**Rollout gradual via feature flag (useExperiment):**
- Fase 1 (10%): `useExperiment("course_builder_v2")` → variant B = novo builder
- Fase 2 (50%): alterar peso no banco
- Fase 3 (100%): remover flag, novo builder como padrão

**Critérios de rollback:**
- Taxa de erro > 5% nos eventos de publish
- Aumento > 20% em tickets de suporte
- Crash rate do ErrorBoundary > 1%

**Métricas de sucesso:**
- 90%+ dos cursos criados passam no checklist na 1ª tentativa
- Tempo médio de criação < 15 min
- Taxa de publicação > 70% dos drafts

## Arquivos criados

| Arquivo | Conteúdo |
|---|---|
| `src/test/course-builder.test.ts` | Testes unitários: checklist, draft, templates |
| `src/test/course-builder-integration.test.tsx` | Testes de integração: tabs, publicação, CRUD |
| `docs/course-builder-release.md` | Release checklist, rollout, métricas, rollback |
| `docs/course-builder-e2e-scenarios.md` | Cenários E2E documentados para automação futura |

## O que NÃO muda

- Código de produção (CourseFlow, useCourseBuilder, etc.)
- Configuração de CI (já roda vitest via existente)
- Infra Playwright (fora do escopo — documentado para futuro)
