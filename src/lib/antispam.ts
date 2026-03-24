import { supabase } from "@/integrations/supabase/client";

// Simple hash for content comparison
function simpleHash(str: string): string {
  return str.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
}

interface SpamCheckResult {
  allowed: boolean;
  reason?: string;
  cooldownSeconds?: number;
}

/**
 * Check if a member can post/comment based on rate limits and flood detection.
 * Rules:
 * - Max 5 posts per 5 minutes
 * - Max 10 comments per 5 minutes
 * - No duplicate content within 2 minutes
 * - Progressive cooldown: 2nd violation = 2min, 3rd = 5min, 4th+ = 15min
 */
export async function checkSpam(
  memberId: string,
  communityId: string,
  actionType: "post" | "comment",
  content: string
): Promise<SpamCheckResult> {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

  // Get recent spam log entries
  const { data: recentEntries } = await supabase
    .from("community_spam_log" as any)
    .select("*")
    .eq("member_id", memberId)
    .gte("created_at", fiveMinAgo)
    .order("created_at", { ascending: false });

  const entries = (recentEntries as any[]) || [];

  // Rate limit check
  const sameTypeEntries = entries.filter((e: any) => e.action_type === actionType);
  const maxRate = actionType === "post" ? 5 : 10;

  if (sameTypeEntries.length >= maxRate) {
    const violationCount = entries.filter((e: any) => e.action_type === "rate_limit_hit").length;
    const cooldown = violationCount >= 3 ? 900 : violationCount >= 2 ? 300 : violationCount >= 1 ? 120 : 60;

    // Log violation
    await supabase.from("community_spam_log" as any).insert({
      member_id: memberId,
      community_id: communityId,
      action_type: "rate_limit_hit",
      content_hash: `${actionType}_rate`,
    } as any);

    return {
      allowed: false,
      reason: `Você está enviando muitas mensagens. Aguarde ${Math.ceil(cooldown / 60)} minuto(s).`,
      cooldownSeconds: cooldown,
    };
  }

  // Duplicate content check
  const contentHash = simpleHash(content);
  const recentDuplicates = entries.filter(
    (e: any) => e.content_hash === contentHash && e.created_at >= twoMinAgo
  );

  if (recentDuplicates.length > 0) {
    return {
      allowed: false,
      reason: "Conteúdo duplicado detectado. Tente algo diferente.",
    };
  }

  // Log this action
  await supabase.from("community_spam_log" as any).insert({
    member_id: memberId,
    community_id: communityId,
    action_type: actionType,
    content_hash: contentHash,
  } as any);

  return { allowed: true };
}
