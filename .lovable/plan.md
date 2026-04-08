

# Plano: Redesenhar /affiliates com dashboard completo de afiliados

## Problema atual

A pagina `/affiliates` e genérica — lista afiliados sem contexto de produto, sem ranking, sem métricas de conversão. Não dá para ver qual afiliado vende mais, qual produto tem mais afiliados, nem gerenciar comissões por produto.

## Nova estrutura

### Layout da página

```text
┌─────────────────────────────────────────────────┐
│ Afiliados                    [Link de aplicação] │
│ Gerencie seu programa de afiliados por produto   │
├─────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│ │Afilia│ │Vendas│ │Comiss│ │Pago  │  KPI cards  │
│ │ dos  │ │ mês  │ │pend. │ │total │            │
│ └──────┘ └──────┘ └──────┘ └──────┘            │
├─────────────────────────────────────────────────┤
│ [Configurações] [Ranking] [Comissões] [Payouts] │
├─────────────────────────────────────────────────┤
│                                                  │
│  Tab Configurações: programa global + por produto│
│  Tab Ranking: top afiliados com cliques/vendas   │
│  Tab Comissões: todas comissões com filtros       │
│  Tab Payouts: histórico de pagamentos             │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Aba "Configurações"
- Configurações globais do programa (on/off, comissão padrão, cookie, hold, auto-approve) — mesmo que já existe
- **Novo**: Tabela de produtos com comissão customizada por produto (override da comissão padrão)
- Cada produto pode ter comissão diferente ou usar o padrão

### Aba "Ranking" (nova)
- Tabela de afiliados ordenada por performance
- Colunas: Nome, Email, Status, Cliques, Vendas (count de comissões), Receita gerada, Comissão total, Ações (aprovar/suspender)
- Filtro por status (Todos, Pendente, Aprovado, Suspenso)
- Badge de posição (#1, #2, #3 com cores)

### Aba "Comissões" (melhorada)
- KPI cards de pendente/aprovado/pago
- Tabela com: Data, Afiliado (nome), Produto, Valor da venda, Comissão, Status
- Filtro por status

### Aba "Payouts" (existente, mantida)

## Mudanças

### 1. `src/pages/Affiliates.tsx`
- Reescrever completamente com a nova estrutura de 4 abas
- Adicionar queries para buscar dados de afiliados com join em comissões para calcular ranking
- Adicionar query de produtos do workspace para configuração por produto
- KPI cards no topo (total afiliados, vendas do mês, comissão pendente, total pago)
- Tab "Ranking" com tabela ordenável por performance
- Tab "Comissões" com coluna de produto e afiliado
- Tab "Configurações" com seção de comissão por produto

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/Affiliates.tsx` | Reescrita completa com dashboard de 4 abas, ranking, métricas por produto |

Nenhuma migração SQL necessária — as tabelas `affiliates`, `affiliate_links`, `commissions`, `payouts`, `affiliate_programs` já existem com todos os campos necessários. Os dados de produto vêm da tabela `products`.

