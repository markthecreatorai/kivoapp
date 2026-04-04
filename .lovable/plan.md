
## Fix: FeedbackButton — mobile icon-only + mais espaço acima do bottom nav

### Mudanças em `src/components/FeedbackButton.tsx`

1. **Mobile: só ícone** — esconder texto "Reportar problema" em telas < lg
   - Adicionar `hidden lg:inline` no texto
   - Usar `size="icon"` no mobile via classes condicionais

2. **Mais espaço acima do bottom nav** — subir o botão
   - Trocar `bottom-20` (80px) por `bottom-24` (96px) no mobile — garante ~28px de folga acima do bottom nav (~68px)
   - Manter `lg:bottom-4` no desktop

3. **Reduzir z-index** — trocar `z-50` por `z-40` para não sobrepor menus que usam z-50

### Resultado
- Mobile: botão circular pequeno (só ícone 💬), acima do bottom nav sem sobreposição
- Desktop: mantém texto "Reportar problema" e posição original
