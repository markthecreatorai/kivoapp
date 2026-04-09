

# Plano: Corrigir slider de templates "rodando sozinho"

## Causa raiz

Na `ThemeSection`, o `useEffect([theme])` (linha 544) recria o objeto `currentTheme` toda vez que a prop `theme` muda. O fluxo problemático:

1. Usuário seleciona template → `handleTemplateSelect` → `setCurrentTheme(novo)` + `onUpdate(novo)`
2. `onUpdate` → pai faz `setLocalTheme(novo)` → prop `theme` muda (nova referência)
3. `useEffect([theme])` dispara → `setCurrentTheme({...})` com novo objeto → re-render
4. Quando o `saveThemeMutation` completa, faz `localThemeDirty.current = false` + `invalidateQueries` → refetch do DB → `theme` query retorna dados (possivelmente com `template_key` anterior) → `useEffect` no Store (linha 819-821) seta `localTheme` para dados do DB (dirty já é false) → ThemeSection recebe prop atualizada → `useEffect` reseta `currentTheme` → slider pula

Além disso, `handleTemplateSelect` não é memoizado com `useCallback`, gerando nova referência a cada render.

## Correção

**Arquivo:** `src/components/storefront/ThemeSection.tsx`

1. No `useEffect([theme])`, guardar comparação: só chamar `setCurrentTheme` se os valores realmente mudaram (comparar `template_key`, cores, fontes) — evita re-renders espúrios
2. Envolver `handleTemplateSelect` em `useCallback`
3. Adicionar `key` estável no `CoverflowSlider` para evitar remontagem

**Arquivo:** `src/pages/Store.tsx`

4. No `onSuccess` do `saveThemeMutation` (linha 994-998), NÃO fazer `invalidateQueries` imediatamente — só marcar dirty como false. O `invalidateQueries` pode causar refetch que sobrescreve o estado local. Alternativa: atrasar o reset do dirty para depois do refetch completar, ou não invalidar se `localTheme` já está definido.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/storefront/ThemeSection.tsx` | Guard no useEffect para comparar valores antes de setar; useCallback no handleTemplateSelect |
| `src/pages/Store.tsx` | Remover invalidateQueries do onSuccess do saveThemeMutation (dados locais já são a fonte de verdade) |

