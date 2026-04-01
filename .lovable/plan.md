

## Simplificar Classroom do Circles para padrão Skool

### Visão geral
Alinhar a experiência do Classroom com a Skool: sidebar limpa com pastas/páginas, menus contextuais claros, formulário de curso enxuto, e ações admin sem poluição.

### Alterações

**1. `src/pages/circle/CircleClassroom.tsx` — Sidebar e menus de módulo**
- Substituir os botões inline (Pencil, Plus, Trash2) no header do módulo por um **DropdownMenu** com as opções Skool:
  - "Editar pasta" (rename inline)
  - "Adicionar página na pasta"
  - "Duplicar pasta" (insere cópia do módulo + páginas filhas)
  - "Excluir pasta" (em vermelho, com confirmação)
- Adicionar chevron de collapse ao lado do "..." do módulo (já existe parcialmente)
- Manter o menu "..." do curso (topo da sidebar) com: "Adicionar página" e "Adicionar pasta"
- Remover mock courses (MOCK_COURSES) — exibir empty state diretamente

**2. `src/components/circle/CourseFormModal.tsx` — Formulário simplificado**
- Manter apenas campos essenciais visíveis: Nome, Descrição, Capa, Tipo de acesso, Published toggle
- Campos condicionais por modo de acesso permanecem (já estão bem feitos)
- Remover o campo `accessType` (free/premium) redundante — o `accessMode` já cobre isso
- Garantir que no modo edição todos os campos carregam os valores reais (já funciona via useEffect)

**3. `src/components/circle/CourseCardMenu.tsx` — Ações admin simplificadas**
- Manter: Editar, Duplicar, Excluir
- Adicionar: Arquivar (toggle `is_published`)
- Remover: Mover ←/→, Ver como membro, Compartilhar link (reduzir poluição)

**4. `src/pages/circle/CircleClassroom.tsx` — Grid de cursos**
- Remover lógica de mock courses e simplificar estado
- Manter cards com: capa, título, descrição, progresso, lock message
- Empty state limpo com CTA "Adicionar curso"

**5. `src/pages/circle/CircleClassroom.tsx` — Duplicar pasta (mutation)**
- Nova mutation `duplicateModuleMutation`: copia o módulo e todas as páginas filhas com título "(cópia)"

### Arquivos alterados
1. `src/pages/circle/CircleClassroom.tsx` — sidebar menus, remover mocks, duplicar pasta
2. `src/components/circle/CourseFormModal.tsx` — remover campo accessType redundante
3. `src/components/circle/CourseCardMenu.tsx` — simplificar ações (Editar, Duplicar, Arquivar, Excluir)

### Resultado
- Menus de pasta idênticos ao Skool (Edit/Add page/Duplicate/Delete)
- Formulário de curso mais enxuto
- Ações admin no card sem poluição
- Sem mock data — empty state direto
- Build sem erros

