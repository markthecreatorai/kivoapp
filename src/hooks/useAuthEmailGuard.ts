import { useCallback, useState } from "react";
import { trackEvent } from "@/lib/tracking";
import { validateAuthEmail, type AuthEmailValidationResult } from "@/lib/authEmailGuard";

/**
 * Hook compartilhado para forms de auth (signup/login/reset/resend/magic-link).
 * - Mantém estado de erro inline + sugestão "Você quis dizer X?"
 * - `guard()` valida e dispara telemetria `auth.email_invalid_blocked`.
 */
export function useAuthEmailGuard(eventLabel: string = "auth_form") {
  const [emailError, setEmailError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const reset = useCallback(() => {
    setEmailError(null);
    setSuggestion(null);
  }, []);

  /**
   * Valida o email cru. Retorna o resultado para o caller decidir o fluxo.
   * Em caso de inválido, já popula estado de erro + sugestão.
   */
  const guard = useCallback(
    (raw: string): AuthEmailValidationResult => {
      const r = validateAuthEmail(raw);
      if (!r.ok) {
        setEmailError(r.error || "Email inválido");
        setSuggestion(r.suggestion || null);
        try {
          trackEvent("auth.email_invalid_blocked", {
            form: eventLabel,
            has_suggestion: Boolean(r.suggestion),
          });
        } catch {
          /* noop */
        }
      } else {
        setEmailError(null);
        setSuggestion(null);
      }
      return r;
    },
    [eventLabel]
  );

  return { emailError, suggestion, guard, reset, setEmailError, setSuggestion };
}
