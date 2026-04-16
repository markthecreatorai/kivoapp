import { KIVO_EMAIL_TOKENS as t } from "./tokens.ts";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailHeader(logoUrl?: string): string {
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="Kivo" width="92" style="display:block;border:0;outline:none;text-decoration:none;" />`
    : `<div style="font-weight:700;font-size:22px;color:${t.text.primary};letter-spacing:0.2px;">Kivo</div>`;

  return `
    <tr>
      <td style="padding:${t.spacing.xl} ${t.spacing.xl} ${t.spacing.lg};text-align:left;">${logo}</td>
    </tr>
  `;
}

export function emailTitle(text: string): string {
  return `<h1 style="margin:0 0 ${t.spacing.md};font-size:${t.typography.titleSize};line-height:1.2;color:${t.text.primary};font-weight:700;">${escapeHtml(text)}</h1>`;
}

export function emailText(text: string): string {
  return `<p style="margin:0 0 ${t.spacing.md};font-size:${t.typography.bodySize};line-height:${t.typography.lineHeight};color:${t.text.secondary};">${escapeHtml(text)}</p>`;
}

export function ctaPrimary(label: string, href: string): string {
  return `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:${t.spacing.md} 0;">
    <tr>
      <td style="border-radius:${t.radius.md};background:${t.button.primaryBg};text-align:center;">
        <a href="${href}" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:600;color:${t.button.primaryText};text-decoration:none;border-radius:${t.radius.md};">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

export function ctaSecondary(label: string, href: string): string {
  return `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:${t.spacing.md} 0;">
    <tr>
      <td style="border-radius:${t.radius.md};background:${t.button.secondaryBg};border:1px solid ${t.button.border};text-align:center;">
        <a href="${href}" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:600;color:${t.button.secondaryText};text-decoration:none;border-radius:${t.radius.md};">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

export function securityAlertBox(title: string, message: string): string {
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:${t.spacing.md} 0;border:1px solid ${t.border.strong};background:${t.background.muted};border-radius:${t.radius.md};">
    <tr>
      <td style="padding:${t.spacing.md};">
        <p style="margin:0 0 ${t.spacing.xs};font-size:14px;font-weight:700;color:${t.text.primary};">${escapeHtml(title)}</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:${t.text.secondary};">${escapeHtml(message)}</p>
      </td>
    </tr>
  </table>`;
}

export function emailFooter(): string {
  return `
  <tr>
    <td style="padding:${t.spacing.lg} ${t.spacing.xl} ${t.spacing.xl};border-top:1px solid ${t.border.default};text-align:left;">
      <p style="margin:0 0 ${t.spacing.xs};font-size:${t.typography.smallSize};color:${t.text.secondary};">Kivo — Plataforma para creators</p>
      <p style="margin:0;font-size:${t.typography.smallSize};color:${t.text.secondary};">© ${new Date().getFullYear()} Kivo. Todos os direitos reservados.</p>
    </td>
  </tr>`;
}
