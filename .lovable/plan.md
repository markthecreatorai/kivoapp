

## Configurar Login com Google

O código frontend para login com Google **já está implementado** (`Login.tsx` linha 136-159, com botão "Entrar com Google" e `signInWithOAuth`). O que falta é a configuração no lado do Google Cloud e do Supabase.

### Passos para configurar

**1. Google Cloud Console**

- Acesse [Google Cloud Console](https://console.cloud.google.com/)
- Crie ou selecione um projeto
- Vá em **APIs & Services > OAuth consent screen** e configure:
  - Adicione `wfuwenylojhabresnrvi.supabase.co` em **Authorized domains**
  - Adicione os scopes: `email`, `profile`, `openid`
- Vá em **APIs & Services > Credentials > Create Credentials > OAuth Client ID**
  - Tipo: **Web application**
  - **Authorized JavaScript origins**: adicione a URL do seu site (ex: `https://kivostore.lovable.app`)
  - **Authorized redirect URLs**: adicione `https://wfuwenylojhabresnrvi.supabase.co/auth/v1/callback`
- Copie o **Client ID** e **Client Secret** gerados

**2. Supabase Dashboard**

- Acesse [Authentication > Providers](https://supabase.com/dashboard/project/wfuwenylojhabresnrvi/auth/providers)
- Ative o provider **Google**
- Cole o **Client ID** e **Client Secret** obtidos no passo anterior
- Salve

**3. URL Configuration (importante)**

- Em [Authentication > URL Configuration](https://supabase.com/dashboard/project/wfuwenylojhabresnrvi/auth/url-configuration):
  - **Site URL**: defina como a URL principal do app (ex: `https://kivostore.lovable.app`)
  - **Redirect URLs**: adicione `https://kivostore.lovable.app/dashboard` e `https://kivostore.lovable.app/**`

### Nenhuma alteração de código necessária

O frontend já possui:
- Botão "Entrar com Google" na página de login
- `handleGoogleLogin` usando `signInWithOAuth({ provider: 'google' })`
- Tratamento de erros OAuth via query params
- Redirect para `/dashboard` após sucesso

