

# Auditoria e Correção de Responsividade — Classroom (Circles)

## Problemas Identificados

### 1. Detail View (sidebar + editor) completamente quebrado em mobile
- **Linha 510**: `w-72 lg:w-80` — sidebar fixa de 288px aparece em TODAS as telas, sem breakpoint mobile
- Layout `flex` horizontal (sidebar + editor) não colapsa em mobile — conteúdo fica espremido ou overflow horizontal
- Não existe mecanismo para esconder sidebar e mostrar só o conteúdo da aula em telas pequenas

### 2. Botão "Voltar" inexistente no detail view
- No mobile, ao entrar num curso, não há como voltar à lista de cursos sem o sidebar visível
- O nome do curso é um botão `truncate` que funciona como "voltar", mas fica escondido dentro do sidebar

### 3. Altura fixa inadequada
- **Linha 507**: `h-[calc(100vh-120px)]` — assume header de 120px, mas no mobile o bottom nav bar consome ~64px extras, causando conteúdo cortado

### 4. Toolbar do editor não responsiva
- Toolbar do Tiptap (LessonEditor) tem muitos botões inline sem wrap, causa overflow horizontal em telas estreitas

### 5. Course Cards grid OK mas detail view não tem transição mobile
- Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` está correto
- Mas ao clicar no curso, vai direto para layout de 2 painéis sem adaptação mobile

### 6. `confirm()` nativo usado em 3 locais (linhas 618, 657, 704)
- Viola regra do projeto (proibido native dialogs)

---

## Plano de Correção

### A. Mobile-first Detail View (CircleClassroom.tsx)
1. **Adicionar estado `showSidebar`** controlado por `useIsMobile()`
2. **Mobile**: mostrar apenas sidebar OU editor (toggle), com header fixo contendo botão voltar + nome do curso
3. **Desktop**: manter layout atual (sidebar + editor lado a lado)
4. **Ajustar altura**: usar `md:h-[calc(100vh-120px)] h-[calc(100vh-128px)]` para considerar bottom nav

### B. Mobile Lesson Navigation
1. Ao selecionar uma aula no mobile, auto-esconder sidebar e mostrar editor fullscreen
2. Adicionar botão "← Aulas" no topo do editor em mobile para voltar à sidebar
3. Transição suave entre os dois estados

### C. Toolbar do LessonEditor Responsiva
1. Wrap toolbar com `flex-wrap` em mobile
2. Agrupar ações menos usadas em dropdown no mobile

### D. Substituir `confirm()` por AlertDialog do shadcn/ui
1. Substituir os 3 usos de `confirm()` por componente de confirmação adequado

### E. Ajustes Finos de Espaçamento
1. Padding do editor `px-4 md:px-8` (já OK)
2. ScrollArea do sidebar: padding bottom extra no mobile para não ficar sob bottom nav
3. Course cards: garantir touch targets >= 44px

---

## Arquivos Alterados

1. **`src/pages/circle/CircleClassroom.tsx`** — reestruturar detail view com estado mobile/desktop, botão voltar, altura corrigida, remover `confirm()`
2. **`src/components/circle/LessonEditor.tsx`** — toolbar responsiva com flex-wrap

## Estimativa de Impacto
- Zero mudança em lógica de dados/queries
- Zero mudança em outros componentes do Circles
- Preserva toda a funcionalidade admin (drag-drop, menus, quiz)

