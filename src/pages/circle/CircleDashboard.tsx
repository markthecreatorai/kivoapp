import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Users, Trophy, Calendar, ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

export default function CircleDashboard() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: community, isLoading } = useQuery({
    queryKey: ["community", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase
        .from("communities")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentWorkspace,
  });

  // Redirect to feed if community exists
  useEffect(() => {
    if (community?.slug) {
      navigate(`/circles/${community.slug}/feed`, { replace: true });
    }
  }, [community, navigate]);

  const createCommunity = useMutation({
    mutationFn: async () => {
      if (!currentWorkspace || !user) throw new Error("Missing data");

      const slug = currentWorkspace.slug + "-circle";

      // Upsert: idempotent — ignores if already exists
      const { data: community, error } = await supabase
        .from("communities")
        .upsert(
          {
            workspace_id: currentWorkspace.id,
            name: currentWorkspace.name + " Circle",
            slug,
            description: "Comunidade oficial",
            access_type: "OPEN",
          },
          { onConflict: "workspace_id" }
        )
        .select("id,slug")
        .single();

      if (error) throw error;

      // Add creator as OWNER via RPC (has ON CONFLICT DO NOTHING)
      await supabase.rpc("join_community", {
        p_community_id: community.id,
        p_user_id: user.id,
        p_display_name: user.email?.split("@")[0] || "Creator",
        p_role: "OWNER",
        p_status: "ACTIVE",
      });

      // Create 4 default spaces (ignore duplicates silently)
      const defaultSpaces = [
        { community_id: community.id, name: "Geral", slug: "geral", emoji: "💬", is_default: true, position: 0 },
        { community_id: community.id, name: "Anúncios", slug: "anuncios", emoji: "📢", only_admins_can_post: true, position: 1 },
        { community_id: community.id, name: "Perguntas", slug: "perguntas", emoji: "❓", position: 2 },
        { community_id: community.id, name: "Conquistas", slug: "conquistas", emoji: "🏆", position: 3 },
      ];

      await supabase.from("community_spaces").upsert(defaultSpaces, { onConflict: "community_id,slug", ignoreDuplicates: true });

      return community;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community"] });
      queryClient.invalidateQueries({ queryKey: ["circle-member"] });
      toast.success("Comunidade criada com sucesso!");
    },
    onError: (err: any) => {
      if (err?.message?.includes("uq_community_workspace") || err?.code === "23505") {
        queryClient.invalidateQueries({ queryKey: ["community", currentWorkspace?.id] });
        toast.info("Comunidade já existe! Redirecionando...");
      } else {
        toast.error("Erro ao criar comunidade");
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // No community yet - show creation screen
  if (!community) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center mt-20">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Kivo Circles</h1>
        <p className="text-muted-foreground mt-2 mb-6">
          Crie uma comunidade engajada para seus membros. Feed de posts, espaços, gamificação, eventos e muito mais.
        </p>
        <Button size="lg" onClick={() => createCommunity.mutate()} disabled={createCommunity.isPending}>
          <Plus className="h-5 w-5 mr-2" />
          Criar Comunidade
        </Button>
      </div>
    );
  }

  // Will redirect to feed via useEffect
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}
