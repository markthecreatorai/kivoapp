

# Plano: Bordas suaves com fade transparente no carrossel de temas

## Problema

O container do carrossel usa `overflow: hidden` com corte seco nas bordas. Os cards nas extremidades são cortados abruptamente em vez de desaparecerem suavemente.

## Solução

Aplicar um `mask-image` CSS com gradiente linear no container do carrossel (linha 448-451). O gradiente faz as bordas esquerda/direita e superior/inferior ficarem transparentes com transição suave.

## Mudança

**Arquivo:** `src/components/storefront/ThemeSection.tsx`

No `div` do stage (linha 448-451), adicionar `maskImage` com gradiente nas 4 bordas:

```tsx
<div
  className="relative w-full"
  style={{
    height: 370,
    overflow: "hidden",
    maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent), linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)",
    maskComposite: "intersect",
    WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent), linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)",
    WebkitMaskComposite: "source-in",
  }}
>
```

Isso cria um fade suave de ~12% em cada lateral e ~8% no topo/base, eliminando o corte seco.

