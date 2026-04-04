

## Reações Emoji em Posts e Comentários

### Estado atual
- Tabela `community_reactions` já existe com colunas `member_id, post_id, comment_id, emoji`
- Índices únicos atuais: `(member_id, post_id)` e `(member_id, comment_id)` — sem considerar emoji, limitando a 1 reação por alvo
- UI atual: botão de like simples (👍) no PostCard e PostDetailModal
- EmojiPicker já existe como componente

### Plano de implementação

**1. Migration SQL — permitir múltiplos emojis por usuário**
- Dropar unique indexes `uq_reaction_post` e `uq_reaction_comment`
- Recriar como `(member_id, post_id, emoji)` e `(member_id, comment_id, emoji)` — permite reagir com emojis diferentes no mesmo alvo
- Adicionar índice composto `(post_id, emoji)` e `(comment_id, emoji)` para contagem rápida por emoji

**2. Novo componente `src/components/circle/ReactionBar.tsx`**
- Exibe reações agrupadas por emoji com contadores, ordenadas por frequência
- Props: `targetType ('post'|'comment')`, `targetId`, `memberId`, `isMuted`, `reactions` (dados pré-carregados)
- Cada "pill" de emoji mostra: emoji + count, highlighted se o user reagiu
- Clicar numa pill existente: toggle (adiciona/remove aquela reação)
- Botão "+" abre popover com top 8 emojis rápidos (❤️ 🔥 👏 😂 😍 🎉 💯 👀) + botão "mais" que abre o EmojiPicker completo
- Animação sutil no toggle (scale)

**3. Atualizar `src/components/circle/PostCard.tsx`**
- Substituir botão like simples pelo ReactionBar
- Buscar reações agrupadas por post junto com os posts (nova query ou join)
- Manter a prop `onToggleLike` mas expandir para `onToggleReaction(postId, emoji)`
- Atualizar interface PostCardProps

**4. Atualizar `src/pages/circle/CircleFeed.tsx`**
- Query `circle-reactions` passa a buscar `post_id, emoji` (não só post_id)
- Mutation `toggleLike` vira `toggleReaction` aceitando `{postId, emoji}`
- Query separada para contagem de reações por post (ou batch fetch)

**5. Atualizar `src/components/circle/PostDetailModal.tsx`**
- Substituir like no post por ReactionBar
- Substituir like nos comentários por ReactionBar (versão compacta)
- Atualizar queries e mutations de reações

**6. Atualizar `src/pages/circle/CirclePostDetail.tsx`**
- Mesmas mudanças de queries/mutations que o PostDetailModal

**7. Telemetria**
- Evento `community.reaction.toggle` com payload `{community_id, target_type, emoji, action: 'add'|'remove'}`

### RLS (já existente, verificar)
- Membros ativos podem SELECT/INSERT
- Dono da reação pode DELETE
- Verificar que as policies existentes cobrem o novo cenário multi-emoji

### Componente ReactionBar — Layout visual
```text
┌──────────────────────────────────────────┐
│ [❤️ 5] [🔥 3] [😂 2]  [+]  💬 12       │
└──────────────────────────────────────────┘
         ↑ highlighted se user reagiu
```

### Arquivos criados/alterados
1. `supabase/migrations/xxx_multi_emoji_reactions.sql` — alterar unique indexes
2. `src/components/circle/ReactionBar.tsx` — novo componente
3. `src/components/circle/PostCard.tsx` — integrar ReactionBar
4. `src/pages/circle/CircleFeed.tsx` — queries e mutations multi-emoji
5. `src/components/circle/PostDetailModal.tsx` — ReactionBar em post e comentários
6. `src/pages/circle/CirclePostDetail.tsx` — queries atualizadas

### Riscos e rollback
- Dropar unique indexes é irreversível via migration, mas pode ser recriado
- Dados existentes (emoji "❤️") continuam funcionando sem alteração
- Rollback: reverter código + recriar indexes antigos (dados multi-emoji ficariam, sem conflito)

