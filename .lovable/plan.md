

## Redesign Sidebar + Menu Tools (estilo Stan Store)

### Conceito
Sidebar minimalista com itens maiores, mais espaçamento, e página "Mais" com cards visuais tipo Stan Store onde cada ferramenta tem ícone grande, nome, descrição e toggle para fixar no menu lateral.

### Mudanças

**1. `src/components/AppSidebar.tsx` — Sidebar maior e simplificada**
- Separar itens em dois grupos: `coreItems` (sempre visíveis: Home, Minha Loja, Renda, Analytics, Clientes) e `optionalItems` (todos os outros)
- `optionalItems` só aparecem se `menuToolsState[id] === true`
- Aumentar tamanho: ícones `h-5 w-5`, texto `text-[15px]`, padding `px-4 py-2.5`, gap `space-y-1.5`
- Logo maior: `h-7`
- Footer com mais espaço: avatar `h-9 w-9`, nome `text-sm`
- Remover workspace card do header (simplificar)
- Link "Mais" no final com ícone `Plus` e estilo diferenciado (como Stan: `+ More`)
- `SIDEBAR_WIDTH` de `16rem` para `15rem` (ou manter, ajustar via padding)
- Remover botão "Criar produto" do sidebar (simplificar)
- Configurações fica no footer (dropdown do usuário), não no menu principal

**2. `src/lib/menuTools.ts` — Adicionar descrições e ícones**
- Adicionar campo `description` e `icon` (string do nome lucide) a cada `MenuToolItem`
- Separar `coreItems` (não toggleáveis) de `optionalItems` (toggleáveis)
- Default: apenas core items ativos, optional items desativados por padrão

**3. `src/pages/MenuTools.tsx` — Layout tipo Stan Store**
- Grid 2 colunas com cards grandes
- Cada card: ícone grande em box arredondado (bg lilás/primary-light), nome em bold com pin icon se ativo, descrição curta, toggle switch à direita
- Reproduzir exatamente o layout da imagem de referência
- Título "More Options" / "Mais Opções"

**4. `src/components/ui/sidebar.tsx` — Ajustar largura**
- `SIDEBAR_WIDTH` de `16rem` para `14rem` (sidebar Stan é mais estreita mas com itens maiores)

### Estrutura do menu

```text
Sidebar (sempre):
  [Logo Kivo]
  ─────────────
  Home
  Minha Loja
  Renda
  Analytics
  Clientes
  ─────────────
  [items opcionais ativados pelo usuário]
  Agendamentos (se ativo)
  Indicações (se ativo)
  Email Flows (se ativo)
  ...
  ─────────────
  + Mais
  ─────────────
  ⚙ Settings          [footer]
  👤 username          [footer]
```

### Dados dos cards na página "Mais"

| Item | Descrição |
|------|-----------|
| Agendamentos | Gerencie seus agendamentos! |
| Indicações | Ganhe renda passiva com indicações! |
| Cupons | Crie cupons de desconto! |
| Leads | Capture e gerencie leads! |
| Email Flows | Envie emails automáticos! |
| Campanhas | Envie campanhas de email! |
| Afiliados | Gerencie seus afiliados! |
| Fiscal | Emita notas fiscais! |
| Logs Pagamento | Acompanhe logs de pagamento! |
| Circles | Crie comunidades! |

### Arquivos alterados
1. `src/lib/menuTools.ts` — adicionar descriptions, separar core/optional
2. `src/components/AppSidebar.tsx` — redesign com tamanhos maiores, lógica core/optional
3. `src/pages/MenuTools.tsx` — layout cards 2 colunas estilo Stan
4. `src/components/ui/sidebar.tsx` — ajustar SIDEBAR_WIDTH

