

# Adicionar navegação completa para visitantes não-logados na landing de comunidade

## Problema
O header para visitantes não-logados mostra apenas o nome da comunidade + botão "Entrar", sem o dropdown de navegação (CommunitySwitcher). Na referência Skool, o visitante pode usar o dropdown para descobrir comunidades e criar uma nova.

## Causa raiz
O bloco de renderização para `!user && isAboutPage` (linhas 317-333 do `CircleLayout.tsx`) usa um header simplificado hardcoded, sem o `CommunitySwitcher`.

## Plano

### 1. Usar `CommunitySwitcher` no header de visitante (`CircleLayout.tsx`)
- Substituir o header hardcoded (ícone + nome) pelo componente `CommunitySwitcher` passando `currentCommunity={community}`
- Manter o botão "LOG IN" à direita

### 2. Ajustar `CommunitySwitcher` para funcionar sem auth (`CommunitySwitcher.tsx`)
- Quando `!user`: ocultar "Voltar para o workspace", ocultar lista de comunidades, ocultar botão de Settings
- Manter visíveis: campo de busca (desabilitado ou removido), "Criar comunidade" e "Descobrir comunidades"
- "Criar comunidade" sem login → redirecionar para `/onboarding` (signup + assinatura Kivo)
- "Descobrir comunidades" → `/circles/explore` (funciona sem auth)

### 3. Manter botão "Entrar" (LOG IN) no header
- Exibido à direita do header, igual ao atual, com redirect para login

### Arquivos alterados
1. `src/components/circle/CircleLayout.tsx` — trocar header hardcoded pelo `CommunitySwitcher`
2. `src/components/circle/CommunitySwitcher.tsx` — suportar modo não-autenticado (ocultar itens irrelevantes)

### Sem regressão
- Usuários logados não são afetados (o CommunitySwitcher já funciona normalmente para eles)
- Nenhuma mudança em rotas, queries ou lógica de autenticação

