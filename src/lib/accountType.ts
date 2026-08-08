import { supabase } from "@/integrations/supabase/client";

export type AccountType = "PRODUCER" | "MEMBER";

/**
 * Fonte de verdade do tipo de conta (infoprodutor vs membro).
 * Usada APENAS para decidir a rota inicial pós-login/pós-signup e a criação
 * de workspace. Guards de área continuam lendo as tabelas reais
 * (workspace_members / community_members), então os dois papéis coexistem.
 */
export async function getAccountType(userId: string): Promise<AccountType | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("user_account_types")
      .select("account_type")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    const value = data?.account_type;
    return value === "PRODUCER" || value === "MEMBER" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Upgrade in-app: cria (idempotente) o workspace do usuário e promove a conta
 * para PRODUCER. Retorna o workspace_id.
 */
export async function ensureProducerWorkspace(): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc("ensure_producer_workspace");
  if (error) throw error;
  return (data as string) ?? null;
}
