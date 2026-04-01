

## Usar EmojiPicker na edição de emoji das categorias

### Problema
Atualmente, ao clicar no emoji de uma categoria, abre um `<Input>` de texto onde o usuário precisa digitar/colar um emoji manualmente. O projeto já possui um componente `EmojiPicker` completo em `src/components/circle/EmojiPicker.tsx`.

### Solução

**`src/components/circle/admin/AdminCommunityTab.tsx`**

1. Importar `EmojiPicker` e `Popover`/`PopoverTrigger`/`PopoverContent` do shadcn
2. Remover estados `isEditingEmoji`, `editEmoji`, `emojiInputRef` (não mais necessários)
3. Substituir o bloco de edição de emoji (linhas 149-169) por um `Popover` que abre o `EmojiPicker`:

```tsx
<Popover>
  <PopoverTrigger asChild>
    <button type="button" className="text-sm hover:bg-muted rounded px-1 py-0.5 cursor-pointer" title="Editar emoji">
      {category.emoji || "📁"}
    </button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0" align="start">
    <EmojiPicker onSelect={(emoji) => {
      onUpdatePatch(category.id, { emoji });
      // popover fecha automaticamente
    }} />
  </PopoverContent>
</Popover>
```

4. Para fechar o popover ao selecionar, envolver com estado `open`/`onOpenChange` controlado

### Arquivos alterados
1. `src/components/circle/admin/AdminCommunityTab.tsx` — substituir input de texto por Popover + EmojiPicker

