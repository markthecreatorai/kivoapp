/**
 * resolveAuthSignupOutcome — mapper central de respostas de `supabase.auth.signUp`.
 *
 * Feature flag: auth_signup_existing_user_guard_v1
 *
 * Por que existe:
 *   Quando o Supabase Auth tem "Confirm email" habilitado, um signup com email
 *   já cadastrado **NÃO retorna error** — em vez disso devolve um objeto `user`
 *   com `identities: []` (medida anti-enumeração). Sem este mapper, o app cai
 *   no caminho feliz e leva o usuário pra /verify-email indevidamente.
 *
 * Outcomes:
 *   - success_pending_verification : conta criada, precisa confirmar email
 *   - success_active               : conta criada e já ativa (sem confirmação)
 *   - already_registered_confirmed : email já existe, conta confirmada → sugerir login/reset
 *   - already_registered_unconfirmed: email já existe, ainda não confirmado → sugerir reenvio
 *   - invalid_email                 : email rejeitado pelo Auth (formato/typo)
 *   - generic_error                 : outro erro
 */

export const SIGNUP_GUARD_FLAG = "auth_signup_existing_user_guard_v1";

export type SignupOutcomeKind =
  | "success_pending_verification"
  | "success_active"
  | "already_registered_confirmed"
  | "already_registered_unconfirmed"
  | "invalid_email"
  | "generic_error";

export interface SignupOutcome {
  kind: SignupOutcomeKind;
  /** ID do usuário, quando aplicável. */
  userId?: string;
  /** Mensagem PT-BR amigável para exibir. */
  message: string;
  /** Mensagem técnica (debug/log). */
  rawError?: string;
}

interface SignUpResponseLike {
  data?: {
    user?: {
      id?: string;
      email?: string | null;
      identities?: Array<unknown> | null;
      email_confirmed_at?: string | null;
      confirmed_at?: string | null;
    } | null;
    session?: { access_token?: string } | null;
  } | null;
  error?: {
    message?: string;
    status?: number;
    code?: string;
    name?: string;
  } | null;
}

const ALREADY_REGISTERED_PATTERNS = [
  /user already registered/i,
  /already registered/i,
  /already exists/i,
  /email.*already/i,
  /duplicate.*email/i,
  /user_already_exists/i,
];

const INVALID_EMAIL_PATTERNS = [
  /invalid.*email/i,
  /email.*invalid/i,
  /unable to validate email/i,
  /email_address_invalid/i,
];

function matches(text: string | undefined, patterns: RegExp[]): boolean {
  if (!text) return false;
  return patterns.some((re) => re.test(text));
}

export function resolveAuthSignupOutcome(
  response: SignUpResponseLike
): SignupOutcome {
  const error = response?.error;
  const user = response?.data?.user;
  const session = response?.data?.session;

  // 1) Erro explícito do Auth
  if (error) {
    const msg = error.message || error.code || "";
    if (matches(msg, ALREADY_REGISTERED_PATTERNS) || error.code === "user_already_exists") {
      return {
        kind: "already_registered_confirmed",
        message:
          "Este email já está cadastrado. Faça login ou redefina sua senha.",
        rawError: msg,
      };
    }
    if (matches(msg, INVALID_EMAIL_PATTERNS) || error.code === "email_address_invalid") {
      return {
        kind: "invalid_email",
        message:
          "Parece que esse email está com erro de digitação. Verifique antes de continuar.",
        rawError: msg,
      };
    }
    return {
      kind: "generic_error",
      message: msg || "Não foi possível criar a conta. Tente novamente.",
      rawError: msg,
    };
  }

  // 2) Sem erro mas sem user → algo deu errado silenciosamente
  if (!user) {
    return {
      kind: "generic_error",
      message: "Não foi possível criar a conta. Tente novamente.",
    };
  }

  // 3) Anti-enumeração do Supabase: user existe, identities vazio = já cadastrado
  // Quando "Confirm email" está ON e o email já existe, identities=[] e não vem session.
  const identities = user.identities;
  const hasIdentities = Array.isArray(identities) && identities.length > 0;
  const alreadyConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);

  if (!hasIdentities && !session) {
    // Já cadastrado. Distinguimos confirmado vs não-confirmado pelo timestamp.
    return {
      kind: alreadyConfirmed
        ? "already_registered_confirmed"
        : "already_registered_unconfirmed",
      userId: user.id,
      message: alreadyConfirmed
        ? "Este email já está cadastrado. Faça login ou redefina sua senha."
        : "Este email já está cadastrado mas ainda não foi confirmado. Reenvie o email de verificação.",
    };
  }

  // 4) Sucesso: ativo (sessão imediata) vs pendente de verificação
  if (session && alreadyConfirmed) {
    return {
      kind: "success_active",
      userId: user.id,
      message: "Conta criada com sucesso!",
    };
  }

  return {
    kind: "success_pending_verification",
    userId: user.id,
    message: "Conta criada! Verifique seu email para confirmar.",
  };
}

export const SIGNUP_OUTCOME_TELEMETRY: Record<SignupOutcomeKind, string> = {
  success_pending_verification: "auth.signup_success_pending",
  success_active: "auth.signup_success_active",
  already_registered_confirmed: "auth.signup_blocked_existing_confirmed",
  already_registered_unconfirmed: "auth.signup_blocked_existing_unconfirmed",
  invalid_email: "auth.signup_blocked_invalid_email",
  generic_error: "auth.signup_error",
};
