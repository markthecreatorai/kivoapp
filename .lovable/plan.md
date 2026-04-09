

# Plano: Elevar aba Curso para produção — batch reorder + robustez

## Situação atual

A aba Curso já tem:
- Step 1 (Course Homepage card) + Step 2 (módulos/aulas com DnD)
- Optimistic updates com rollback para rename, delete, status change
- Reorder com `arrayMove` + optimistic local state

**Problemas identificados:**
1. `useReorderModules` e `useReorderLessons` fazem N chamadas sequenciais (`for...of` loop) — não atômico, lento, e parcialmente falha deixa estado inconsistente
2. Sem ErrorBoundary local no ContentTab (só no lesson editor)
3. Expansão de módulos resetada ao receber dados do servidor (`useEffect` sobrescreve `localModules`)

## Mudanças

### 1. RPC batch reorder (migração SQL)

Criar duas funções PostgreSQL que recebem um array JSON e fazem UPDATE em transação única:

```sql
CREATE OR REPLACE FUNCTION batch_reorder_modules(items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE course_modules SET position = (item->>'position')::int
  FROM jsonb_array_elements(items) AS item
  WHERE course_modules.id = (item->>'id')::uuid;
END;$$;

CREATE OR REPLACE FUNCTION batch_reorder_lessons(items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE course_lessons SET position = (item->>'position')::int
  FROM jsonb_array_elements(items) AS item
  WHERE course_lessons.id = (item->>'id')::uuid;
END;$$;
```

### 2. `useCourseBuilder.ts` — usar RPC em vez de loop

Alterar `useReorderModules` e `useReorderLessons` para chamar `supabase.rpc('batch_reorder_modules', { items })` em uma única chamada.

### 3. `CourseFlow.tsx` — ErrorBoundary no ContentTab

Envolver o retorno principal do ContentTab (main view) com `<ErrorBoundary>` com fallback amigável e botão de retry, assim como já existe no lesson editor (linha 973).

### 4. Estabilidade do estado local

Ajustar os `useEffect` nas linhas 935-936 para preservar a ordem local durante reorder pendente (flag `isReordering` ref que bloqueia sobrescrita do server enquanto a mutation está in-flight).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| Nova migração SQL | 2 funções RPC: `batch_reorder_modules`, `batch_reorder_lessons` |
| `src/hooks/useCourseBuilder.ts` | Reorder hooks usam `rpc()` em vez de loop |
| `src/pages/editor/CourseFlow.tsx` | ErrorBoundary no ContentTab main view; flag anti-overwrite durante reorder |

## O que NÃO muda

- Lógica de CRUD (create/update/delete módulos e aulas) — já tem optimistic + rollback
- Sub-views (editPage, lesson)
- Drag-and-drop UI (DndKit sensors, SortableItem)
- Templates e checklist

