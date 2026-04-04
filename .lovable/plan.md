

## Reestruturar menu lateral — novos itens padrão + Admin com submenu

### Mudanças

**1. `src/lib/menuTools.ts` — Novo coreItems e optionalItems**

Core items (sempre visíveis, nesta ordem):
| # | Título | URL | Ícone |
|---|--------|-----|-------|
| 1 | Home | /dashboard | Home |
| 2 | Minha Loja | /store | Store |
| 3 | Circles | /circles | MessagesSquare |
| 4 | Vendas | /earnings | DollarSign |
| 5 | Relatórios | /analytics | BarChart3 |
| 6 | Clientes | /clients | Heart |
| 7 | Calendar | /appointments | CalendarCheck |
| 8 | AutoDM | /autodm | Instagram (Zap como fallback) |

- "Renda" renomeado para "Vendas"
- "Analytics" renomeado para "Relatórios"
- "Circles", "Calendar" e "AutoDM" saem dos opcionais e viram core
- Remover "circles" e "appointments" do `optionalItems`
- Adicionar descrição para AutoDM: "Automação para Instagram!"

**2. `src/components/AppSidebar.tsx`**

- Atualizar `coreNavItems` com a nova ordem e nomes
- Adicionar ícone `Instagram` (lucide não tem — usar `MessageSquareShare` ou `Zap` como proxy)
- Seção Admin: trocar lista flat por um único item "Admin" com `Collapsible` ou `DropdownMenu` que expande os sub-itens (Executivo, GTM, Ops, Launch, Feedback, Semana 1)
- Adicionar `Instagram` / `MessageSquareShare` ao `iconMap`

**3. Nova página placeholder `src/pages/AutoDM.tsx`**
- Página simples com título "AutoDM" e descrição "Conecte seu Instagram para automações"
- Registrar rota em `App.tsx`

### Estrutura final do sidebar

```text
[Logo Kivo]
─────────────
Home
Minha Loja
Circles
Vendas
Relatórios
Clientes
Calendar
AutoDM
─────────────
[itens opcionais pinados]
─────────────
+ Mais
─────────────
▸ Admin (colapsável, só para admins)
   Executivo
   GTM
   Ops
   Launch
   Feedback
   Semana 1
─────────────
👤 perfil [footer]
```

### Arquivos alterados
1. `src/lib/menuTools.ts` — reordenar core, remover circles/appointments dos opcionais
2. `src/components/AppSidebar.tsx` — novos core items, admin colapsável
3. `src/pages/AutoDM.tsx` — nova página placeholder
4. `src/App.tsx` — rota `/autodm`

