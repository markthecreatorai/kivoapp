// Orquestração pura (testável) da confirmação de e-mail por código de 4 dígitos.
//
// Regras (hardening v2):
// 1. TODAS as pré-condições acontecem ANTES do consumo do código e são
//    idempotentes: (a) confirmar e-mail via Admin API, (b) ler o account type
//    da fonte autorizada no banco, (c) se PRODUCER, garantir a workspace.
// 2. Qualquer falha nessas etapas => `temporarily_unavailable` (503) e o código
//    permanece VÁLIDO e reutilizável. Nunca há downgrade silencioso para MEMBER.
// 3. Só depois o código é consumido atomicamente
//    (update ... where consumed_at is null). Erro no consumo também é 503 —
//    nunca sucesso. `already_consumed` é replay legítimo e responde 200.
// 4. Concorrência: as pré-condições são idempotentes (a unicidade da workspace
//    é garantida por advisory lock dentro de ensure_producer_workspace_for),
//    portanto duas confirmações simultâneas não produzem efeitos duplicados.

/** Resultado explícito do consumo atômico do código. */
export type ConsumeResult = "consumed" | "already_consumed" | "error";

/** Leitura da fonte autorizada do tipo de conta. Ausência/erro => falha segura. */
export type AccountTypeResult =
  | { ok: true; accountType: "PRODUCER" | "MEMBER" }
  | { ok: false; reason: "missing" | "error" };

export type ConfirmDeps = {
  /** Confirma o e-mail no Auth. Idempotente. */
  confirmUser: (userId: string) => Promise<{ error?: { message: string } | null }>;
  /** Consome o código atomicamente, distinguindo replay de erro real. */
  consumeCode: (codeId: string) => Promise<ConsumeResult>;
  /** Tipo de conta lido do banco (nunca do cliente). */
  getAccountType: (userId: string) => Promise<AccountTypeResult>;
  /** Cria/garante a workspace do produtor. Idempotente. */
  ensureProducerWorkspace: (userId: string) => Promise<{ error?: { message: string } | null }>;
};

export type ConfirmOutcome =
  | {
    ok: true;
    status: 200;
    accountType: "PRODUCER" | "MEMBER";
    /** true quando esta requisição foi a que consumiu o código. */
    consumed: boolean;
    workspaceEnsured: boolean;
  }
  | { ok: false; status: 503; reason: "temporarily_unavailable" };

const RETRY: ConfirmOutcome = { ok: false, status: 503, reason: "temporarily_unavailable" };

export async function confirmAndConsume(
  deps: ConfirmDeps,
  input: { codeId: string; userId: string },
): Promise<ConfirmOutcome> {
  // (a) confirmar e-mail — idempotente
  const { error: confirmErr } = await deps.confirmUser(input.userId);
  if (confirmErr) return RETRY;

  // (b) tipo de conta — erro ou linha ausente NUNCA cai para MEMBER
  const account = await deps.getAccountType(input.userId);
  if (!account.ok) return RETRY;

  // (c) workspace do produtor — idempotente, antes do consumo
  let workspaceEnsured = false;
  if (account.accountType === "PRODUCER") {
    const { error } = await deps.ensureProducerWorkspace(input.userId);
    if (error) return RETRY;
    workspaceEnsured = true;
  }

  // (d) consumo atômico por último
  const consume = await deps.consumeCode(input.codeId);
  if (consume === "error") return RETRY;

  return {
    ok: true,
    status: 200,
    accountType: account.accountType,
    consumed: consume === "consumed",
    workspaceEnsured,
  };
}
