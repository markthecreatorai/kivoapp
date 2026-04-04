

## Fix: FeedbackButton sobrepondo bottom nav no mobile

### Problema
O botão "Reportar problema" está fixo em `bottom-4 right-4` (16px do fundo), mas o bottom navigation tem ~60px de altura. No mobile, o botão fica por cima do menu.

### Solução
Ajustar o posicionamento do botão para subir acima do bottom nav no mobile:

**`src/components/FeedbackButton.tsx`** — linha 50:
- Trocar `bottom-4` por `bottom-20 lg:bottom-4`
- `bottom-20` (80px) no mobile garante que fique acima do bottom nav (~68px com safe area)
- `lg:bottom-4` mantém o posicionamento original no desktop (onde não há bottom nav)

### Arquivo alterado
1. `src/components/FeedbackButton.tsx` — classe responsiva no botão

