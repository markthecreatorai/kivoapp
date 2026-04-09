

# Plano: Corrigir erro "Rendered fewer hooks than expected" no ContentTab

## Causa raiz

Na função `ContentTab` (linha 375), há um `return` condicional **antes** da chamada `useSensors` (linha 405). Quando `selectedLesson` é definido, o componente retorna cedo e pula os hooks `useSensors`/`useSensor`, violando a regra do React de que hooks devem ser chamados na mesma ordem em toda renderização.

## Correção

**Arquivo:** `src/pages/editor/CourseFlow.tsx`

Mover `useSensors` (linhas 405-408) para **antes** do `if (selectedLesson)` (linha 375) — junto com os demais hooks no topo do componente.

O bloco `if (selectedLesson) { return ... }` permanece no mesmo lugar, mas agora todos os hooks já foram chamados antes dele.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/editor/CourseFlow.tsx` | Mover `useSensors`/`useSensor` para antes do early return na linha 375 |

