

## "Voltar para o workspace" — Verificação e Ajuste

### Status atual

O código já possui o botão "Voltar para o workspace" no CommunitySwitcher (popover) com a condição correta:

```tsx
{(currentWorkspace || userWorkspaces.length > 0) && (
  <button onClick={() => navigate("/dashboard")}>
    Voltar para o workspace
  </button>
)}
```

A query de `workspace_members` retorna dados corretamente (confirmado via network requests). O botão **deveria** estar visível para o seu usuário.

### Possível problema

O botão está dentro do **popover** (clique no nome da comunidade no topo). Pode não estar aparecendo por:
1. O preview ainda não recarregou com o código atualizado
2. Você está olhando na versão publicada (kivostore.lovable.app) que precisa de re-publish

### Proposta de melhoria

Para tornar mais visível e garantir que funcione, vou:

1. **Adicionar um botão "Voltar" fixo no header do CircleLayout** (fora do popover) — visível apenas para usuários com workspace Kivo
   - Ícone `ArrowLeft` + texto "Workspace" no header, ao lado do CommunitySwitcher
   - Condição: `userWorkspaces.length > 0` (tem conta Kivo criador)
   - Usuários que são **só membros de comunidades** (sem workspace) não veem o botão

2. **Manter o botão dentro do popover** como está

### Arquivo alterado
1. `src/components/circle/CircleLayout.tsx` — adicionar botão "Voltar ao workspace" no header

