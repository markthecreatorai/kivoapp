
## Recuperação de Carrinho Abandonado — O que já existe vs. o que falta

### ✅ Já implementado
- Edge Function `abandoned-cart-recovery` (detecta sessões abandonadas, agenda 3 emails)
- Edge Function `send-recovery-emails` (envia emails com templates, cancela se compra concluída)
- Tabelas `checkout_sessions` (com `abandoned_at`, `recovered_checkout`) e `recovery_emails`
- Métricas de recuperação na página Analytics (carrinhos recuperados, taxa, receita)
- Email onBlur no Checkout salva sessão

### 🔧 O que falta (3 itens)

#### 1. Link de retomada no Checkout
**`src/pages/Checkout.tsx`**
- Ler `?session=<id>` da URL
- Carregar `checkout_sessions` + `checkout_line_items` para restaurar produto, email e contexto
- Marcar `recovered_checkout = true` ao completar pagamento
- Trackear `cart_recovered` no analytics

#### 2. Seção dedicada de Recovery no Analytics
**`src/pages/Analytics.tsx`**
- Expandir a seção de "Cart Recovery" com:
  - Total de carrinhos abandonados
  - Emails enviados vs. abertos (se disponível)
  - Receita recuperada com gráfico de tendência
  - Lista dos últimos carrinhos recuperados

#### 3. Garantir cron jobs das Edge Functions
- Verificar/criar pg_cron para `abandoned-cart-recovery` (a cada 15min)
- Verificar/criar pg_cron para `send-recovery-emails` (a cada 5min)

### Arquivos alterados
1. `src/pages/Checkout.tsx` — restaurar sessão via query param
2. `src/pages/Analytics.tsx` — seção expandida de recovery

### Riscos
- Sem risco a funcionalidades existentes (checkout normal não afetado)
- Rollback: remover lógica de `?session=` do Checkout
