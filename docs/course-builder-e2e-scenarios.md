# Course Builder — Cenários E2E

> Documentação para automação futura (Playwright/Cypress). Atualmente servem como checklist de QA manual.

## Cenário 1: Fluxo completo até publicação

1. Navegar para `/store` → clicar "Novo Produto" → selecionar "Curso Online"
2. Preencher nome do produto → clicar "Criar"
3. Na aba **Thumbnail**: selecionar estilo "Preview", preencher título e subtítulo
4. Na aba **Checkout**: preencher título, descrição, definir preço R$99
5. Na aba **Curso**: clicar "Editar Página" → preencher título e descrição → voltar
6. Adicionar módulo "Módulo 1" → adicionar aula "Aula 1"
7. Editar aula: adicionar vídeo e descrição → salvar → marcar como publicada
8. Na aba **Opções**: verificar checklist → clicar "Publicar Curso"
9. **Esperado**: toast de sucesso, status muda para "Publicado"

## Cenário 2: Bloqueio por checklist incompleto

1. Criar curso novo (sem conteúdo)
2. Ir direto para aba **Opções**
3. Verificar que checklist mostra itens vermelhos (título, módulos, aulas)
4. Clicar "Publicar Curso"
5. **Esperado**: botão desabilitado ou toast de erro listando pendências

## Cenário 3: Reorder módulos via DnD

1. Criar curso com 3 módulos (A, B, C)
2. Arrastar módulo C para posição 1
3. **Esperado**: ordem visual muda para C, A, B
4. Recarregar página
5. **Esperado**: ordem persiste como C, A, B

## Cenário 4: Reorder aulas dentro de módulo

1. Criar módulo com 3 aulas (1, 2, 3)
2. Arrastar aula 3 para posição 1
3. **Esperado**: ordem visual muda para 3, 1, 2
4. Recarregar página
5. **Esperado**: ordem persiste

## Cenário 5: Upload de vídeo e material

1. Editar uma aula
2. Fazer upload de vídeo (arquivo .mp4 < 100MB)
3. **Esperado**: progress bar, preview do vídeo após upload
4. Adicionar material de apoio (PDF)
5. **Esperado**: arquivo aparece na lista com nome e tamanho

## Cenário 6: Erro de rede — rollback visual

1. Criar curso com 2 módulos
2. Simular offline (DevTools → Network → Offline)
3. Tentar reordenar módulos
4. **Esperado**: reorder visual reverte para posição original, toast de erro
5. Reconectar → reordenar novamente
6. **Esperado**: funciona normalmente

## Cenário 7: Preview mobile sem overflow

1. Em cada aba, verificar o preview mobile à direita
2. Redimensionar janela para viewport mobile (375px)
3. **Esperado**: conteúdo não ultrapassa a moldura do celular em nenhuma aba

## Cenário 8: Guard de saída com alterações não salvas

1. Editar título do curso na homepage
2. Tentar navegar para outra página (clicar "Minha Loja")
3. **Esperado**: dialog de confirmação "Você tem alterações não salvas"
4. Clicar "Cancelar" → permanece na página
5. Clicar "Sair" → navega sem salvar

## Cenário 9: Navegação entre abas

1. Começar na aba Thumbnail
2. Clicar "Próximo" → vai para Checkout
3. Clicar "Próximo" → vai para Curso
4. Clicar "Anterior" → volta para Checkout
5. Clicar na aba "Opções" diretamente → vai para Opções
6. **Esperado**: conteúdo de cada aba renderiza corretamente sem perda de estado

## Cenário 10: Telemetria de eventos

1. Abrir o builder → verificar evento `course_builder_opened`
2. Trocar de aba → verificar `course_builder_tab_switched`
3. Salvar rascunho → verificar `course_draft_saved`
4. Publicar → verificar `course_publish_attempt` + `course_publish_success`
5. **Verificação**: consultar tabela `analytics_events` filtrando por `event_type LIKE 'course_%'`
