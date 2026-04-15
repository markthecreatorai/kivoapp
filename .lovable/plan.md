

## Checkout minimalista inspirado na referência

### Design atual vs. desejado
O checkout atual usa múltiplos cards com bordas (`bg-card rounded-xl border`), seções separadas com títulos, tabs de pagamento (PIX/Cartão/Boleto), ícones de trust em grid, e sticky bottom bar. A referência mostra um layout limpo sem cards, campos inline com bordas finas, resumo do pedido integrado ao fluxo, e um único botão CTA verde.

### Mudanças

**1. `src/pages/Checkout.tsx` — Layout principal**
- Remover header "Compra segura" com ícones
- Remover sticky bottom bar mobile
- Remover grid de trust signals (3 colunas)
- Remover texto Asaas separado
- Simplificar para: ProductSummary → CustomerForm → PaymentTabs → OrderSummary → CTA → Trust badge simples
- Background branco puro (`bg-white`), sem `bg-muted/30`
- Container `max-w-md` (mais estreito)

**2. `src/components/checkout/CustomerForm.tsx` — Campos limpos**
- Remover card wrapper (`bg-card rounded-xl border`)
- Remover título "Seus dados"
- Label "Contact details" → "Dados de contato" acima dos campos
- Campos com borda simples, sem `h-12` (usar padrão), agrupados visualmente (campos adjacentes compartilham bordas como na referência)
- Telefone e Email no topo, depois Nome e CPF

**3. `src/components/checkout/PaymentTabs.tsx` — Simplificar**
- Remover card wrapper
- Label "Payment details" → "Dados do pagamento"
- Manter tabs mas com estilo mais sutil (sem fundo)
- Na aba cartão: campos Nome no cartão + número + MM/AA + CVC em layout mais compacto (número e MM/AA + CVC na mesma linha, como na referência)
- Botão CTA com cor verde (#22c55e), texto branco, rounded-full, altura maior

**4. `src/components/checkout/OrderTotal.tsx` — Inline com o fluxo**
- Remover card wrapper
- Linhas de resumo com tipografia simples (nome do produto + descrição + preço à direita)
- Linha de desconto em vermelho com timer de expiração do cupom (se aplicável)
- "Total due" / "Total" em negrito
- Separador sutil entre seções

**5. `src/components/checkout/ProductSummary.tsx` — Simplificar**
- Remover card wrapper, manter apenas nome + descrição em texto simples no topo
- Thumbnail menor ou removida para ficar mais limpo

**6. Trust badge final**
- Substituir grid de 3 ícones por uma única linha: ícone check verde + "Garantia de 7 dias" (ou texto do creator)
- Manter "Processado por Asaas" como texto discreto abaixo

### Arquivos editados
- `src/pages/Checkout.tsx`
- `src/components/checkout/CustomerForm.tsx`
- `src/components/checkout/PaymentTabs.tsx`
- `src/components/checkout/OrderTotal.tsx`
- `src/components/checkout/ProductSummary.tsx`

### Resultado
Checkout com visual minimalista, fundo branco, sem cards excessivos, campos limpos, CTA proeminente verde, e trust badge simples — alinhado à referência enviada.

