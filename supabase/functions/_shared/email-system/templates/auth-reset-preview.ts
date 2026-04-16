import { baseEmailLayout } from "../layout.ts";
import { ctaPrimary, emailText, emailTitle, securityAlertBox } from "../components.ts";

export function authResetPreviewTemplate(): string {
  const body = [
    emailTitle("Redefinir senha"),
    emailText("Recebemos um pedido para alterar sua senha. Para continuar, use o botão abaixo."),
    ctaPrimary("Criar nova senha", "https://www.kivohub.com.br/reset-password"),
    securityAlertBox(
      "Dica de segurança",
      "Se você não solicitou esta alteração, ignore este e-mail e revise a segurança da sua conta."
    ),
  ].join("\n");

  return baseEmailLayout({
    preheader: "Redefinição de senha Kivo",
    bodyHtml: body,
  });
}
