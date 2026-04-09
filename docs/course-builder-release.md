# Course Builder — Release Checklist & Rollout Plan

## Release Checklist (10 itens)

| # | Item | Verificação |
|---|---|---|
| 1 | Migrações SQL aplicadas sem erro | `supabase db push` sem falhas |
| 2 | RLS policies ativas | Tabelas `courses`, `course_modules`, `course_lessons`, `lesson_materials` com policies |
| 3 | Testes unitários passam | `npx vitest run src/test/course-builder.test.ts` |
| 4 | Testes de integração passam | `npx vitest run src/test/course-builder-integration.test.tsx` |
| 5 | Build sem erros TypeScript | `npx tsc --noEmit` limpo |
| 6 | Fluxo manual: criar curso → módulo → aula → publicar | Testado em staging |
| 7 | Reorder DnD persiste corretamente | Módulos e aulas mantêm posição após reload |
| 8 | Upload vídeo + material funciona | Upload para `private-files` bucket sem erro RLS |
| 9 | Preview mobile sem overflow | Conteúdo não ultrapassa moldura do celular |
| 10 | Telemetria funcionando | Eventos `course_builder_opened` e `course_publish_success` no analytics |

## Rollout Gradual

### Fase 1 — 10% (Semana 1)
- Feature flag: `useExperiment("course_builder_v2")` → variant B = novo builder
- Monitorar métricas diariamente
- Canal Slack dedicado para feedback

### Fase 2 — 50% (Semana 2)
- Alterar peso no banco `experiment_assignments`
- Verificar que métricas se mantêm

### Fase 3 — 100% (Semana 3)
- Remover feature flag
- Novo builder como padrão
- Deprecar builder antigo (CourseBuilder.tsx)

## Critérios de Rollback

| Critério | Threshold | Ação |
|---|---|---|
| Taxa de erro no publish | > 5% | Reverter para builder antigo |
| Aumento em tickets de suporte | > 20% vs baseline | Pausar rollout, investigar |
| Crash rate (ErrorBoundary) | > 1% | Rollback imediato |

### Procedimento de Rollback
1. Desativar variant B no banco (`UPDATE experiment_assignments SET variant = 'A'`)
2. Deploy sem alterações de código (flag routing cuida)
3. Post-mortem em 48h

## Métricas de Sucesso

| Métrica | Target |
|---|---|
| Cursos passam checklist na 1ª tentativa | > 90% |
| Tempo médio de criação completa | < 15 min |
| Taxa de publicação (drafts → published) | > 70% |
| NPS do builder | > 40 |

## Monitoramento Pós-Release

- Dashboard: filtrar eventos `course_builder_*` no analytics
- Alertas automáticos via `ops-alerts` edge function para error rate
- Review semanal de métricas nas primeiras 4 semanas
