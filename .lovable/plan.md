

# Plano: Cards estilo Skool — sem botões, com membros + preço

## O que muda

No `CommunityCard` dentro de `src/pages/CommunityDiscovery.tsx`:

1. **Remover o botão** (`<Button>`) do card
2. **Remover** a linha de stats com ícones (posts, "ativa")
3. **Substituir** o footer por uma linha simples no estilo Skool:
   - `{memberCount} Members · {preço}` onde preço é `"Gratuito"` para `OPEN`, ou o valor formatado (ex: `R$49/mês`) para pagas
4. O card continua clicável inteiro via `onClick`

## Exemplo visual do footer

```text
13 Membros · Gratuito
10 Membros · R$29/mês
```

## Arquivo alterado

| Arquivo | Mudança |
|---|---|
| `src/pages/CommunityDiscovery.tsx` | Substituir bloco de stats+botão por linha "X Membros · Preço" |

