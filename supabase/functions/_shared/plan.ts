/**
 * Single source of truth mapping: workspaces.plan (FREE | CREATOR | CREATOR_PRO)
 * -> fee_config.plan_type tier ('creator' | 'creator_pro').
 * FREE creators are billed on the 'creator' fee tier.
 */
export type WorkspacePlan = "FREE" | "CREATOR" | "CREATOR_PRO";

export function feeTierForPlan(plan?: string | null): "creator" | "creator_pro" {
  return String(plan || "FREE").toUpperCase() === "CREATOR_PRO" ? "creator_pro" : "creator";
}
