

# Corrigir layout da landing page de comunidade para visitantes — estilo Skool

## Problema
Quando um usuário não logado acessa `/circles/{slug}`, é redirecionado para `/circles/{slug}/about` mas o layout renderizado (linhas 312-346 do `CircleLayout.tsx`) **não inclui o sidebar direito** com o card da comunidade. O resultado é uma página sem o card lateral com stats, admins e botão "Entrar no Grupo" — diferente do padrão Skool mostrado na referência.

## Causa raiz
O bloco de renderização para `!user && isAboutPage` (linha 312) usa um layout simplificado que renderiza apenas o `<Outlet />` sem o `CircleRightSidebarSkool`.

## Plano de correção

### 1. Adicionar sidebar no layout de visitante não-logado (`CircleLayout.tsx`)
- No bloco de renderização para `!user && isAboutPage` (linhas 312-346), adicionar `CircleRightSidebarSkool` no layout de duas colunas, igual ao layout principal (linhas 528-548)
- Passar `member={null}` para que o sidebar mostre o CTA de visitante ("Entrar no Grupo")
- Desktop: duas colunas (conteúdo + sidebar 340px)
- Mobile: sidebar aparece acima ou abaixo do conteúdo (coluna única)

### 2. Mesmo tratamento para usuário logado mas não-membro
- O bloco que rende about page para não-membros logados (linhas 398-403) já cai no layout principal que inclui sidebar — OK, nenhuma mudança necessária aqui.

### Arquivos alterados
- `src/components/circle/CircleLayout.tsx` — adicionar `CircleRightSidebarSkool` ao layout de visitante não-logado

### Sem regressão
- O sidebar já funciona com `member={null}` (linha 261-291 do sidebar mostra CTA de visitante)
- Nenhuma mudança em rotas, queries, ou lógica de autenticação

