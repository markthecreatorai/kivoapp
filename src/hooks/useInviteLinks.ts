import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useInviteLinks(communityId: string, createdBy: string) {
  const queryClient = useQueryClient();

  const { data: inviteLinks = [], isLoading } = useQuery({
    queryKey: ["invite-links", communityId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("community_invite_links")
        .select("*")
        .eq("community_id", communityId)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!communityId,
  });

  const createLink = useMutation({
    mutationFn: async (opts: { max_uses?: number; expires_at?: string }) => {
      const { data, error } = await (supabase as any)
        .from("community_invite_links")
        .insert({
          community_id: communityId,
          created_by: createdBy,
          max_uses: opts.max_uses || null,
          expires_at: opts.expires_at || null,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite-links", communityId] });
      toast.success("Link de convite criado!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deactivateLink = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await (supabase as any)
        .from("community_invite_links")
        .update({ is_active: false })
        .eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite-links", communityId] });
      toast.success("Link desativado.");
    },
  });

  const copyLink = (code: string, slug: string) => {
    const url = `${window.location.origin}/join/${slug}?invite=${code}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copiado!"));
  };

  return { inviteLinks, isLoading, createLink, deactivateLink, copyLink };
}
