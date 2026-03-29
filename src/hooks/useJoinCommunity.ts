import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface JoinFormData {
  display_name: string;
  email: string;
  password: string;
}

export function useJoinCommunity(communitySlug: string, inviteCode?: string) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  // Fetch community data by slug
  const fetchCommunity = async () => {
    const { data, error } = await supabase
      .from("communities")
      .select("*")
      .eq("slug", communitySlug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  // Validate invite code if provided
  const validateInviteCode = async (communityId: string, code: string) => {
    const { data } = await (supabase as any)
      .from("community_invite_links")
      .select("*")
      .eq("community_id", communityId)
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();
    if (!data) return null;
    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
    // Check max uses
    if (data.max_uses && data.uses_count >= data.max_uses) return null;
    return data;
  };

  // Sign up new member and join community
  const signupAndJoin = async (formData: JoinFormData, community: any) => {
    setIsLoading(true);
    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: { display_name: formData.display_name },
          emailRedirectTo: `${window.location.origin}/circle/feed`,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Falha ao criar conta");

      // 2. Determine status — invite code bypasses require_approval
      let status = "ACTIVE";
      if (community.require_approval && !inviteCode) {
        status = "PENDING";
      }

      // 3. Add to community_members
      const { error: memberError } = await (supabase as any).from("community_members").insert({
        community_id: community.id,
        user_id: authData.user.id,
        role: "MEMBER",
        status,
        display_name: formData.display_name || formData.email.split("@")[0],
      });

      if (memberError) {
        // Member might already exist (e.g., existing user joining)
        if (!memberError.message?.includes("duplicate")) throw memberError;
      }

      // 4. Increment invite uses_count if applicable
      if (inviteCode) {
        const invite = await validateInviteCode(community.id, inviteCode);
        if (invite) {
          await (supabase as any)
            .from("community_invite_links")
            .update({ uses_count: (invite.uses_count || 0) + 1 })
            .eq("id", invite.id);
        }
      }

      if (status === "PENDING") {
        toast.success("Conta criada! Sua entrada na comunidade aguarda aprovação.");
        navigate("/verify-email");
      } else {
        toast.success("Bem-vindo! Confirme seu email para continuar.");
        navigate("/verify-email");
      }
    } catch (err: any) {
      if (err.message?.includes("already registered")) {
        toast.error("Este email já está cadastrado. Faça login.");
        navigate(`/member/login?redirect=/join/${communitySlug}`);
      } else {
        toast.error(err.message || "Erro ao criar conta. Tente novamente.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Existing user join a community
  const joinAsExistingUser = async (userId: string, community: any) => {
    setIsLoading(true);
    try {
      let status = "ACTIVE";
      if (community.require_approval && !inviteCode) status = "PENDING";

      const { error } = await (supabase as any).from("community_members").insert({
        community_id: community.id,
        user_id: userId,
        role: "MEMBER",
        status,
      });

      if (error && !error.message?.includes("duplicate")) throw error;

      if (inviteCode) {
        const invite = await validateInviteCode(community.id, inviteCode);
        if (invite) {
          await (supabase as any)
            .from("community_invite_links")
            .update({ uses_count: (invite.uses_count || 0) + 1 })
            .eq("id", invite.id);
        }
      }

      if (status === "PENDING") {
        toast.success("Solicitação enviada! Aguarde aprovação.");
      } else {
        toast.success("Bem-vindo à comunidade!");
        navigate("/circle/feed");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao entrar na comunidade.");
    } finally {
      setIsLoading(false);
    }
  };

  return { fetchCommunity, signupAndJoin, joinAsExistingUser, isLoading };
}
