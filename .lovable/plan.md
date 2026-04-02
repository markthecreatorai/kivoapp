

## Preview instantâneo de banner e ícone no admin settings

### Problema
Ao fazer upload de banner ou ícone, a imagem só aparece após salvar + recarregar porque o `<img>` lê direto de `community.cover_image_url`. O `invalidateQueries` dispara refetch, mas há delay perceptível.

### Solução
Adicionar estado local de preview (`coverPreview` / `iconPreview`) em ambos os componentes. Ao selecionar o arquivo, criar URL local via `URL.createObjectURL(file)` e exibir imediatamente, antes mesmo do upload terminar. O upload continua acontecendo em background.

### Mudanças

**`src/components/circle/admin/AdminGeneralTab.tsx`**
- Adicionar `const [coverPreview, setCoverPreview] = useState<string | null>(null)` e `iconPreview` idem
- Na função `uploadImage`: chamar `setCoverPreview(URL.createObjectURL(file))` (ou icon) **antes** do upload
- No `<img>` da capa: `src={coverPreview || community.cover_image_url}`
- No `<img>` do ícone: `src={iconPreview || community.icon_url}`
- Limpar preview no cleanup (`URL.revokeObjectURL`)

**`src/components/circle/admin/AdminSettingsTab.tsx`**
- Mesma abordagem: estados locais de preview + `createObjectURL` antes do upload + fallback para URL do banco

### Resultado
- Imagem aparece instantaneamente ao selecionar o arquivo
- Upload continua normalmente em background
- Sem necessidade de recarregar página

