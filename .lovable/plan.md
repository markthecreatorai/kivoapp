

## Fix: Drag-and-drop estilo Trello (sem elástico, acompanha o mouse)

### Causa raiz
O `SortableThumb` usa `transform` e `transition` do `useSortable`, que gera animação de retorno ao soltar. Falta um `DragOverlay` — o componente do dnd-kit que renderiza uma cópia "fantasma" que acompanha o mouse, enquanto os itens reais apenas trocam de posição instantaneamente.

O erro `closestCenter is not defined` é de cache antigo — o código atual já usa `pointerWithin`.

### Solução

**`src/pages/circle/CircleAbout.tsx`**

1. **Importar `DragOverlay`** do `@dnd-kit/core`

2. **Adicionar estado `activeId`** para rastrear qual item está sendo arrastado

3. **`SortableThumb` — remover transition e esconder item arrastado**:
   - `transition: undefined` (sem animação de retorno)
   - `opacity: isDragging ? 0 : 1` (esconde o item original, o overlay mostra a cópia)

4. **Adicionar handlers `onDragStart` e `onDragCancel`** ao `DndContext`:
   - `onDragStart`: seta `activeId` e inicializa `localGallery`
   - `onDragCancel`: limpa `activeId` e `localGallery`

5. **Adicionar `<DragOverlay dropAnimation={null}>`** após `SortableContext`:
   - Renderiza uma cópia estática do thumbnail ativo
   - `dropAnimation={null}` = sem animação ao soltar (encaixa instantâneo)

```text
Fluxo:
  onDragStart → salva activeId, copia gallery p/ local
  onDragOver  → reordena localGallery (já funciona)  
  onDragEnd   → persiste, limpa activeId e localGallery
  DragOverlay → mostra cópia do item sob o cursor
```

### Arquivos alterados
1. `src/pages/circle/CircleAbout.tsx` — adicionar DragOverlay, ajustar SortableThumb, adicionar onDragStart/onDragCancel

### Resultado
- Item acompanha o mouse suavemente (overlay)
- Thumbnails trocam de posição em tempo real sem animação elástica
- Ao soltar, item encaixa instantaneamente na posição final

