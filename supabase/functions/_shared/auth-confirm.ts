// Orquestração pura (testável) da confirmação de e-mail por código de 4 dígitos.
//
// Regras:
// 1. Confirmar o usuário via Admin API ANTES de consumir o código. A confirmação
//    é idempotente, então repetir é seguro.
// 2. Falha transitória da Admin API => `temporarily_unavailable` e o código
//    permanece válido (não consumido, não invalidado).
// 3. O consumo é atômico (update ... where consumed_at is null). Somente a
//    requisição que ganhou a corrida executa efeitos colaterais (workspace),
//    de modo que replay/concorrência não duplica nada.

export type ConfirmDeps = {
  /** Confirma o e-mail no Auth. Idempotente. */
  confirmUser: (userId: string) => Promise<{ error?: { message: string } | null }>;
  /** Consome o código atomicamente. Retorna false se já estava consumido. */
  consumeCode: (codeId: string) => Promise<boolean>;
  /** Tipo de conta lido do banco (nunca do cliente). */
  getAccountType: (userId: string) => Promise<"PRODUCER" | "MEMBER">;
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

export async function confirmAndConsume(
  deps: ConfirmDeps,
  input: { codeId: string; userId: string },
): Promise<ConfirmOutcome> {
  const { error: confirmErr } = await deps.confirmUser(input.userId);
  if (confirmErr) {
    return { ok: false, status: 503, reason: "temporarily_unavailable" };
  }

  const consumed = await deps.consumeCode(input.codeId);
  const accountType = await deps.getAccountType(input.userId);

  let workspaceEnsured = false;
  if (consumed && accountType === "PRODUCER") {
    const { error } = await deps.ensureProducerWorkspace(input.userId);
    workspaceEnsured = !error;
  }

  return { ok: true, status: 200, accountType, consumed, workspaceEnsured };
}
