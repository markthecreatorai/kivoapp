
Plano: auditoria e correção dos erros frequentes de navegação

Diagnóstico da auditoria
- A tela da imagem é o fallback do `ErrorBoundary` global (`src/components/ErrorBoundary.tsx`), então hoje qualquer erro de rota derruba o app inteiro.
- A causa mais provável e mais crítica está em `src/lib/lazyWithRetry.ts`: o código diz que faz retry com cache-busting, mas na prática só repete o mesmo `import()`; isso não resolve erro de chunk/preload após deploy e explica falhas durante navegação entre páginas lazy.
- `src/App.tsx` lazy-loada praticamente todas as rotas. Como existe só um boundary global, uma falha pontual numa página vira erro global.
- Há pontos frágeis em páginas públicas de loja (`src/pages/PublicStorefront.tsx` e preview/storefront components) com dados vindos do banco sem normalização defensiva; qualquer shape inesperado em JSON/campos opcionais pode explodir a renderização.

O que vou corrigir
1. Blindar erros de chunk/navegação
- Reescrever `lazyWithRetry` para:
  - detectar erro real de chunk/preload do Vite;
  - fazer no máximo 1 auto-reload controlado por `sessionStorage` para atualizar assets após deploy;
  - evitar loop infinito de reload;
  - registrar contexto completo no `reportAppError`.
- Expandir `src/lib/globalErrorHandlers.ts` para capturar também `vite:preloadError` e acionar a mesma estratégia de recuperação.

2. Parar de derrubar o app inteiro por erro local
- Em `src/App.tsx`, adicionar boundaries locais nos shells principais:
  - dashboard
  - admin
  - rotas públicas principais
  - círculos
- Resultado: se uma página falhar na navegação, a falha fica isolada naquele trecho, sem mandar o usuário para a tela global do app inteiro.
- Manter o boundary global apenas como última linha de defesa.

3. Endurecer páginas de navegação pública
- Revisar `src/pages/PublicStorefront.tsx` para normalizar com segurança:
  - `social_links`
  - `title`
  - URLs externas
  - blocos/configs opcionais
- Revisar `src/components/storefront/StoreProductPreviewRenderer.tsx` e `src/components/storefront/StorefrontPreview.tsx` para eliminar acessos inseguros a strings/objetos opcionais.
- Objetivo: dados incompletos ou antigos não podem quebrar a navegação.

4. Melhorar UX de recuperação
- Ajustar fallbacks locais para mostrar:
  - mensagem clara de “erro nesta página”
  - botão para tentar novamente
  - botão para voltar ao destino seguro anterior
- Evitar recarregar a aplicação inteira quando o erro for só da rota atual.

5. Telemetria e rastreabilidade
- Padronizar `reportAppError` com:
  - rota atual
  - contexto (lazy route, public storefront, shell, preload)
  - tipo do erro
- Isso ajuda a monitorar se o problema restante é chunk stale, dado inválido ou bug de render.

Arquivos-alvo
- `src/lib/lazyWithRetry.ts`
- `src/lib/globalErrorHandlers.ts`
- `src/App.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/pages/PublicStorefront.tsx`
- `src/components/storefront/StoreProductPreviewRenderer.tsx`
- `src/components/storefront/StorefrontPreview.tsx`

Validação planejada
- Navegar entre páginas lazy do dashboard sem cair no fallback global.
- Simular falha de import/chunk e confirmar:
  - no máximo 1 reload automático
  - sem loop
  - recovery visível
- Validar loja pública com campos nulos/parciais sem crash.
- Garantir que erro local continue sem tela branca e sem corromper a navegação.

Resultado esperado
- Queda drástica dos erros “Algo deu errado ao carregar o app” durante navegação.
- Sem tela branca.
- Falhas de rota isoladas e recuperáveis.
- Melhor resiliência após deploy e com dados imperfeitos no banco.
