

# Plano: Alinhar cards da Discovery com altura uniforme

## Problema

Os cards têm alturas diferentes dependendo do conteúdo (descrição mais longa, categoria presente ou não), fazendo os botões ficarem em posições desalinhadas entre cards adjacentes.

## Solução

Tornar cada card um flex column com `h-full` e empurrar o botão para o fundo com `mt-auto`:

**Arquivo:** `src/pages/CommunityDiscovery.tsx`

1. No container externo do card (`<div onClick={...}>`): adicionar `flex flex-col h-full`
2. No `<div className="p-4">`: adicionar `flex flex-col flex-1`
3. Na descrição: manter `line-clamp-2` mas adicionar `flex-1` para ocupar espaço restante
4. No bloco de stats + botão: agrupar com `mt-auto` para ficarem sempre no fundo do card

Resultado: todos os cards na mesma row terão a mesma altura visual e botões perfeitamente alinhados.

