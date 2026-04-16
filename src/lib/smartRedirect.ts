import { supabase } from "@/integrations/supabase/client";

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
  // 1. Check nav intent (community auth flow)
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

  // 2. Has workspace → creator
  if (await queryIds("workspaces", { owner_id: userId })) return "/dashboard";

  // 3. Has community membership → consumer hub
  if (await queryIds("community_members", { user_id: userId, status: "ACTIVE" })) return "/circles";

  // 4. Has entitlements → buyer area
  if (await queryIds("user_asset_entitlements", { user_id: userId })) return "/member";

  // 5. Fallback
  return "/circles/explore";
}

/**
 * Checks whether a user is a consumer (has memberships or entitlements but no workspace).
 */
export async function isConsumerOnly(userId: string): Promise<boolean> {
  if (await queryIds("workspaces", { owner_id: userId })) return false;
  if (await queryIds("community_members", { user_id: userId, status: "ACTIVE" })) return true;
  if (await queryIds("user_asset_entitlements", { user_id: userId })) return true;
  return false;
}
