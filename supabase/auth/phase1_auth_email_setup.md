# Fase 1 — Auth crítico (Supabase + Resend)

Implementação enxuta para os 3 e-mails críticos de autenticação.

## 1) Configuração SMTP (Supabase Dashboard)

No projeto Supabase:

1. Vá em **Authentication → Email → SMTP Settings**
2. Ative **Custom SMTP**
3. Preencha com Resend:
   - Host: `smtp.resend.com`
   - Port: `587`
   - Username: `resend`
   - Password: `re_...` (API key do Resend)
   - Sender email: `no-reply@SEU_DOMINIO`
   - Sender name: `Kivo`

> Preferência nativa: Supabase Auth envia diretamente via SMTP do Resend.

## 2) Redirects obrigatórios

No Supabase:

- **Authentication → URL Configuration**
  - Site URL: `https://www.kivohub.com.br`
  - Additional Redirect URLs:
    - `https://www.kivohub.com.br/auth/callback`
    - `https://www.kivohub.com.br/reset-password`
    - `http://localhost:5173/auth/callback`
    - `http://localhost:5173/reset-password`

No app (já está implementado):
- Signup → `emailRedirectTo: /auth/callback`
- Forgot password → `redirectTo: /reset-password`

## 3) Templates críticos (arquivos prontos)

Arquivos:
- `supabase/auth/templates/confirm-signup.html`
- `supabase/auth/templates/reset-password.html`
- `supabase/auth/templates/password-changed.html`

No Supabase Dashboard (Authentication → Email Templates), colar:

### Confirm sign up
- Subject: `Confirme seu cadastro na Kivo`
- HTML: `confirm-signup.html`
- Variável principal usada: `{{ .ConfirmationURL }}`

### Reset password
- Subject: `Redefina sua senha na Kivo`
- HTML: `reset-password.html`
- Variável principal usada: `{{ .ConfirmationURL }}`

### Password changed
- Subject: `Sua senha foi alterada`
- HTML: `password-changed.html`
- Variável usada: `{{ .SiteURL }}`

## 4) Teste ponta a ponta

### A. Confirmação de cadastro
1. Crie conta nova em `/signup`
2. Abra e-mail “Confirme seu cadastro”
3. Clique no botão
4. Deve cair em `/auth/callback` e autenticar

### B. Recuperação de senha
1. Em `/forgot-password`, solicite reset
2. Abra e-mail “Redefina sua senha”
3. Clique no botão
4. Deve cair em `/reset-password`
5. Defina nova senha

### C. Senha alterada
1. Conclua o reset acima
2. Verifique recebimento do e-mail de confirmação de alteração
3. Validar visual e clareza da mensagem

## 5) Checklist de aceite

- [ ] Usuário confirma cadastro com sucesso
- [ ] Usuário redefine senha com sucesso
- [ ] Usuário recebe alerta de senha alterada
- [ ] Visual consistente com identidade Kivo
- [ ] Fluxo completo funcionando em produção

## Escopo propositalmente fora (Fase 1)

- MFA
- Magic link
- Invite user
- Identity linked
- Fluxos secundários
