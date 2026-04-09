

## Auditoria: Preview vs Storefront Pública - Produtos Desincronizados

### Problema Identificado

Existem **duas fontes de produtos** que divergem entre o preview e a pagina publica:

| Contexto | O que mostra |
|---|---|
| **Preview (Store.tsx)** | Blocos + todos os produtos PUBLISHED do workspace que nao estao em blocos |
| **Pagina publica (PublicStorefront.tsx)** | Apenas produtos referenciados em blocos |

Resultado: o preview mostra 3 produtos, mas a pagina publica mostra apenas 1 (o outro bloco referencia um produto que foi excluido: `1d36e818-...`).

### Dados Atuais no Banco

- **3 produtos PUBLISHED**: "Guia completo...", "Link de Afiliado Kivo", "sdadsa"
- **3 blocos**: 1 bloco de produto com ID inexistente, 1 link vazio, 1 bloco de produto valido
- Apenas "Guia completo" aparece na pagina publica; os outros 2 produtos publicados nao aparecem

### Plano de Correcao

**1. PublicStorefront: buscar e exibir todos os produtos publicados do workspace**

Alinhar o comportamento da pagina publica com o preview. Alem dos produtos referenciados em blocos, buscar TODOS os produtos PUBLISHED do workspace e exibi-los abaixo dos blocos (filtrando os que ja aparecem via blocos para evitar duplicidade).

- Adicionar query para buscar todos os produtos publicados do workspace junto com precos
- Renderizar os produtos extras abaixo dos blocos, usando o mesmo estilo de card

**2. StorefrontPreview: limpar blocos com produtos inexistentes**

O bloco que referencia `1d36e818-...` nao encontra produto e renderiza `null`. Isso e inofensivo mas gera espaco vazio. Nenhuma acao de codigo necessaria, mas o usuario pode querer excluir esse bloco manualmente.

**3. Garantir consistencia de estilo**

Os cards de produtos extras na pagina publica devem usar o mesmo layout (thumbnail, nome, preco, botao CTA) que ja existe no preview (`StorefrontPreview.tsx` linhas 494-543).

### Arquivos Alterados

- `src/pages/PublicStorefront.tsx` - Adicionar fetch de todos os produtos publicados e renderiza-los apos os blocos

### Detalhes Tecnicos

No `useEffect` de fetch do PublicStorefront, apos buscar os blocos, adicionar uma query paralela:

```sql
SELECT id, name, slug, thumbnail_url, short_description, 
       thumbnail_style, listing_button_text, delivery_url, metadata
FROM products 
WHERE workspace_id = ? AND status = 'PUBLISHED' AND deleted_at IS NULL
```

Com os precos correspondentes. Depois, no render, filtrar produtos que ja estao em blocos e exibir os restantes abaixo da secao de blocos.

