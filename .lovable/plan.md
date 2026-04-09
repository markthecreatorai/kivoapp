

# Plano: Alinhar Course Builder com stack de dados e padrão de abas

## Situação atual

O `CourseFlow` usa abas **Homepage / Conteúdo / Configurações**, diferente do padrão dos outros produtos (Digital, Webinar, etc.) que usam **Thumbnail / Checkout / Produto / Opções**. Faltam campos para `thumbnail` (style, image, title, subtitle) e `checkout_page` (image, title, description) no banco e na interface.

## Mudanças

### 1. Migração SQL — adicionar colunas à tabela `courses`

```sql
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_style text DEFAULT 'preview';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_image text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_title text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_subtitle text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS checkout_image text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS checkout_title text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS checkout_description text;
```

### 2. Atualizar tipos TS — `useCourseBuilder.ts`

Adicionar os 7 novos campos à interface `Course`.

### 3. Reestruturar abas do `CourseFlow.tsx`

Trocar as abas de **Homepage / Conteúdo / Configurações** para:

```text
┌─────────────┬──────────┬──────────┬──────────┐
│ 1. Thumbnail│ 2. Check.│ 3. Course│ 4. Opções│
└─────────────┴──────────┴──────────┴──────────┘
```

- **Thumbnail**: estilo do card (callout/preview), imagem, título, subtítulo, CTA — seguindo o mesmo padrão de `DigitalProductFlow`. Preview mobile do card ao lado.
- **Checkout**: imagem da página de checkout, título, descrição, preço (integrar com `products.prices`). Preview da página de compra.
- **Course**: o conteúdo atual da aba "Conteúdo" (módulos, aulas, drag-and-drop, lesson editor) permanece aqui intacto.
- **Opções**: branding (fontes, cores), drip global, checklist de publicação, status draft/published — mescla das abas "Homepage" (branding) e "Configurações" atuais.

### 4. Preview mobile por aba

- Thumbnail: renderiza card do produto como apareceria na storefront
- Checkout: renderiza página de checkout simplificada
- Course: mantém preview existente do lesson editor
- Opções: mantém `CourseMobilePreview` com branding

### 5. Integração com enrollment/progresso do aluno

Nenhuma mudança agora — o hook `useLessonProgress.ts` já existe com `progressMap`, `markStarted`, `markCompleted`. A sidebar do aluno e CSS variables de branding são features de consumo (player), não do builder. Documentar como item futuro.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| Migration SQL | 7 colunas novas em `courses` |
| `src/hooks/useCourseBuilder.ts` | Adicionar campos à interface `Course` |
| `src/pages/editor/CourseFlow.tsx` | Reestruturar 3 abas → 4 abas (Thumbnail, Checkout, Course, Opções) |

## Itens documentados como futuro (não neste PR)

- Sidebar de navegação do aluno com progresso
- CSS variables dinâmicas (`--highlight-color`, `--bg-color`) no player
- Página `/checkout/[course-slug]` dedicada (hoje usa checkout unificado)
- Google Fonts loading dinâmico

