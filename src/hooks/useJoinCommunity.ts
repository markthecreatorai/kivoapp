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
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
    if (data.max_uses && data.uses_count >= data.max_uses) return null;
    return data;
  };

  /**
   * Insert member via SECURITY DEFINER RPC to bypass RLS.
   * Needed because after signUp with email confirmation,
   * auth.uid() is null until the user confirms their email.
   */
  const insertMember = async (
    communityId: string,
    userId: string,
    displayName: string,
    status: string
  ) => {
    const { error } = await supabase.rpc("join_community" as any, {
      p_community_id: communityId,
      p_user_id: userId,
      p_display_name: displayName,
      p_role: "MEMBER",
      p_status: status,
    });
    if (error && !error.message?.includes("duplicate") && !error.message?.includes("unique")) {
      throw error;
    }
  };

  // Sign up NEW member and join community
  const signupAndJoin = async (formData: JoinFormData, community: any) => {
    setIsLoading(true);
    try {
      // 1. Create Supabase Auth user
      //    is_creator = false → handle_new_user() will NOT create a workspace
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            display_name: formData.display_name,
            is_creator: false, // ← member, not a creator
          },
          emailRedirectTo: `${window.location.origin}/c/${communitySlug}/feed`,
        },
      });

      if (authError) {
        if (authError.message?.includes("already registered") || authError.message?.includes("User already registered")) {
          toast.error("Este email já está cadastrado. Faça login.");
          navigate(`/member/login?redirect=/c/${communitySlug}`);
          return;
        }
        throw authError;
      }
      if (!authData.user) throw new Error("Falha ao criar conta");

      const status = community.require_approval && !inviteCode ? "PENDING" : "ACTIVE";

      // 2. Insert into community_members via SECURITY DEFINER RPC (bypasses RLS)
      await insertMember(
        community.id,
        authData.user.id,
        formData.display_name || formData.email.split("@")[0],
        status
      );

      // 3. Increment invite uses_count if applicable
      if (inviteCode) {
        const invite = await validateInviteCode(community.id, inviteCode);
        if (invite) {
          await (supabase as any)
            .from("community_invite_links")
            .update({ uses_count: (invite.uses_count || 0) + 1 })
            .eq("id", invite.id);
        }
      }

      // 4. Feedback to user
      if (status === "PENDING") {
        toast.success("Conta criada! Sua entrada na comunidade aguarda aprovação.");
        navigate("/verify-email");
      } else {
        // If Supabase requires email confirmation before login (common):
        // We redirect to verify-email with a return path
        toast.success("Conta criada! Confirme seu email para acessar a comunidade.");
        navigate(`/verify-email?redirect=/c/${communitySlug}/feed`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Existing LOGGED-IN user joins a community
  const joinAsExistingUser = async (userId: string, community: any) => {
    setIsLoading(true);
    try {
      const status = community.require_approval && !inviteCode ? "PENDING" : "ACTIVE";

      // Use RPC to bypass potential RLS edge cases
      await insertMember(
        community.id,
        userId,
        "", // display_name will use existing profile
        status
      );

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
        navigate(`/c/${communitySlug}/feed`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao entrar na comunidade.");
    } finally {
      setIsLoading(false);
    }
  };

  return { fetchCommunity, signupAndJoin, joinAsExistingUser, isLoading };
}
