# Kivo Email System — Fase 0

Base visual e estrutural dos e-mails transacionais da Kivo.

## Estrutura

- `tokens.ts` → design tokens centralizados
- `components.ts` → componentes reutilizáveis
- `layout.ts` → layout base responsivo
- `templates/phase0-preview.ts` → template base de exemplo
- `templates/auth-reset-preview.ts` → exemplo auth/reset
- `preview.ts` → gera previews HTML locais
- `previews/phase0-preview.html` → saída gerada (exemplo 1)
- `previews/auth-reset-preview.html` → saída gerada (exemplo 2)

## Como gerar preview local

```bash
deno run -A supabase/functions/_shared/email-system/preview.ts
```

Depois abra:

`supabase/functions/_shared/email-system/previews/phase0-preview.html`

## Checklist de reuso (próximas fases)

1. Criar novo arquivo em `templates/`.
2. Montar conteúdo usando `emailTitle`, `emailText`, `ctaPrimary`, `ctaSecondary`, `securityAlertBox`.
3. Empacotar com `baseEmailLayout`.
4. Definir `preheader` claro e objetivo.
5. Evitar estilos hardcoded (usar tokens).
6. Validar em desktop/mobile (largura até 600px).
