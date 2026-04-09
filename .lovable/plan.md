

# Plano: Course Builder — Estrutura base (arquitetura + dados)

## Situação atual

O projeto já possui:
- Tabela `member_content` (módulos/aulas vinculadas a `products`) usada pelo `CourseBuilder.tsx` existente
- Componentes `CourseSidebar` e `LessonEditor` em `src/components/course/`
- Rota `/products/:id/course-builder` funcional
- O `ProductEditor` com `formatId === "course"` cai no fallback "Editor em construção"

O usuário quer **novas tabelas dedicadas** com branding, drip content e materials, inspiradas no Stan Store.

## Decisão de design

Criar tabelas **novas e independentes** (`courses`, `course_modules`, `course_lessons`, `lesson_materials`) em vez de alterar `member_content`. Isso separa o course builder do sistema legado e permite branding, drip, e materials sem poluir a tabela existente. A tabela `courses` terá `workspace_id` (seguindo o padrão RLS do projeto) em vez de `user_id` puro.

## Migração SQL

```text
Tabela: courses
- id, workspace_id (FK workspace_members), product_id (FK products, nullable)
- title (varchar 100), description_richtext (text)
- hero_image_url, branding_title_font, branding_bg_color, branding_highlight_color
- status (draft/published), created_at, updated_at

Tabela: course_modules
- id, course_id (FK courses ON DELETE CASCADE)
- title (varchar 100), status (draft/published/drip)
- drip_type (none/date/days_after_purchase), drip_at, drip_days
- position (int default 0), created_at, updated_at

Tabela: course_lessons
- id, module_id (FK course_modules ON DELETE CASCADE)
- title (varchar 100), description_richtext (text)
- video_url, status (draft/published), position (int default 0)
- created_at, updated_at

Tabela: lesson_materials
- id, lesson_id (FK course_lessons ON DELETE CASCADE)
- file_name (varchar 255), file_url, file_type, file_size (bigint)
- created_at

RLS: Todas com isolamento por workspace_id via is_workspace_member()
Triggers: Validação de limites de caracteres em title (100 chars)
```

## Arquivos a criar/alterar

| Arquivo | Mudança |
|---|---|
| **Migration SQL** | Criar 4 tabelas, RLS policies, validation trigger |
| `src/hooks/useCourseBuilder.ts` | **Novo** — hook com queries/mutations CRUD para courses, modules, lessons, materials + reorder |
| `src/pages/editor/CourseFlow.tsx` | **Novo** — flow do editor de curso (tabs: Conteúdo, Branding, Configurações) |
| `src/pages/ProductEditor.tsx` | Adicionar case `"course"` no switch para renderizar `CourseFlow` |
| `src/pages/CourseBuilder.tsx` | Atualizar para usar novas tabelas em vez de `member_content` (ou redirecionar para o novo flow) |

## Hook `useCourseBuilder`

```text
- useCourse(courseId) — fetch curso com módulos e aulas
- useCreateCourse(workspaceId) — create com product_id opcional
- useUpdateCourse() — update campos do curso
- useModules(courseId) — listar módulos ordenados
- useCreateModule() / useUpdateModule() / useDeleteModule()
- useLessons(moduleId) — listar aulas ordenadas
- useCreateLesson() / useUpdateLesson() / useDeleteLesson()
- useReorderModules() — batch update de positions
- useReorderLessons() — batch update de positions
- useLessonMaterials(lessonId) — listar materiais
- useUploadMaterial() / useDeleteMaterial()
```

## RLS

Usa `is_workspace_member(workspace_id)` existente para SELECT/INSERT/UPDATE/DELETE em todas as 4 tabelas. Modules, lessons e materials herdam o workspace via JOIN com a tabela pai.

## Fluxo do usuário

1. Usuário cria produto tipo "course" → abre ProductEditor → renderiza `CourseFlow`
2. CourseFlow cria registro em `courses` vinculado ao `product_id`
3. Interface com sidebar de módulos/aulas + editor principal (similar ao existente mas com novas tabelas)
4. Branding e drip configuráveis por módulo

