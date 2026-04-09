

# Integração Completa de Pagamentos com Asaas

## Diagnóstico: o que JA existe

O projeto ja possui infraestrutura consideravel:
- **Edge Functions**: `create-payment` (592 linhas, com Asaas + simulacao), `webhook-asaas` (1015 linhas), `circle-subscription`, `process-payouts`, `reconcile-asaas`, `test-asaas`, `release-reserves`
- **DB**: tabelas `wallet_ledger`, `withdrawals`, `orders` ja existem
- **Checkout**: `Checkout.tsx` (640 linhas) ja chama `create-payment` com PIX/cartao/boleto
- **Income**: `Income.tsx` ja usa `get_wallet_balance` RPC

## O que FALTA implementar (por fase)

---

### FASE 1: Migracao de banco (novas tabelas e colunas)

**Arquivo**: nova migracao SQL

1. Adicionar colunas no `workspaces`: `asaas_customer_id`, `asaas_account_id`, `asaas_wallet_id`, `payment_setup_complete`, `plan_type`, `plan_started_at`, `plan_expires_at`, `trial_ends_at`
2. Criar tabela `transactions` (com campos de split, taxas Kivo, PIX QR, boleto, etc)
3. Criar tabela `security_reserves` (valor retido + data de liberacao)
4. Criar tabela `fee_config` com seed das taxas Creator vs Pro
5. RLS policies para todas as novas tabelas

---

### FASE 2: Edge Functions novas/refatoradas

1. **`create-asaas-account`** -- cria subconta Asaas no onboarding do creator, salva `asaas_account_id` no workspace
2. **Refatorar `create-payment`** -- adicionar logica de split (conta-pai recebe, split para subconta do creator), calcular taxas via `fee_config`, salvar em `transactions` + `security_reserves`
3. **Refatorar `webhook-asaas`** -- atualizar `transactions.status`, calcular `available_at` por metodo (PIX D0, boleto D+1, cartao D+2)
4. **Refatorar `process-payouts`** -- usar saldo real de `transactions` - `security_reserves` nao liberadas
5. **Refatorar `release-reserves`** -- liberar de `security_reserves` onde `release_date <= hoje`

---

### FASE 3: Checkout refatorado

**Arquivo**: `src/pages/Checkout.tsx` + componentes em `src/components/checkout/`

1. Manter layout atual, trocar backend para usar split Asaas
2. Adicionar exibicao de parcelas com juros em tempo real (1x-12x)
3. QR Code PIX com countdown de expiracao
4. Boleto com codigo de barras copiavel
5. Selos de confianca ("Processado por Asaas -- Instituicao autorizada pelo Banco Central")
6. Herdar cores do branding do creator

---

### FASE 4: Dashboard de Renda refatorado

**Arquivo**: `src/pages/Income.tsx` + componentes em `src/components/income/`

1. 4 cards: Receita Bruta, Receita Liquida, Disponivel para Saque, Em Reserva -- alimentados por `transactions` + `security_reserves`
2. Tabela "Ultimas Vendas" com filtros (periodo, metodo, status) + export CSV
3. Modal de saque com validacao de saldo minimo R$20 + chave PIX
4. Secao "Reserva de Seguranca" com tabela de valores retidos/liberados

---

### FASE 5: Pricing e Planos

**Arquivo**: `src/pages/Pricing.tsx` (reescrever do redirect atual)

1. Cards Creator (R$49,90) vs Pro (R$129,90) com features listadas
2. Trial 14 dias com cobranca recorrente via Asaas
3. Salvar `plan_type`, `trial_ends_at` no workspace
4. Gates de feature baseados no plano (email marketing, afiliados, circles multiplas)

---

### FASE 6: Limpeza

1. Remover todas as referencias a Pagar.me: `PagarmeWizard.tsx`, `test-pagarme`, `webhook-pagarme`
2. Remover componente de Stripe se houver
3. Atualizar `SettingsPayments.tsx` com card "Suas Taxas" e "Configuracoes de Checkout"
4. Atualizar termos e textos de referencia

---

## Detalhes tecnicos

- Todas as chamadas Asaas passam por Edge Functions (API key nunca exposta no frontend)
- `ASAAS_API_KEY` = conta-pai Kivo; subcontas tem API keys proprias encriptadas no DB
- Ambiente controlado por `ASAAS_ENV` (sandbox/production) via env var
- Split automatico em toda cobranca: comissao Kivo fica na conta-pai, liquido vai para subconta
- Secrets necessarias: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_ENV`

## Recomendacao

Pela complexidade (20+ arquivos, 6 edge functions, 4 tabelas, 3 paginas), sugiro implementar **uma fase por vez**, comecando pela Fase 1 (migracao de banco) que e pre-requisito de todas as outras.

