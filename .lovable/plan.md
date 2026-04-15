

## Curso não atualiza valor/status na loja ao publicar

### Problemas identificados

**1. Status do produto não é sincronizado**
`syncCourseToProduct()` (linha 127) atualiza `name`, `thumbnail_url`, etc., mas **não** atualiza `products.status`. Quando o curso é publicado (`courses.status = "published"`), o `products.status` permanece `"DRAFT"`. A storefront pública filtra por `status = "PUBLISHED"`, então o curso nunca aparece. Na loja interna, aparece como "Rascunho".

**2. Sync usa objeto `course` desatualizado**
Nos handlers `handlePublish` (linhas 281-282 e 1749-1750), as funções `syncCoursePricesToDb(course)` e `syncCourseToProduct(course)` recebem o objeto `course` original (prop do React Query), que **não contém** as edições feitas na sessão (ex: preço alterado na aba Checkout). O preço antigo é reenviado para `prices`.

### Correções

**1. `syncCourseToProduct` — adicionar sync de status**

Mapear `courses.status` → `products.status`:
- `"published"` → `"PUBLISHED"`
- `"draft"` → `"DRAFT"`

Adicionar campo `status` no `.update()` da linha 131.

**2. Buscar curso atualizado antes de sincronizar**

Nos dois `handlePublish` (linhas 273 e 1742), após o `onSuccess` do `updateCourse.mutate`, fazer um `refetch` do curso via query cache ou um `select` direto do banco antes de chamar as funções de sync — garantindo que `syncCoursePricesToDb` e `syncCourseToProduct` recebam os dados mais recentes.

Alternativa mais simples: usar `queryClient.fetchQuery` para obter o curso atualizado, ou ler diretamente do banco com `supabase.from("courses").select("*").eq("id", course.id).single()` dentro das funções de sync.

**3. Invalidar cache da loja**

Após sync bem-sucedido, invalidar `queryKey: ["all-products"]` para que a lista de produtos na `/store` reflita as mudanças imediatamente.

### Arquivos a editar

- `src/pages/editor/CourseFlow.tsx`:
  - `syncCourseToProduct()`: adicionar campo `status` mapeado
  - `syncCoursePricesToDb()`: receber `courseId` e buscar dados frescos do DB
  - `handlePublish` (2 ocorrências): invalidar cache `["all-products"]` no `onSuccess`

### Resultado
Ao publicar o curso, o produto associado terá `status = "PUBLISHED"`, preço correto, e a loja será atualizada automaticamente.

