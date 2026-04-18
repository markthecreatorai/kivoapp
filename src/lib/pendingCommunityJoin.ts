import { supabase } from "@/integrations/supabase/client";

const PENDING_COMMUNITY_JOIN_KEY = "kivo_pending_community_join";

export type PendingCommunityJoinAnswer = {
  question_id?: string;
  question: string;
  answer: string;
};

export type PendingCommunityJoinPayload = {
  communityId: string;
  communitySlug: string;
  displayName: string;
  status: "ACTIVE" | "PENDING";
  inviteCode?: string;
  joinAnswers?: PendingCommunityJoinAnswer[];
};

export function savePendingCommunityJoin(payload: PendingCommunityJoinPayload) {
  sessionStorage.setItem(PENDING_COMMUNITY_JOIN_KEY, JSON.stringify(payload));
}

export function getPendingCommunityJoin(): PendingCommunityJoinPayload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_COMMUNITY_JOIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingCommunityJoin() {
  sessionStorage.removeItem(PENDING_COMMUNITY_JOIN_KEY);
}

async function syncPendingJoinApplication(
  communityId: string,
  userId: string,
  joinAnswers: PendingCommunityJoinAnswer[],
  inviteCode?: string
) {
  const { data: member } = await supabase
    .from("community_members")
    .select("id")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member?.id) return;

  const { data: existingApplication } = await (supabase as any)
    .from("community_join_applications")
    .select("id")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingApplication?.id) return;

  await (supabase as any).from("community_join_applications").insert({
    community_id: communityId,
    member_id: member.id,
    user_id: userId,
    status: "PENDING",
    answers: joinAnswers,
    invite_code: inviteCode || null,
  });
}

async function incrementInviteUsage(communityId: string, inviteCode?: string) {
  if (!inviteCode) return;

  const { data: invite } = await (supabase as any)
    .from("community_invite_links")
    .select("id, uses_count, expires_at, max_uses, is_active")
    .eq("community_id", communityId)
    .eq("code", inviteCode)
    .eq("is_active", true)
    .maybeSingle();

  if (!invite) return;
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return;
  if (invite.max_uses && invite.uses_count >= invite.max_uses) return;

  await (supabase as any)
    .from("community_invite_links")
    .update({ uses_count: (invite.uses_count || 0) + 1 })
    .eq("id", invite.id);
}

export async function completePendingCommunityJoin(userId: string) {
  const pending = getPendingCommunityJoin();
  if (!pending) return null;

  const { error } = await supabase.rpc("join_community" as any, {
    p_community_id: pending.communityId,
    p_user_id: userId,
    p_display_name: pending.displayName,
    p_role: "MEMBER",
    p_status: pending.status,
  });

  if (error && !error.message?.includes("duplicate") && !error.message?.includes("unique")) {
    throw error;
  }

  if (pending.status === "PENDING" && pending.joinAnswers?.length) {
    await syncPendingJoinApplication(pending.communityId, userId, pending.joinAnswers, pending.inviteCode);
  }

  await incrementInviteUsage(pending.communityId, pending.inviteCode);
  clearPendingCommunityJoin();

  return {
    communitySlug: pending.communitySlug,
    status: pending.status,
  };
}
