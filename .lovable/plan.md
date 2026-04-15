

## Validação de preço mínimo R$ 5,00 na plataforma

### Problema
O gateway Asaas rejeita cobranças abaixo de R$ 5,00, mas a plataforma permite que o creator cadastre qualquer valor. O erro só aparece no momento do checkout para o comprador, quando deveria ser impedido já na hora de cadastrar o produto.

### Correção

Adicionar validação inline em todos os pontos de entrada de preço, exibindo mensagem de erro quando o valor for > 0 e < 5,00 (produtos gratuitos/lead magnets com valor 0 continuam permitidos).

**1. `src/components/products/ProductPricingStep.tsx`**
- Após o input de preço, mostrar erro se `form.price > 0 && form.price < 5`
- Texto: "O valor mínimo é R$ 5,00"

**2. `src/pages/editor/CourseFlow.tsx`** (aba Checkout)
- Após o input de preço, mostrar erro se `priceCents > 0 && priceCents < 500`
- Texto: "O valor mínimo é R$ 5,00"
- Bloquear publicação nessa condição (adicionar ao checklist de publish)

**3. `src/components/circle/admin/AdminPricingTab.tsx`** (tiers de comunidade)
- Após o input de preço do tier, mostrar erro se `!tier.is_free && tier.price_cents > 0 && tier.price_cents < 500`
- Desabilitar botão "Salvar" se qualquer tier pago estiver abaixo de R$ 5,00

### Resultado
Creator recebe feedback imediato ao tentar definir preço entre R$ 0,01 e R$ 4,99, evitando erros no gateway durante o checkout.

