

# Plano: Smooth scrolling premium na landing page

## Abordagem

Usar **Lenis** (biblioteca leve e popular para smooth scroll estilo Framer) integrado apenas na landing page, sem afetar o resto do app.

## Implementação

### 1. Instalar Lenis
- `npm install lenis`

### 2. Criar hook `useSmoothScroll`
- Arquivo: `src/hooks/useSmoothScroll.ts`
- Inicializa Lenis com config premium (duration ~1.2, easing suave, smooth wheel + touch)
- Respeita `prefers-reduced-motion` — desativa smooth scroll quando ativo
- Cleanup no unmount
- Retorna instância para controle externo se necessário

### 3. Integrar na LandingPage
- Chamar `useSmoothScroll()` no componente `LandingPage`
- Lenis só fica ativo enquanto a landing está montada

### 4. Âncoras do menu
- Converter os links `<a href="#section">` do nav para usar `scrollTo` do Lenis com easing suave
- Ou simplesmente deixar Lenis interceptar o scroll nativo para âncoras (comportamento padrão)

### 5. CSS
- Adicionar `html.lenis, html.lenis body { height: auto; }` no `index.css` para compatibilidade

### 6. Cuidados
- Não aplicar Lenis globalmente (apenas na landing) para não conflitar com modais, drawers, carrosséis
- Destruir instância no cleanup do useEffect
- Lenis não interfere com touch scroll em mobile por padrão — mantém performance

## Arquivos

| Arquivo | Alteração |
|---|---|
| `package.json` | Adicionar `lenis` |
| `src/hooks/useSmoothScroll.ts` | Novo hook |
| `src/pages/LandingPage.tsx` | Chamar hook |
| `src/index.css` | Classes auxiliares Lenis |

## Resultado
Scroll premium com inércia suave, desaceleração natural e âncoras elegantes — apenas na landing page.

