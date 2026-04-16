# Env & Infra setup (development / preview / production)

## 1) Variáveis necessárias

### Vercel (Frontend)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_APP_URL`
- `VITE_SUPPORT_EMAIL`

### Supabase Project (Edge Functions secrets)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `EMAIL_FROM_AUTH`
- `EMAIL_FROM_BILLING`
- `EMAIL_FROM_NOTIFY`
- `EMAIL_FROM_DEFAULT`
- `APP_URL`
- `SUPPORT_EMAIL`

### Supabase Auth SMTP (Dashboard)
- Host: `smtp.resend.com`
- Port: `587`
- Username: `resend`
- Password: `<RESEND_API_KEY>`
- Sender name: `Kivo`
- Sender email: `auth@mail.kivohub.com.br`

## 2) Onde configurar

### Vercel
Projeto `kivoapp` → Settings → Environment Variables
- Development
- Preview
- Production

### Supabase
Project Settings → Edge Functions → Secrets

### Local
- copiar `.env.example` para `.env`
- preencher valores locais (`VITE_APP_URL=http://localhost:5173`)

## 3) Redirects/Auth URLs (Supabase)

Authentication → URL Configuration
- Site URL (prod): `https://www.kivohub.com.br`
- Additional Redirect URLs:
  - `https://www.kivohub.com.br/auth/callback`
  - `https://www.kivohub.com.br/reset-password`
  - `http://localhost:5173/auth/callback`
  - `http://localhost:5173/reset-password`
  - `https://<preview-domain>.vercel.app/auth/callback`
  - `https://<preview-domain>.vercel.app/reset-password`

## 4) Observações preview vs production

- Preview deve usar `VITE_APP_URL` do próprio domínio de preview.
- Production deve usar `https://www.kivohub.com.br`.
- Em produção, prefira remetentes no subdomínio dedicado:
  - `auth@mail.kivohub.com.br`
  - `billing@mail.kivohub.com.br`
  - `notify@mail.kivohub.com.br`
