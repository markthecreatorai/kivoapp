

# Plano: Reestruturar aba "Curso" para espelhar layout do Stan Store

## O que muda

A aba **3. Curso** atualmente mostra apenas a árvore de módulos/aulas. O Stan Store mostra duas seções numeradas:

```text
┌─────────────────────────────────────────────┐
│ 1  Course Homepage                          │
│    "Start by giving your course a title..." │
│  ┌──────┐  Homepage                         │
│  │ img  │  My 12-week Program    [Edit >]   │
│  └──────┘                                   │
├─────────────────────────────────────────────┤
│ 2  Add modules                              │
│    Module 1: Topic 1        ✓ Published  ⋮  │
│       Lesson 1: Overview                 >  │
│       Lesson 2: The Problem              >  │
│       [+ Add Lesson]                        │
│    Module 2: Introduction   ✓ Published  ⋮  │
│    [+ Add Module]                           │
└─────────────────────────────────────────────┘
```

Ao clicar **"Edit Page >"**, entra na sub-view com:
- Image upload (1920x1080)
- Title (max 100, counter)
- Description rich text
- Customize Branding (font, bg color, highlight color)
- Botões Cancel / Save

Ao clicar numa **aula**, entra no Lesson Editor existente (que já está correto — vídeo, título, descrição, materiais, Delete/Save as Draft/Publish).

O **preview mobile** (direita) deve aparecer na aba Course mostrando a homepage do curso (imagem + título + descrição + bullets), igual ao Stan.

## Mudanças

### Arquivo: `src/pages/editor/CourseFlow.tsx`

1. **ContentTab** ganha 3 sub-views controladas por estado `subView`:
   - `"main"` (padrão) — mostra as 2 seções (Homepage card + módulos tree)
   - `"editPage"` — editor completo da homepage (campos de imagem, título, descrição, branding com Cancel/Save)
   - `"lesson"` — CourseLessonEditor existente (sem mudança)

2. **Seção "Course Homepage"** (subView === "main"):
   - Card compacto com thumbnail do curso (miniatura), label "Homepage", título do curso, botão "Edit Page >"
   - Numeração visual `1` ao lado do título da seção

3. **Seção "Add Modules"** (subView === "main"):
   - Numeração visual `2`
   - Árvore de módulos/aulas existente permanece idêntica
   - Módulos mostram status badge (Published/Draft/Drip) + menu ⋮
   - Aulas mostram `>` chevron ao clicar (navega para lesson editor)
   - Botão `+ Add Lesson` dentro de cada módulo
   - Botão `+ Add Module` no final

4. **Sub-view "Edit Page"** (subView === "editPage"):
   - Header com `← Course Homepage`
   - Seção 1: "Page Description" — Image upload, Title (100 chars), Description rich text
   - Seção 2: "Customize Branding" — Title Font dropdown, Background color picker, Highlight color picker
   - Footer com Cancel (volta para main) e Save (salva e volta)
   - Usa `useAutosave` ou save explícito no botão

5. **MobilePreviewPanel**: Remover o `return null` para `tab === "course"` — em vez disso, mostrar o preview da homepage do curso (imagem, título com cor de destaque, descrição renderizada) igual ao Stan. Reutilizar o `CourseMobilePreview` existente.

### Detalhes visuais (alinhados com referência Stan)

- Seções numeradas com badge circular (`1`, `2`)
- Card da homepage com borda leve, thumbnail 80x60px à esquerda, texto à direita, botão "Edit Page >" à direita
- Módulos com drag handle (⋮⋮), título em negrito, badge de status verde/cinza
- Aulas indentadas com `>` chevron para navegação
- `+ Add Lesson` como botão outline full-width dentro do módulo
- `+ Add Module` como botão outline full-width no final
- Botões "Save As Draft" e "Publish" no footer do lesson editor (já existem)

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/editor/CourseFlow.tsx` | Reestruturar ContentTab com 3 sub-views; adicionar CourseHomepageCard e EditPageSubView; habilitar preview na aba Course |

