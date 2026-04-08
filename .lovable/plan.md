

# Plano: Corrigir bug de "ida e volta" na aba Design

## Causa raiz

O ciclo de save automático causa o UI "pular de volta" ao estado anterior:

1. Usuário clica em template/cor → `onUpdate()` → atualiza `localTheme` + dispara `debouncedSaveTheme`
2. Após 1.5s, salva no banco → `onSuccess` → `queryClient.invalidateQueries(['storefront-theme'])`
3. Refetch traz dados do banco → `useEffect([theme])` em Store.tsx (linha 803) reseta `localTheme` para dados do servidor
4. `localTheme` resetado propaga como prop para `ThemeSection` → `useEffect([theme])` (linha 560) reseta `currentTheme`
5. UI volta ao estado anterior — **"ida e volta"**

Mesmo problema existe para `storefront` (linha 799).

Além disso, os debounce timers **nunca são cancelados** — a cleanup function retornada é ignorada, então múltiplos cliques disparam múltiplos saves.

## Correção (Store.tsx)

### 1. Não resetar local state quando refetch acontecer após save

Substituir os `useEffect` ingênuos por lógica que só sincroniza quando o dado vem pela primeira vez (não após um save local):

```typescript
// Usar ref para saber se o save local está pendente
const localThemeDirty = useRef(false);
const localStorefrontDirty = useRef(false);

useEffect(() => {
  if (storefront && !localStorefrontDirty.current) {
    setLocalStorefront(storefront);
  }
}, [storefront]);

useEffect(() => {
  if (!localThemeDirty.current) {
    setLocalTheme(theme);
  }
}, [theme]);
```

Marcar `dirty = true` quando o usuário edita, e `dirty = false` quando o save completa com sucesso.

### 2. Corrigir debounce — cancelar timeout anterior

Usar `useRef` para armazenar o timer e limpar o anterior antes de criar um novo:

```typescript
const themeTimerRef = useRef<ReturnType<typeof setTimeout>>();
const storefrontTimerRef = useRef<ReturnType<typeof setTimeout>>();

const debouncedSaveTheme = useCallback((data: Partial<StorefrontTheme>) => {
  setSaveStatus("unsaved");
  localThemeDirty.current = true;
  clearTimeout(themeTimerRef.current);
  themeTimerRef.current = setTimeout(() => {
    saveThemeMutation.mutate(data);
  }, 1500);
}, [saveThemeMutation]);
```

### 3. Limpar dirty flag no onSuccess das mutations

```typescript
// saveThemeMutation onSuccess:
onSuccess: () => {
  setSaveStatus("saved");
  localThemeDirty.current = false;
  queryClient.invalidateQueries({ queryKey: ["storefront-theme"] });
},
```

### 4. Remover invalidateQueries do onSuccess (opcional mas recomendado)

Como o `localTheme` já tem o estado correto, o `invalidateQueries` é desnecessário e causa o refetch que gera o "pulo". Alternativa: manter o invalidate mas com a proteção do dirty flag (opção escolhida acima — mais segura).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/Store.tsx` | Adicionar refs para dirty flags e timer refs; corrigir debounce; proteger useEffects de sync |

## Resultado esperado

- Clicar em template/cor aplica imediatamente sem "pular de volta"
- Auto-save continua funcionando após 1.5s de inatividade
- Múltiplos cliques rápidos cancelam saves anteriores (só o último executa)

