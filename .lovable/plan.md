

# Plano: Imagem padrão para capas de curso

## O que muda

Copiar a imagem enviada para `src/assets/default-course-cover.png` e usá-la como fallback em todos os locais onde a capa do curso aparece vazia (ícone cinza de imagem).

## Pontos de alteração

### 1. Copiar imagem
`user-uploads://image-21.png` → `src/assets/default-course-cover.png`

### 2. `src/pages/editor/CourseFlow.tsx`

Importar a imagem default e usá-la como fallback nos seguintes pontos:

- **ThumbnailTab init** (linha ~529): `useState(course.thumbnail_image || course.hero_image_url || DEFAULT_COVER)`
- **Preview do card thumbnail** (linha ~332-335): substituir o `<ImageIcon>` pelo `<img src={DEFAULT_COVER}>`
- **Course Homepage card** (linha ~1262-1265): substituir o `<ImageIcon>` pelo `<img src={DEFAULT_COVER}>`
- **EditPageSubView init** (linha ~1521): `useState(course.hero_image_url || DEFAULT_COVER)` — mas aqui o default NÃO deve ser salvo no banco automaticamente; só aparece visualmente
- **CheckoutTab init** (linha ~662): `useState(course.checkout_image || DEFAULT_COVER)`

**Regra importante**: O default é apenas visual. Ao salvar, se o valor for igual ao default, salvar como `null`/vazio para que o campo fique limpo no banco. O usuário pode trocar ou remover normalmente via `ImageUploadField`.

### 3. `src/components/course/ImageUploadField.tsx`

Adicionar prop opcional `defaultImage?: string`. Quando `value` é null/vazio e `defaultImage` está definido, mostrar a imagem default com um badge "Padrão" e os botões normais de trocar/remover.

### 4. `src/components/course/CourseMobilePreview.tsx`

Substituir fallback de ícone vazio pelo default cover quando `heroImageUrl` é null.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/assets/default-course-cover.png` | Criar — imagem padrão |
| `src/components/course/ImageUploadField.tsx` | Prop `defaultImage` para fallback visual |
| `src/pages/editor/CourseFlow.tsx` | Usar default cover em todos os placeholders vazios |
| `src/components/course/CourseMobilePreview.tsx` | Fallback de hero com imagem padrão |

