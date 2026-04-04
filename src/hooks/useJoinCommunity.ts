import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { trackEvent } from "@/lib/tracking";

interface JoinFormData {
  display_name: string;
  email: string;
  password: string;
}

type JoinAnswers = Array<{ question_id?: string; question: string; answer: string }>;

export function useJoinCommunity(communitySlug: string, inviteCode?: string, memberRefCode?: string) {
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

  // Validate invite code if provided (admin invite links)
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

  // Validate member invite ref code
  const validateMemberRef = async (code: string) => {
    const { data } = await (supabase as any)
      .from("member_invite_links")
      .select("id, member_id, community_id, code, uses_count, is_active")
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();
    return data;
  };

  // Grant invite bonus points with anti-fraud checks
  const grantInviteBonus = async (
    communityId: string,
    inviterMemberId: string,
    inviteeUserId: string,
    inviteLinkId: string,
    eventType: "joined" | "paid" = "joined"
  ) => {
    try {
      // Anti-fraud: check self-invite
      const { data: inviterMember } = await supabase
        .from("community_members")
        .select("user_id")
        .eq("id", inviterMemberId)
        .maybeSingle();

      if (inviterMember?.user_id === inviteeUserId) return; // self-invite blocked

      // Get reward config
      const { data: rewardConfig } = await (supabase as any)
        .from("invite_rewards")
        .select("*")
        .eq("community_id", communityId)
        .eq("is_active", true)
        .maybeSingle();

      if (!rewardConfig) return;

      const points = eventType === "paid"
        ? rewardConfig.points_per_paid_invite
        : rewardConfig.points_per_invite;

      // Insert event (unique constraint prevents duplicates)
      const { error: eventErr } = await (supabase as any)
        .from("invite_events")
        .insert({
          invite_link_id: inviteLinkId,
          inviter_member_id: inviterMemberId,
          invitee_user_id: inviteeUserId,
          community_id: communityId,
          event_type: eventType,
          points_awarded: points,
        });

      if (eventErr) {
        if (eventErr.message?.includes("duplicate") || eventErr.message?.includes("unique")) return;
        console.error("Invite event error:", eventErr);
        return;
      }

      // Award points to inviter
      if (points > 0) {
        const { data: currentMember } = await (supabase as any)
          .from("community_members")
          .select("total_points")
          .eq("id", inviterMemberId)
          .single();
        await (supabase as any)
          .from("community_members")
          .update({ total_points: (currentMember?.total_points || 0) + points })
          .eq("id", inviterMemberId);
      }

      // Increment uses_count on invite link
      await (supabase as any)
        .from("member_invite_links")
        .update({ uses_count: (await (supabase as any)
          .from("member_invite_links")
          .select("uses_count")
          .eq("id", inviteLinkId)
          .single()
          .then((r: any) => r.data?.uses_count || 0)) + 1
        })
        .eq("id", inviteLinkId);

      trackEvent("invite_bonus_granted", {
        community_id: communityId,
        inviter_member_id: inviterMemberId,
        event_type: eventType,
        points,
      });
    } catch (err) {
      console.error("Grant invite bonus error:", err);
    }
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
  const signupAndJoin = async (formData: JoinFormData, community: any, joinAnswers: JoinAnswers = []) => {
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
          emailRedirectTo: `${window.location.origin}/circles/${communitySlug}/feed`,
        },
      });

      if (authError) {
        if (authError.message?.includes("already registered") || authError.message?.includes("User already registered")) {
          toast.error("Este email já está cadastrado. Faça login.");
          navigate(`/member/login?redirect=/circles/${communitySlug}`);
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

      if (status === "PENDING" && joinAnswers.length > 0) {
        const { data: member } = await supabase
          .from("community_members")
          .select("id")
          .eq("community_id", community.id)
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (member?.id) {
          await (supabase as any).from("community_join_applications").insert({
            community_id: community.id,
            member_id: member.id,
            user_id: authData.user.id,
            status: "PENDING",
            answers: joinAnswers,
            invite_code: inviteCode || null,
          });
        }
      }

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

      // 4. Grant member invite bonus if ref code present
      if (memberRefCode && status === "ACTIVE") {
        const refLink = await validateMemberRef(memberRefCode);
        if (refLink && refLink.community_id === community.id) {
          await grantInviteBonus(
            community.id,
            refLink.member_id,
            authData.user.id,
            refLink.id,
            "joined"
          );
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
        navigate(`/verify-email?redirect=/circles/${communitySlug}/feed`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Existing LOGGED-IN user joins a community
  const joinAsExistingUser = async (userId: string, community: any, joinAnswers: JoinAnswers = []) => {
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

      if (status === "PENDING" && joinAnswers.length > 0) {
        const { data: member } = await supabase
          .from("community_members")
          .select("id")
          .eq("community_id", community.id)
          .eq("user_id", userId)
          .maybeSingle();

        if (member?.id) {
          await (supabase as any).from("community_join_applications").insert({
            community_id: community.id,
            member_id: member.id,
            user_id: userId,
            status: "PENDING",
            answers: joinAnswers,
            invite_code: inviteCode || null,
          });
        }
      }

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
        navigate(`/circles/${communitySlug}/feed`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao entrar na comunidade.");
    } finally {
      setIsLoading(false);
    }
  };

  return { fetchCommunity, signupAndJoin, joinAsExistingUser, isLoading };
}
