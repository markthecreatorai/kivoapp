

# Plano: Atualizar texto do perfil para refletir perfil global único

## Contexto

O texto atual diz que "Perfis de comunidade são gerenciados dentro de cada comunidade", mas na verdade o perfil é único e global — alterações aqui refletem em todas as comunidades.

## Mudança

**Arquivo:** `src/components/settings/SettingsProfile.tsx` — linha 288-290

Substituir o texto por algo como:

```tsx
<p className="text-xs text-muted-foreground">
  Seu perfil é <span className="font-medium">único e global</span>. Alterações aqui são refletidas automaticamente em todas as comunidades que você participa.
</p>
```

Uma única linha de texto alterada, sem mudança estrutural.

