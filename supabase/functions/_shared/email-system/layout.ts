import { KIVO_EMAIL_TOKENS as t } from "./tokens.ts";
import { emailFooter, emailHeader } from "./components.ts";

export type BaseEmailLayoutInput = {
  bodyHtml: string;
  preheader?: string;
  logoUrl?: string;
};

export function baseEmailLayout({ bodyHtml, preheader, logoUrl }: BaseEmailLayoutInput): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Kivo Email</title>
  </head>
  <body style="margin:0;padding:0;background:${t.background.page};font-family:${t.typography.fontFamily};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader ?? "Notificação da Kivo"}</div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${t.background.page};padding:${t.spacing.lg} ${t.spacing.sm};">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${t.container.maxWidth}px;background:${t.background.card};border:1px solid ${t.border.default};border-radius:${t.radius.lg};overflow:hidden;">
            ${emailHeader(logoUrl)}
            <tr>
              <td style="padding:0 ${t.spacing.xl} ${t.spacing.xl};">
                ${bodyHtml}
              </td>
            </tr>
            ${emailFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
