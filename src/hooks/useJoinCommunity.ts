import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { trackEvent } from "@/lib/tracking";
import { completePendingCommunityJoin, savePendingCommunityJoin } from "@/lib/pendingCommunityJoin";
import { resolveAuthSignupOutcome, SIGNUP_OUTCOME_TELEMETRY } from "@/lib/authSignupOutcome";

interface JoinFormData {
  display_name: string;
  email: string;
  password: string;
}

type JoinAnswers = Array<{ question_id?: string; question: string; answer: string }>;

export function useJoinCommunity(communitySlug: string, inviteCode?: string, memberRefCode?: string) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

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

  const validateMemberRef = async (code: string) => {
    const { data } = await (supabase as any)
      .from("member_invite_links")
      .select("id, member_id, community_id, code, uses_count, is_active")
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();
    return data;
  };

  const grantInviteBonus = async (
    communityId: string,
    inviterMemberId: string,
    inviteeUserId: string,
    inviteLinkId: string,
    eventType: "joined" | "paid" = "joined"
  ) => {
    try {
      const { data: inviterMember } = await supabase
        .from("community_members")
        .select("user_id")
        .eq("id", inviterMemberId)
        .maybeSingle();

      if (inviterMember?.user_id === inviteeUserId) return;

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

  const signupAndJoin = async (formData: JoinFormData, community: any, joinAnswers: JoinAnswers = []) => {
    setIsLoading(true);
    try {
      const response = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            display_name: formData.display_name,
            is_creator: false,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      const outcome = resolveAuthSignupOutcome(response as any);
      try { trackEvent(SIGNUP_OUTCOME_TELEMETRY[outcome.kind], { surface: "community_modal" }); } catch {}

      // Bloqueia caminhos de "já cadastrado" — NÃO redireciona para verify-email.
      if (outcome.kind === "already_registered_confirmed") {
        toast.error("Este email já está cadastrado. Faça login para entrar.");
        navigate(`/member/login?redirect=/circles/${communitySlug}&email=${encodeURIComponent(formData.email)}`);
        throw new Error(outcome.message);
      }
      if (outcome.kind === "already_registered_unconfirmed") {
        toast.error("Este email já está cadastrado mas ainda não foi confirmado. Reenvie o email de verificação.");
        // Reenvia automaticamente para conveniência (cooldown do servidor protege).
        try {
          await supabase.auth.resend({
            type: "signup",
            email: formData.email,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          });
        } catch { /* tolerar */ }
        navigate(`/verify-email?redirect=/circles/${communitySlug}/feed`);
        throw new Error(outcome.message);
      }
      if (outcome.kind === "invalid_email") {
        toast.error(outcome.message);
        throw new Error(outcome.message);
      }
      if (outcome.kind === "generic_error") {
        toast.error(outcome.message);
        throw new Error(outcome.message);
      }

      const authData = response.data!;
      if (!authData.user) throw new Error("Falha ao criar conta");

      const status = community.require_approval && !inviteCode ? "PENDING" : "ACTIVE";
      const displayName = formData.display_name || formData.email.split("@")[0];

      sessionStorage.setItem(
        "kivo_nav_intent",
        JSON.stringify({ origin: "community", community_slug: communitySlug, timestamp: Date.now() })
      );

      savePendingCommunityJoin({
        communityId: community.id,
        communitySlug,
        displayName,
        status,
        inviteCode,
        joinAnswers,
      });

      if (authData.session?.user) {
        await completePendingCommunityJoin(authData.user.id);

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

        toast.success(
          status === "PENDING"
            ? "Conta criada! Sua entrada na comunidade aguarda aprovação."
            : "Conta criada! Bem-vindo à comunidade."
        );

        navigate(status === "PENDING" ? "/circles" : `/circles/${communitySlug}/feed`);
        return;
      }

      toast.success(
        status === "PENDING"
          ? "Conta criada! Confirme seu email para enviar sua solicitação à comunidade."
          : "Conta criada! Confirme seu email para acessar a comunidade."
      );
      navigate(`/verify-email?redirect=/circles/${communitySlug}/feed`);
    } catch (err: any) {
      // Toast já mostrado nos branches específicos; aqui evitamos duplicar.
      if (!err?.message?.match(/já está cadastrado|erro de digitação|Este email/i)) {
        toast.error(err.message || "Erro ao criar conta. Tente novamente.");
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const joinAsExistingUser = async (userId: string, community: any, joinAnswers: JoinAnswers = []) => {
    setIsLoading(true);
    try {
      const status = community.require_approval && !inviteCode ? "PENDING" : "ACTIVE";

      await insertMember(community.id, userId, "", status);

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

      if (memberRefCode && status === "ACTIVE") {
        const refLink = await validateMemberRef(memberRefCode);
        if (refLink && refLink.community_id === community.id) {
          await grantInviteBonus(
            community.id,
            refLink.member_id,
            userId,
            refLink.id,
            "joined"
          );
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
