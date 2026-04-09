

# Plano: Polimento completo da experiência de edição de curso

## Visao geral

6 melhorias transversais no editor de curso: sticky bar com "Anterior", guard de saida, toasts padronizados, skeletons/loading, acessibilidade, e telemetria de eventos. Todas as mudancas se concentram em 3 arquivos.

## 1. Barra de acoes sticky — adicionar botao "Anterior"

**Arquivo:** `src/components/editor/WizardTabLayout.tsx`

- Adicionar prop `onPrev?: () => void` e `isFirstTab?: boolean`
- Renderizar botao "Anterior" (ChevronLeft) antes do "Proximo", desabilitado na primeira aba
- Loading spinner no botao "Publicar" quando `isSaving`

**Arquivo:** `src/pages/editor/CourseFlow.tsx` (CourseFlowInner)

- Criar `handlePrev` que navega para `tabOrder[idx - 1]`
- Passar `onPrev`, `isFirstTab={tab === "thumbnail"}` para WizardTabLayout

## 2. Guard de saida com alteracoes nao salvas

**Arquivo:** `src/pages/editor/CourseFlow.tsx`

- Adicionar `useEffect` com `window.addEventListener("beforeunload", ...)` que checa se `useAutosave` tem pendingRef ativo (expor `isDirty` do hook)
- Adicionar `useBlocker` do react-router para navegacao interna (ou `window.onbeforeunload` simples)
- Expor `isDirty` do `useAutosave` como propriedade retornada: `pendingRef.current !== null`
- Elevar `isDirty` ao `CourseFlowInner` agregando de cada tab via ref/callback (simplificacao: usar apenas o `beforeunload` global com flag no ref)

Abordagem simples: um `useEffect` no `CourseFlowInner` que registra `beforeunload` baseado em `updateCourse.isPending` ou um `isDirtyRef` compartilhado.

## 3. Toasts padronizados

**Arquivo:** `src/pages/editor/CourseFlow.tsx`

- Substituir todos os `toast.success/error` por helper padronizado com duracao e icones consistentes
- Criar funcao local `showToast(type, message, description?)` que mapeia para sonner com duracoes fixas: success=3s, error=5s, warning=4s
- Aplicar em: handleSaveDraft, handlePublish, CRUD de modulos/aulas, uploads, reorder

## 4. Estados de carregamento

**Arquivo:** `src/pages/editor/CourseFlow.tsx`

- No loading inicial (linha 104-110), substituir spinner simples por Skeleton layout (3 cards skeleton + tab skeleton)
- Nos botoes de acao da sticky bar, mostrar `Loader2` + texto "Salvando..." quando `isSaving`
- Nos botoes de CRUD de modulos/aulas, desabilitar e mostrar spinner durante mutacao

**Arquivo:** `src/components/editor/WizardTabLayout.tsx`

- O botao "Publicar curso" ja tem `disabled` mas nao mostra spinner — adicionar `Loader2` quando `isSaving && isLastTab`

## 5. Acessibilidade

**Arquivo:** `src/components/editor/WizardTabLayout.tsx`

- Adicionar `role="toolbar"` e `aria-label="Acoes do editor"` na barra sticky
- Adicionar `aria-label` nos botoes de acao

**Arquivo:** `src/pages/editor/CourseFlow.tsx`

- Nos botoes de estilo do card (ThumbnailTab), adicionar `role="radio"`, `aria-checked`, e wrapper com `role="radiogroup"`
- Adicionar `aria-label` nos botoes de grip (drag handle) dos modulos/aulas
- Adicionar `htmlFor` nos Labels que nao estao associados a inputs
- Focus ring ja e fornecido pelo Tailwind (focus-visible) — verificar que nenhum botao custom remove `focus-visible:ring`

**Arquivo:** `src/components/editor/StepCard.tsx`

- Adicionar `aria-label` com step number no circulo numerado

## 6. Telemetria de eventos

**Arquivo:** `src/pages/editor/CourseFlow.tsx`

Adicionar chamadas `trackEvent()` (importar de `@/lib/tracking`) nos seguintes pontos:

| Evento | Local |
|---|---|
| `course_builder_opened` | `useEffect` mount no `CourseFlowInner` |
| `course_builder_tab_switched` | `handleTabChange` |
| `course_draft_saved` | `handleSaveDraft` onSuccess |
| `course_publish_attempt` | `handlePublish` inicio |
| `course_publish_success` | `handlePublish` onSuccess |
| `course_publish_fail` | `handlePublish` onError |
| `course_module_reordered` | handler de DnD de modulos |
| `course_lesson_reordered` | handler de DnD de aulas |
| `course_upload_started` | inicio de upload de video/material |
| `course_upload_success` | sucesso de upload |
| `course_upload_fail` | erro de upload |

Para uploads no `CourseLessonEditor.tsx`, tambem adicionar tracking.

## Arquivos alterados

| Arquivo | Mudanca |
|---|---|
| `src/components/editor/WizardTabLayout.tsx` | Botao "Anterior", spinner no Publicar, aria-labels |
| `src/components/editor/StepCard.tsx` | aria-label no step circle |
| `src/pages/editor/CourseFlow.tsx` | Guard beforeunload, toasts padronizados, skeletons, acessibilidade em radio/grip, telemetria em todos os pontos |
| `src/components/course/CourseLessonEditor.tsx` | Telemetria de upload (started/success/fail) |

## O que NAO muda

- Logica de negocio (CRUD, autosave, reorder, checklist)
- Estrutura de abas e sub-views
- Preview mobile
- Outros flows de produto (Digital, Webinar, etc.)

