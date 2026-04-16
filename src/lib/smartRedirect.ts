import { supabase } from "@/integrations/supabase/client";

/**
 * Determines the best landing page for the current user based on their profile.
 * 
 * Priority:
 * 1. Nav intent from community modal → community feed
 * 2. Has workspace (creator) → /dashboard
 * 3. Has community membership (consumer) → /circles
 * 4. Has entitlements (buyer) → /member
 * 5. Fallback → /circles/explore
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

  // 2. Check workspace (creator)
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .limit(1) as { data: any[] | null };
  if (ws && ws.length > 0) return "/dashboard";

  // 3. Check community membership (consumer)
  const { data: memberships } = await (supabase
    .from("community_members")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .limit(1) as any) as { data: any[] | null };
  if (memberships && memberships.length > 0) return "/circles";

  // 4. Check entitlements (buyer)
  const { data: entitlements } = await supabase
    .from("user_asset_entitlements")
    .select("id")
    .eq("user_id", userId)
    .limit(1) as { data: any[] | null };
  if (entitlements && entitlements.length > 0) return "/member";

  // 5. Fallback
  return "/circles/explore";
}

/**
 * Checks whether a user is a consumer (has memberships or entitlements but no workspace).
 * Used by ProtectedRoute to avoid forcing onboarding for consumers.
 */
export async function isConsumerOnly(userId: string): Promise<boolean> {
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .limit(1);
  if (ws && ws.length > 0) return false; // Has workspace = creator

  const { data: memberships } = await supabase
    .from("community_members")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .limit(1);
  if (memberships && memberships.length > 0) return true;

  const { data: entitlements } = await supabase
    .from("user_asset_entitlements")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (entitlements && entitlements.length > 0) return true;

  return false;
}
