

# Plano: Corrigir botão "Excluir" que não funciona na Store

## Causa raiz

O `handleDelete` (linha 857) usa `confirm()` nativo do browser para confirmar a exclusão. Em ambientes de preview/iframe, `confirm()` é frequentemente bloqueado e retorna `false` silenciosamente — então a mutation nunca executa.

## Correção

**Arquivo:** `src/pages/Store.tsx`

Substituir o `confirm()` nativo por um `AlertDialog` do shadcn/ui (já existe no projeto em `src/components/ui/alert-dialog.tsx`):

1. Adicionar estado `deleteTargetId` para controlar qual produto está sendo excluído
2. Renderizar um `AlertDialog` com mensagem de confirmação
3. No `onConfirm`, chamar `deleteMutation.mutate(deleteTargetId)`
4. O `handleDelete` passa a apenas abrir o dialog setando o ID

Também adicionar `onError` na mutation para feedback caso falhe.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/Store.tsx` | Trocar `confirm()` por `AlertDialog`, adicionar estado `deleteTargetId` |

