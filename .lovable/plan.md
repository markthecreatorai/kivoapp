

# Plano: Corrigir upload de materiais de apoio (RLS do bucket)

## Causa raiz

O bucket `private-files` tem política RLS que exige que a **primeira pasta** do path seja o `auth.uid()` do usuário:

```sql
(storage.foldername(name))[1] = (auth.uid())::text
```

Porém o upload usa o path `course-materials/${lesson.id}/...` — a primeira pasta é `course-materials`, não o user ID. O Supabase rejeita o upload silenciosamente com erro de permissão.

## Correção

**Arquivo:** `src/components/course/CourseLessonEditor.tsx` (linha 226)

Alterar o path de upload para incluir o `user.id` como primeira pasta:

```
// De:
course-materials/${lesson.id}/${Date.now()}-${file.name}

// Para:
${userId}/course-materials/${lesson.id}/${Date.now()}-${file.name}
```

Obter o `userId` via `supabase.auth.getUser()` no início da função `handleMaterialUpload`, ou usar o `user` do `AuthProvider` já disponível no contexto.

Também preciso verificar se o mesmo problema existe no upload de vídeo (linha ~195) que usa path `course-videos/...`.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/course/CourseLessonEditor.tsx` | Prefixar paths de upload com `userId` para satisfazer RLS do bucket `private-files` |

