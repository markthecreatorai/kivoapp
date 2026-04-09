

# Plano: Corrigir conteúdo saindo da moldura do celular no preview

## Problema

Nos dois componentes de preview mobile (`CourseMobilePreview` e `LessonMobilePreview`), a tela interna usa `height: calc(100% + 12px)` com `-mt-3` para compensar o notch. Isso faz o conteúdo ultrapassar a borda inferior arredondada da moldura do celular. O `overflow-hidden` no container da tela deveria clipar, mas a combinação de altura extra com scroll interno causa o vazamento visual.

## Correção

**Ambos os arquivos:**
- `src/components/course/CourseMobilePreview.tsx`
- `src/components/course/LessonMobilePreview.tsx`

Mudanças:
1. Remover o `height: calc(100% + 12px)` e o `-mt-3` da div da tela
2. Usar `h-full` simples para a tela, com `pt-0` no conteúdo para não ter gap do notch
3. Garantir que o container externo (phone shell `p-3`) tenha `overflow-hidden` e o screen inner também tenha `overflow-hidden` com `rounded-[32px]`
4. Alternativa mais limpa: manter a estrutura mas trocar de `height: calc(100% + 12px)` para `h-full` e mover o notch para dentro da tela (posição absoluta), evitando o offset negativo

A abordagem será: remover o notch separado, usar o espaço do padding do phone shell normalmente, e garantir que a tela ocupe exatamente `h-full` sem ultrapassar.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/course/CourseMobilePreview.tsx` | Corrigir height/overflow da tela interna |
| `src/components/course/LessonMobilePreview.tsx` | Mesma correção |

