

## Fix: Drag-and-drop não encaixa ao soltar suavemente

### Causa raiz
Dois problemas:
1. `collisionDetection` usa `closestCenter` — exige que o centro do item arrastado cruze o centro do alvo. Soltura suave não satisfaz essa condição, e `over` retorna `null`, causando o "elástico" de volta.
2. `PointerSensor` tem `distance: 3` que funciona, mas o `onDragEnd` descarta quando `over` é null, perdendo a reordenação que já aconteceu no `onDragOver`.

### Solução

**`src/pages/circle/CircleAbout.tsx`**

1. Importar `pointerWithin` em vez de `closestCenter` — detecta colisão quando o **ponteiro** está dentro do item alvo (muito mais sensível)
2. Reduzir `PointerSensor` distance para `0` (ativa imediatamente)
3. No `onDragEnd`: sempre persistir o `gallery` atual (que já foi reordenado pelo `onDragOver`), independente de `over` ser null ou não

```tsx
// Mudanças:
import { pointerWithin } from "@dnd-kit/core";  // trocar closestCenter

// Sensor com distance: 0
useSensor(PointerSensor, { activationConstraint: { distance: 0 } })

// collisionDetection={pointerWithin}

// onDragEnd simplificado:
onDragEnd={() => {
  if (localGallery) saveGallery(localGallery);
  setLocalGallery(null);
}}
```

### Arquivos alterados
1. `src/pages/circle/CircleAbout.tsx` — trocar collision detection, reduzir distância do sensor, simplificar onDragEnd

### Resultado
- Arrastar e soltar encaixa naturalmente ao soltar em qualquer posição
- Sem efeito elástico — item fica onde foi solto

