

## Hotfix: Botão "Excluir" live stream não funciona

### Causa raiz

Dois problemas no código atual:

1. **Erros do Supabase não são tratados**: O `delete()` do Supabase retorna `{ error }` mas o código não verifica — erros de RLS ou FK são silenciosamente ignorados (não lançam exceção, então o `catch` nunca é ativado).

2. **`confirm()` dentro de Dialog Radix**: O `confirm()` nativo pode ser bloqueado/interferido pelo focus-trap do Radix Dialog, impedindo a execução do fluxo.

### Alterações

**`src/components/circle/LiveStreamFormModal.tsx`**

1. Substituir `confirm()` nativo por `AlertDialog` do Radix (já existe em `src/components/ui/alert-dialog.tsx`) — usar state `showDeleteConfirm` para controlar
2. Verificar `{ error }` nas chamadas de delete e lançar exceção se houver erro:
   ```tsx
   const { error: evtErr } = await supabase.from("community_events").delete().eq("live_stream_id", stream.id);
   if (evtErr) throw evtErr;
   const { error: strErr } = await supabase.from("community_live_streams" as any).delete().eq("id", stream.id);
   if (strErr) throw strErr;
   ```
3. Adicionar `console.error` no catch para facilitar debug futuro
4. Trocar o botão "Excluir" para abrir o AlertDialog de confirmação em vez de chamar `confirm()`

### Resultado
- Exclusão funciona corretamente com feedback visual
- Erros de RLS/DB são capturados e mostrados ao usuário
- Sem interferência do focus-trap do Dialog

