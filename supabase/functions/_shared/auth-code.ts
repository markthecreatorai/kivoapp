// Verificação de e-mail própria da Kivo: código numérico de 4 dígitos.
// Nunca armazenamos o código puro — apenas HMAC-SHA256 com segredo de servidor.

export const VERIFICATION_PURPOSE = "signup_verification";
export const CODE_TTL_SECONDS = 600; // 10 minutos
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_ATTEMPTS = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

/** Código criptograficamente seguro de 0000 a 9999 (rejection sampling, sem viés). */
export function generateCode(): string {
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= 4294960000); // maior múltiplo de 10000 abaixo de 2^32
  return String(value % 10000).padStart(4, "0");
}

export function isValidCodeFormat(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash vinculado a código + email normalizado + purpose + user_id. */
export function hashCode(
  secret: string,
  input: { code: string; email: string; purpose: string; userId: string },
): Promise<string> {
  return hmac(secret, [input.purpose, input.userId, input.email, input.code].join(":"));
}

export function hashIp(secret: string, ip: string): Promise<string> {
  return hmac(secret, `ip:${ip}`);
}

/** Comparação em tempo constante. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Só aceita caminhos internos — bloqueia open redirect. */
export function sanitizeReturnTarget(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  if (value.length > 512) return null;
  return value;
}

export function sanitizeFlowOrigin(value: unknown): "producer" | "circles" {
  return value === "circles" ? "circles" : "producer";
}

export function verificationEmailHtml(code: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Seu código de verificação Kivo</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background:#ffffff;border:1px solid #e6e6e8;border-radius:14px;">
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 12px;font-size:20px;">Confirme seu e-mail</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#44444a;">
            Use o código abaixo para concluir a criação da sua conta na Kivo.
          </p>
          <div style="text-align:center;margin:0 0 20px;">
            <span style="display:inline-block;font-size:38px;letter-spacing:12px;font-weight:700;padding:16px 24px;background:#f2f2f4;border-radius:12px;">${code}</span>
          </div>
          <p style="margin:0 0 8px;font-size:14px;color:#44444a;">O código é válido por 10 minutos e pode ser usado uma única vez.</p>
          <p style="margin:0 0 24px;font-size:13px;color:#6b6b73;">
            Por segurança, nunca compartilhe este código. Se você não tentou criar uma conta na Kivo, ignore este e-mail.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 28px;font-size:12px;color:#8a8a92;">Kivo — kivohub.com.br</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function existingAccountEmailHtml(): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background:#ffffff;border:1px solid #e6e6e8;border-radius:14px;">
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:20px;">Você já tem uma conta Kivo</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#44444a;">
            Recebemos uma tentativa de cadastro com este e-mail, mas ele já possui conta ativa.
            Entre normalmente com e-mail e senha em kivohub.com.br.
          </p>
          <p style="margin:0;font-size:13px;color:#6b6b73;">
            Se você não lembra a senha, use a opção "Esqueci minha senha" na tela de login.
            Se não foi você, nenhuma ação é necessária.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendCodeEmail(
  opts: { to: string; subject: string; html: string; apiKey: string; from: string },
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({ from: opts.from, to: [opts.to], subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`resend_failed [${res.status}]: ${body}`);
  }
}
