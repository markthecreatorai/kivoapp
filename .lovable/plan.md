
# Plano: corrigir o carrossel contínuo sem espaços em branco

## Diagnóstico

O problema não está só no autoplay: a implementação atual do `CreatorSlider` simula infinito manualmente com:
- array triplicado
- `virtualIndex`
- cálculo fixo de `slideWidth`
- `offset` baseado em `window.innerWidth`
- reset silencioso ao fim da animação

Isso é frágil e explica os “espaços”:
1. o track tem largura finita e pode expor área vazia durante transições/reset;
2. o cálculo usa larguras fixas (320/420/480) que não refletem o layout real renderizado;
3. `containerWidth = Math.min(window.innerWidth, 1280)` não corresponde necessariamente à largura visual disponível;
4. o reset acontece após a animação, então o usuário pode perceber o fim do conjunto.

## Correção proposta

### 1) Reescrever o `CreatorSlider` usando Embla
A base do projeto já possui `embla-carousel-react` e um wrapper em `src/components/ui/carousel.tsx`.

Vou substituir a lógica manual por um slider controlado pelo Embla, com:
- `loop: true`
- alinhamento central
- drag nativo
- seleção do slide ativo pelo índice real
- autoplay manual via timer chamando `scrollNext()`

Isso elimina o “fim e começo” visual porque o loop passa a ser gerenciado pela própria engine do carrossel.

### 2) Manter o visual premium atual
Preservar:
- card central em destaque
- cards laterais menores/opacos
- CTA visual e mockup do celular
- setas laterais
- dots sincronizados
- hover/tap para foco

Mas a animação de posição horizontal deixará de depender de `offset` calculado manualmente.

### 3) Ajustar layout de cada slide para evitar respiro lateral
No novo slider:
- definir largura responsiva do item com classes Tailwind reais;
- usar `basis-[320px] md:basis-[420px] lg:basis-[480px]` ou equivalente;
- aplicar `pl/gap` de forma consistente no track;
- garantir que o viewport tenha `overflow-hidden` e sem padding que exponha “buracos”.

### 4) Sincronizar estado ativo com a API do carrossel
Adicionar estado baseado em `selectedScrollSnap()`:
- slide central = ativo;
- laterais = reduzidos/opacos;
- dots usam índice real;
- clique num dot chama `scrollTo()`;
- clique numa seta chama `scrollPrev/scrollNext`.

### 5) Revisar comportamento em desktop e mobile
Garantir:
- swipe natural no mobile;
- pausa de autoplay no hover;
- sem dependência direta de `window.innerWidth` no render;
- sem flicker de hidratação/re-render desnecessário.

## Arquivos a alterar

### `src/components/landing/CreatorSlider.tsx`
Refatoração principal:
- remover `virtualIndex`, `offset`, `handleAnimationComplete` e cálculo manual;
- integrar com `Carousel`/Embla ou usar `useEmblaCarousel` diretamente;
- manter o design dos cards;
- implementar loop real sem espaços.

### Opcional: `src/components/ui/carousel.tsx`
Só se necessário para suportar melhor o caso do slider:
- expor `api` de forma mais conveniente;
- ajustar algum detalhe de classes/layout.
Mas a princípio dá para corrigir sem mexer no componente base.

## Resultado esperado

Após a implementação:
- o slider fica realmente contínuo;
- não aparece espaço branco no final/início;
- o card central continua destacado;
- autoplay, swipe, setas e dots continuam funcionando;
- o comportamento fica mais robusto e menos sujeito a quebra por viewport/layout.

## Validação

Vou validar estes cenários:
- autoplay contínuo por vários ciclos sem espaços;
- clique nas setas próximo da “virada” do loop;
- clique nos dots;
- swipe no mobile;
- resize entre desktop/tablet/mobile;
- confirmação de que sempre existe slide visível, sem faixa vazia no track.

## Detalhes técnicos

```text
Atual:
array triplicado + translateX manual + reset de índice

Novo:
Embla loop=true
  -> viewport oculto
  -> track flex
  -> slides com largura real via CSS
  -> índice ativo vindo da API
```

Essa é a forma mais estável de corrigir o problema de forma definitiva, em vez de continuar ajustando cálculos manuais.
