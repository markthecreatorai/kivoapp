

# Plano: Edge Function `send-lead-email` com Resend

## Resumo

Criar uma Edge Function que recebe dados do lead, envia um email de boas-vindas via Resend e atualiza o status do lead no banco. O frontend chamará essa função após capturar o lead.

## Pré-requisito: Secrets

Você precisará adicionar duas secrets no Supabase:
- **RESEND_API_KEY** — sua chave de API do Resend
- **EMAIL_FROM** — remetente (ex: `Equipe <noreply@kivohub.com.br>`)

Vou solicitar a adição via ferramenta de secrets antes de prosseguir com o código.

## Arquivos

| Arquivo | Ação |
|---|---|
| `supabase/functions/send-lead-email/index.ts` | Criar — Edge Function |
| `supabase/config.toml` | Adicionar `[functions.send-lead-email]` com `verify_jwt = false` |
| `src/components/storefront/LeadFormBlock.tsx` | Chamar a Edge Function após inserir/atualizar o lead |

## Edge Function `send-lead-email`

- Recebe `{ name, email, workspaceId, leadId }` via POST
- Valida input com Zod
- Busca `RESEND_API_KEY` e `EMAIL_FROM` de `Deno.env`
- Envia email via API do Resend (`POST https://api.resend.com/emails`)
- Se sucesso, atualiza o lead no banco (`status: 'CONTACTED'` ou campo `email_sent_at`)
- Retorna resposta JSON padronizada
- CORS headers em todas as respostas

## Frontend (LeadFormBlock)

Após o insert/update do lead no banco, chamar:
```
supabase.functions.invoke('send-lead-email', {
  body: { name, email, workspaceId, leadId }
})
```

Sem expor nenhuma chave sensível — tudo fica na Edge Function.

## Segurança

- API key apenas no server (Deno.env)
- Input validation com Zod
- CORS configurado
- `verify_jwt = false` para permitir chamadas do checkout público
- Try/catch com mensagens claras

