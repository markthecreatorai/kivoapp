

## Problema

A Badge com a tag do nicho (ex: "📈 Business Coach") está posicionada em `bottom-[-22px]` — ou seja, ela se projeta para fora do container. Porém o card pai (linha 150) tem `overflow-hidden`, o que corta tudo que sai dos limites.

## Correção

Mover a Badge para fora do div com `overflow-hidden`, colocando-a como filha do container externo do card (o `div.relative` da linha 150), em vez de dentro do `div` de altura fixa (linha 151).

### Arquivo: `src/components/landing/CreatorSlider.tsx`

**Antes** (simplificado):
```
<div className="relative rounded-[24px] overflow-hidden ...">  ← linha 150
  <div className="relative h-[360px] ...">                     ← linha 151
    ...
    <Badge bottom-[-22px] />                                    ← linha 169 (cortada)
  </div>
</div>
```

**Depois:**
```
<div className="relative rounded-[24px] overflow-hidden ...">
  <div className="relative h-[360px] ...">
    ...
    (Badge removida daqui)
  </div>
</div>
<Badge className="absolute bottom-[-10px] left-5 z-10 ..." />  ← fora do overflow
```

A Badge será filha do `div` externo (linha 143, `relative`), que não tem `overflow-hidden`, permitindo que ela fique visível mesmo projetando para fora do card arredondado.

