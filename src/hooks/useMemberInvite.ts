import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InviteLink {
  id: string;
  code: string;
  uses_count: number;
  is_active: boolean;
  created_at: string;
}

interface InviteEvent {
  id: string;
  invitee_user_id: string;
  event_type: string;
  points_awarded: number;
  created_at: string;
}

export function useMemberInvite(communityId: string, memberId: string, slug: string) {
  const queryClient = useQueryClient();

  // Get or create personal invite link
  const { data: inviteLink, isLoading } = useQuery({
    queryKey: ["member-invite-link", communityId, memberId],
    enabled: !!communityId && !!memberId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("member_invite_links")
        .select("id, code, uses_count, is_active, created_at")
        .eq("member_id", memberId)
        .eq("community_id", communityId)
        .maybeSingle();
      return data as InviteLink | null;
    },
  });

  // List invite events for this member
  const { data: inviteEvents = [] } = useQuery({
    queryKey: ["invite-events", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("invite_events")
        .select("id, invitee_user_id, event_type, points_awarded, created_at")
        .eq("inviter_member_id", memberId)
        .order("created_at", { ascending: false });
      return (data || []) as InviteEvent[];
    },
  });

  // Get reward config for community
  const { data: rewardConfig } = useQuery({
    queryKey: ["invite-rewards", communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("invite_rewards")
        .select("*")
        .eq("community_id", communityId)
        .maybeSingle();
      return data;
    },
  });

  // Create personal invite link
  const createInviteLink = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any)
        .from("member_invite_links")
        .insert({
          member_id: memberId,
          community_id: communityId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["member-invite-link", communityId, memberId] });
      toast.success("Link de convite criado!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const copyLink = () => {
    if (!inviteLink) return;
    const url = `${window.location.origin}/join/${slug}?ref=${inviteLink.code}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copiado!"));
  };

  const totalPointsEarned = inviteEvents.reduce((sum, e) => sum + (e.points_awarded || 0), 0);
  const totalInvited = inviteEvents.filter((e) => e.event_type === "joined").length;

  return {
    inviteLink,
    inviteEvents,
    rewardConfig,
    isLoading,
    createInviteLink,
    copyLink,
    totalPointsEarned,
    totalInvited,
  };
}
