

## Carrossel de mídia na página Sobre (padrão Skool)

### Problema atual
A página Sobre suporta apenas 1 imagem (`cover_image_url`) e 1 vídeo (`about_video_url`). Imagem serve apenas como thumbnail do vídeo. Não há carrossel nem botão "+" para adicionar mais mídias.

### Solução

**1. Migration — nova coluna `about_gallery` (jsonb)**

Adicionar coluna `about_gallery` na tabela `communities` para armazenar array de itens de mídia:

```sql
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS about_gallery jsonb DEFAULT '[]';
```

Estrutura do array:
```json
[
  { "type": "image", "url": "https://...", "position": 0 },
  { "type": "video", "url": "https://youtube.com/...", "position": 1 },
  { "type": "image", "url": "https://...", "position": 2 }
]
```

Migrar dados existentes (`cover_image_url` e `about_video_url`) para o gallery automaticamente na migration.

**2. `src/pages/circle/CircleAbout.tsx` — reescrever seção de mídia**

- Ler `about_gallery` (jsonb array) em vez de campos individuais
- Exibir carrossel com:
  - Imagem principal grande (item selecionado)
  - Thumbnails abaixo (como na referência Skool)
  - Botão "+" ao final das thumbnails (admin only)
  - Clique na thumbnail troca o item principal
  - Vídeos exibem botão play no carrossel, imagens exibem direto
- Navegação por setas esquerda/direita no item principal
- Admin pode remover item individual (X no hover da thumbnail)

**3. Modal de mídia atualizado**

- Modal "Adicionar mídia" agora adiciona ao array `about_gallery` em vez de substituir
- Upload de imagem → append ao array
- Adicionar vídeo → append ao array
- Remover item → splice do array
- Reordenar via drag ou posição

### Comportamento do carrossel

```text
┌──────────────────────────────────┐
│                                  │
│     [Imagem/Vídeo principal]     │
│                                  │
└──────────────────────────────────┘
 [thumb1] [thumb2] [thumb3] [ + ]
```

- Thumb selecionada tem borda/destaque
- Vídeo no principal mostra overlay de play
- Botão "+" abre modal de adicionar (admin only)
- Sem thumbnails se apenas 1 item

### Arquivos alterados
1. Nova migration SQL — coluna `about_gallery` + migração de dados existentes
2. `src/pages/circle/CircleAbout.tsx` — carrossel completo com thumbnails, navegação, modal atualizado

### Resultado
- Múltiplas imagens e vídeos no About, estilo Skool
- Carrossel com thumbnails e botão "+"
- Compatível com dados existentes (migração automática)

