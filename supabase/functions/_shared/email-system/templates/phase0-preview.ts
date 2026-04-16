import { baseEmailLayout } from "../layout.ts";
import { ctaPrimary, ctaSecondary, emailText, emailTitle, securityAlertBox } from "../components.ts";

export function phase0PreviewTemplate(): string {
  const body = [
    emailTitle("Bem-vindo(a) à Kivo"),
    emailText("Essa é a base visual dos e-mails transacionais da Kivo. Ela é premium, limpa e pronta para reutilizar nos próximos templates."),
    ctaPrimary("Acessar painel", "https://www.kivohub.com.br/dashboard"),
    ctaSecondary("Ver documentação", "https://docs.openclaw.ai"),
    securityAlertBox("Dica de segurança", "Nunca compartilhe sua senha. A Kivo não solicita senha por e-mail."),
  ].join("\n");

  return baseEmailLayout({
    preheader: "Base visual de e-mails Kivo pronta para reutilização",
    bodyHtml: body,
  });
}
