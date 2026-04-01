

## Hotfix: "Erro ao salvar" na aba Geral do Admin

### Causa raiz

O formulário da aba Geral envia o campo `long_description` no payload de update, mas **essa coluna não existe** na tabela `communities`. O Supabase retorna erro ao tentar atualizar uma coluna inexistente.

Colunas que existem: `name`, `slug`, `is_listed`, `description`, `about_video_url`, `allow_member_posts`, `allow_member_events`.

Coluna que NÃO existe: `long_description`.

### Solução

Duas opções — a mais segura é a Opção A:

**Opção A — Criar a coluna no banco (recomendada)**

1. Migration: `ALTER TABLE communities ADD COLUMN long_description text;`
2. Nenhuma mudança no frontend necessária — o formulário já usa o campo corretamente

**Opção B — Remover o campo do formulário**

1. Remover `long_description` do state `form` e do payload em `AdminGeneralTab.tsx`
2. Remover o campo "Descrição completa" do JSX

### Alterações (Opção A)

**1. Nova migration SQL**
```sql
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS long_description text;
```

**2. Nenhuma alteração em `AdminGeneralTab.tsx`** — o código já está correto, só faltava a coluna.

### Resultado
- Save na aba Geral funciona sem erro
- Campo "Descrição completa" persiste no banco
- Build sem erros

