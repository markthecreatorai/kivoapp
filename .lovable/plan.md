

# Plano: Usar header do Discovery no MyCommunities (/circles)

## O que muda

A página `/circles` (MyCommunities) tem um header simples com título "Minhas Comunidades" e botão "Nova Comunidade". A página `/circles/explore` (CommunityDiscovery) usa o header padrão do CircleLayout com `CommunitySwitcher` à esquerda e avatar/dropdown do usuário à direita.

O objetivo é substituir o header de `/circles` pelo mesmo header de `/circles/explore`.

## Implementação

**Arquivo:** `src/pages/circle/MyCommunities.tsx`

1. Importar `CommunitySwitcher`, `Avatar`, `DropdownMenu` e ícones necessários (mesmas imports do CommunityDiscovery)
2. Substituir o header atual (linhas 174-184) pelo header idêntico ao do CommunityDiscovery:
   - `CommunitySwitcher currentCommunity={null}` à esquerda
   - Avatar dropdown com opções (Configurações, Sair) ou botão Login à direita
   - Mover o botão "Nova Comunidade" para dentro do conteúdo da página (acima da grid) ou como ação no header
3. Manter o botão "Nova Comunidade" visível — posicioná-lo ao lado do avatar no header ou no início do conteúdo

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/circle/MyCommunities.tsx` | Trocar header por header estilo Discovery com CommunitySwitcher + avatar dropdown |

