
Diagnóstico fechado

Do I know what the issue is? Sim.

O problema real não é autenticação nem rota. O site publicado quebra antes de o React montar. A evidência é objetiva:

```text
TypeError: Cannot read properties of undefined (reading 'forwardRef')
at .../assets/vendor-ui-*.js
```

No preview funciona porque ele usa o dev server. No publicado, o bundle estático de produção está falhando no chunk `vendor-ui`. Hoje a app também não consegue mostrar fallback nesses casos porque:

- `src/main.tsx` importa `App` estaticamente, então um erro de avaliação de módulo acontece antes de instalar os handlers globais
- alguns guards ainda retornam `null`, então em travamentos de auth/workspace o DOM pode ficar visualmente vazio
- `ErrorBoundary` usa `process.env.NODE_ENV` em Vite, o que é frágil para fallback de erro

Plano de correção

1. Corrigir a causa do crash de produção
- Revisar `vite.config.ts`
- Remover/simplificar o `manualChunks` agressivo que separa `react`, `@radix-ui` e utilitários de UI em chunks forçados
- Deixar o Vite/Rollup montar o grafo normal, ou manter split só para libs realmente independentes (ex.: `zxcvbn`, editor, charts), sem quebrar a cadeia React/UI

Motivo:
o erro nasce no bundle publicado, e o ponto mais suspeito do projeto é exatamente a estratégia manual de chunking entre `vendor-react` e `vendor-ui`.

2. Blindar o bootstrap para nunca virar tela branca
- Alterar `src/main.tsx` para:
  - instalar handlers globais primeiro
  - fazer `import("./App")` dinamicamente
  - em qualquer falha de import/render inicial, montar fallback crítico imediatamente

Resultado esperado:
mesmo que um chunk falhe ou um módulo quebre na importação, o usuário verá UI de erro com ação de recarregar, e não root vazio.

3. Fortalecer os fallbacks de erro
- Ajustar `src/components/ErrorBoundary.tsx`
- Trocar `process.env.NODE_ENV` por `import.meta.env.DEV`
- Garantir que o fallback não dependa de nada que possa falhar junto com o app principal

4. Eliminar “blank states” silenciosos
- Ajustar `src/components/ProtectedRoute.tsx` para não retornar `null` durante loading
- Mostrar `PageSkeleton` ou fallback mínimo visível
- Revisar redirects/guards que hoje retornam `null` enquanto dados carregam, especialmente:
  - `ProtectedRoute`
  - `CircleSettingsRedirect`
  - `Onboarding` e outros fluxos onde a tela pode ficar vazia em estados intermediários

5. Validar antes de publicar
- Build de produção sem erro
- Preview renderizando conteúdo na `/`
- Publicado renderizando conteúdo na `/`
- Console do publicado sem `forwardRef` error
- Confirmar que o `#root` tem conteúdo visível
- Validar também uma rota protegida para garantir que a troca não regrediu auth/roteamento

Arquivos a alterar
- `vite.config.ts`
- `src/main.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/ProtectedRoute.tsx`
- possivelmente `src/App.tsx` e/ou componentes de redirect que ainda retornam `null`

Critério de aceite
- `https://kivostore.lovable.app/` abre com conteúdo visível
- erro `forwardRef` no chunk publicado desaparece
- em falha crítica, aparece UI de recuperação em vez de tela branca
- preview e publicado ficam consistentes
- autenticação e rotas continuam funcionando

Resumo técnico curto do que será corrigido
```text
1. Remover a causa do crash no bundle de produção (chunk split de UI/React)
2. Mover o bootstrap para import dinâmico protegido
3. Substituir retornos nulos por fallback visível
4. Garantir que erro crítico nunca resulte em root vazio
```
