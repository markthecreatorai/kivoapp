import { supabase } from "@/integrations/supabase/client";
import { getAccountType } from "@/lib/accountType";

type QR = { data: any[] | null };

async function queryIds(table: string, filters: Record<string, string>): Promise<boolean> {
  let q = (supabase as any).from(table).select("id").limit(1);
  for (const [k, v] of Object.entries(filters)) {
    q = q.eq(k, v);
  }
  const { data } = (await q) as QR;
  return !!(data && data.length > 0);
}

/**
 * Determines the best landing page for the current user based on their profile.
 */
export async function resolveSmartRedirect(userId: string): Promise<string> {
  // 1. Check nav intent (community auth flow) — always wins
  try {
    const raw = sessionStorage.getItem("kivo_nav_intent");
    if (raw) {
      const intent = JSON.parse(raw);
      sessionStorage.removeItem("kivo_nav_intent");
      if (intent.origin === "community" && intent.community_slug) {
        return `/circles/${intent.community_slug}/feed`;
      }
    }
  } catch {}

  // 2. Tipo de conta explícito é a fonte de verdade para o destino inicial
  const accountType = await getAccountType(userId);

  if (accountType === "MEMBER") {
    if (await queryIds("community_members", { user_id: userId, status: "ACTIVE" })) return "/circles";
    if (await queryIds("user_asset_entitlements", { user_id: userId })) return "/member";
    return "/circles/explore";
  }

  if (accountType === "PRODUCER") {
    if (await queryIds("workspace_members", { user_id: userId })) return "/dashboard";
    return "/onboarding";
  }

  // 3. Sem tipo de conta (conta legada) → inferência pelas tabelas reais
  if (await queryIds("workspace_members", { user_id: userId })) return "/dashboard";
  if (await queryIds("community_members", { user_id: userId, status: "ACTIVE" })) return "/circles";
  if (await queryIds("user_asset_entitlements", { user_id: userId })) return "/member";
  return "/circles/explore";
}

/**
 * Checks whether a user is a consumer (member account or memberships/entitlements
 * without a producer workspace).
 */
export async function isConsumerOnly(userId: string): Promise<boolean> {
  if (await queryIds("workspace_members", { user_id: userId })) return false;
  if ((await getAccountType(userId)) === "MEMBER") return true;
  if (await queryIds("community_members", { user_id: userId, status: "ACTIVE" })) return true;
  if (await queryIds("user_asset_entitlements", { user_id: userId })) return true;
  return false;
}
