/**
 * Traduz erros de limite de plano vindos do banco (trigger enforce_plan_product_limit)
 * para mensagens claras em PT-BR. O limite é validado no servidor, portanto o erro
 * pode chegar mesmo quando a UI achava que havia espaço.
 */
export const PLAN_LIMIT_PRODUCTS_CODE = "PLAN_LIMIT_PRODUCTS";

export interface PlanErrorInfo {
  isPlanLimit: boolean;
  title: string;
  description: string;
}

export function describePlanError(error: unknown): PlanErrorInfo {
  const message =
    (typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "")) || "";

  if (message.includes(PLAN_LIMIT_PRODUCTS_CODE)) {
    const match = message.match(/permite (\d+) produto/);
    const max = match?.[1];
    return {
      isPlanLimit: true,
      title: "Limite do plano atingido",
      description: max
        ? `Seu plano atual permite ${max} produto(s). Faça upgrade para criar mais.`
        : "Seu plano atual não permite criar mais produtos. Faça upgrade para continuar.",
    };
  }

  return {
    isPlanLimit: false,
    title: "Não foi possível concluir",
    description: message || "Tente novamente em instantes.",
  };
}
