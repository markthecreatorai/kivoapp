

## Adicionar "Voltar para o workspace" no CommunitySwitcher

### Mudança

**`src/components/circle/CommunitySwitcher.tsx`**

- Importar `ArrowLeft` do lucide-react
- Usar `useWorkspace()` já importado para checar `currentWorkspace`
- Adicionar botão "Voltar para o workspace" no bloco de ações (linha ~142), antes de "Criar comunidade", visível apenas quando `currentWorkspace` existe
- Ao clicar, navega para `/dashboard` e fecha o popover

### Resultado
Usuários que possuem workspace veem a opção de voltar ao painel principal direto do switcher de comunidades. Quem não tem workspace (apenas membro de comunidades) não vê o botão.

