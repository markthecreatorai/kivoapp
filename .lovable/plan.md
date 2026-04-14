
## Auditoria: por que o curso “sdadsa” não acompanha nome/infos após salvar e publicar

### Diagnóstico

Encontrei a causa principal: o editor de curso está salvando quase tudo na tabela `courses`, mas a loja, a vitrine pública e o checkout continuam lendo vários dados da tabela `products`.

Hoje ficou dividido assim:

- `CourseFlow.tsx` salva:
  - `courses.title`
  - `courses.thumbnail_title`
  - `courses.checkout_title`
  - `courses.checkout_description`
  - `courses.checkout_image`
  - preços em `courses.*` e agora também em `prices`
- Mas `Checkout.tsx`, `PublicStorefront.tsx` e `StorefrontPreview.tsx` ainda leem:
  - `products.name`
  - `products.thumbnail_url`
  - `products.short_description`
  - `products.listing_button_text`
  - `products.checkout_image`
  - `products.checkout_description`

Resultado:
- no editor você muda o nome do curso, mas isso altera `courses.title`, não `products.name`
- a loja e o checkout seguem exibindo o nome antigo
- o mesmo risco vale para imagem, descrição e CTA
- além disso, o botão “Salvar” do topo em `ProductEditor.tsx` hoje é apenas um `toast.success("Rascunho salvo!")` e não salva nada
- e o publicar/salvar do curso pode acontecer antes de descarregar mudanças pendentes do autosave

### Correção proposta

**1. Centralizar sincronização do curso com o produto**
Em `src/pages/editor/CourseFlow.tsx`, criar um helper para espelhar no `products` tudo que precisa aparecer fora do builder:

- `products.name` <= usar o título principal do curso
- `products.thumbnail_url` <= usar `thumbnail_image` ou fallback coerente
- `products.short_description` <= derivar do resumo visível do curso/checkout
- `products.checkout_image` <= espelhar do curso
- `products.checkout_description` <= espelhar do curso
- `products.listing_button_text` <= usar CTA apropriado do curso
- opcionalmente `thumbnail_style` também manter alinhado

Objetivo: qualquer tela externa continue lendo `products`, mas com dados atualizados pelo editor de curso.

**2. Sincronizar em todos os pontos de persistência**
No `CourseFlow.tsx`, acoplar essa sincronização:
- no autosave
- no salvar rascunho
- no publicar

E fazer isso junto com a sincronização de preços já criada, para evitar estados parciais.

**3. Garantir flush antes de salvar/publicar**
Hoje existem mudanças pendentes no autosave com debounce. Vou ajustar para que:
- `Salvar rascunho`
- `Publicar`
- ações finais da aba de opções

forcem `flush()` antes das mutations finais, evitando publicar com nome/descrição ainda não persistidos.

**4. Corrigir a barra superior do ProductEditor**
Em `src/pages/ProductEditor.tsx`, o botão “Salvar” hoje não executa persistência real. Vou alterar para:
- disparar o save real do flow atual, ou
- remover/desabilitar esse botão até estar conectado corretamente

Assim evitamos a falsa sensação de que o conteúdo foi salvo.

**5. Manter compatibilidade com checkout e storefront atuais**
Como as páginas públicas continuam consumindo `products` + `prices`, essa correção deixa tudo interligado sem exigir refatoração grande no frontend público.

### Arquivos a alterar

- `src/pages/editor/CourseFlow.tsx`
  - adicionar helper de sync `course -> product`
  - executar sync no autosave, salvar rascunho e publicar
  - forçar flush antes das ações finais
- `src/pages/ProductEditor.tsx`
  - corrigir ou neutralizar o botão de salvar do topo para não mentir ao usuário

### Impacto esperado

Depois disso, ao editar e publicar o curso “sdadsa”:
- o nome passará a refletir na loja, preview, storefront pública e checkout
- imagem e descrição do checkout também acompanharão o editor
- o preço continuará sincronizado com `prices`
- salvar/publicar deixará de perder alterações pendentes por debounce

### Detalhes técnicos

Mapa de inconsistência atual:
```text
Editor de curso -> grava em courses
Checkout/loja/storefront -> leem de products/prices

courses.title            != products.name
courses.checkout_image   != products.checkout_image
courses.checkout_desc    != products.checkout_description
courses price            -> já corrigido em prices
```

Estratégia:
```text
CourseFlow
  ├─ save course fields in courses
  ├─ sync shared display fields into products
  └─ sync commercial fields into prices
```

Validação após implementação:
- editar nome do curso
- salvar rascunho
- publicar
- abrir loja/preview
- abrir storefront pública
- abrir checkout
- confirmar que nome, imagem, descrição e preço batem em todos os pontos
