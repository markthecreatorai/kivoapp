

# Plano: Tornar domínio dinâmico no campo de link público

## Problema

Na linha 356 de `MyCommunities.tsx`, o domínio está hardcoded como `kivo.com/circles/`. Deveria usar `window.location.host` para refletir o domínio real do app.

## Correção

**Arquivo:** `src/pages/circle/MyCommunities.tsx` — linha 356

Substituir:
```tsx
kivo.com/circles/
```
Por:
```tsx
{window.location.host}/circles/
```

Uma única linha alterada.

