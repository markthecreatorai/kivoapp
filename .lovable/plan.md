
# Plano: Reestruturar aba Thumbnail com 3 Steps e campo CTA

## Mudanças

### 1. Migração SQL — adicionar coluna `thumbnail_cta`

```sql
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_cta text DEFAULT 'Acessar curso';
```

### 2. `src/hooks/useCourseBuilder.ts` — adicionar `thumbnail_cta` à interface `Course`

### 3. `src/pages/editor/CourseFlow.tsx` — refatorar `ThumbnailTab`

Dividir em 3 StepCards:

- **Step 1 — "Escolha o estilo do card"**: 3 botões visuais (Preview, Callout, Button) com ícone/ilustração, borda ativa e descrição.
- **Step 2 — "Imagem de capa"**: `ImageUploadField` com recomendação "1920×1080". Oculto se estilo = "button". Completed = imagem preenchida.
- **Step 3 — "Textos da vitrine"**: Título (min 3 chars, max 100, contador), Subtítulo/headline (max 120, contador, oculto se button), CTA (max 40, contador, default "Acessar curso"). Validação inline: título < 3 chars mostra alerta vermelho.

Validação: `completed` do Step 3 = título >= 3 chars.

### 4. Preview (`MobilePreviewPanel`, caso `thumbnail`)

- Renderizar o CTA dinâmico (substituir texto fixo "Acessar curso" / "Acessar" pelo valor de `thumbnail_cta`).
- Preview já reage em tempo real via prop `course` — sem mudança de arquitetura.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| Nova migração SQL | Adicionar coluna `thumbnail_cta` |
| `src/hooks/useCourseBuilder.ts` | Campo `thumbnail_cta` na interface |
| `src/pages/editor/CourseFlow.tsx` | ThumbnailTab com 3 StepCards + CTA; preview com CTA dinâmico |
