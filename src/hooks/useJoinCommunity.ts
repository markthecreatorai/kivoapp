import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { trackEvent } from "@/lib/tracking";
import { completePendingCommunityJoin, savePendingCommunityJoin } from "@/lib/pendingCommunityJoin";
import {
  clearPendingVerification,
  requestVerificationCode,
  savePendingVerification,
  signInAfterVerification,
} from "@/lib/authVerification";

import { validateAuthEmail } from "@/lib/authEmailGuard";

interface JoinFormData {
  display_name: string;
  email: string;
  password: string;
}

type JoinAnswers = Array<{ question_id?: string; question: string; answer: string }>;

export function useJoinCommunity(communitySlug: string, inviteCode?: string, memberRefCode?: string) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [existingSignupState, setExistingSignupState] = useState<null | {
    kind: "confirmed" | "unconfirmed";
    email: string;
  }>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendingVerification, setResendingVerification] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

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
      const emailCheck = validateAuthEmail(formData.email);
      if (!emailCheck.ok) {
        toast.error(emailCheck.suggestion
          ? `${emailCheck.error} Você quis dizer ${emailCheck.suggestion}?`
          : emailCheck.error || "Email inválido");
        throw new Error(emailCheck.error || "Email inválido");
      }
      if (formData.password.length < 8) {
        toast.error("A senha precisa ter pelo menos 8 caracteres");
        throw new Error("Senha muito curta");
      }

      setExistingSignupState(null);

      const status = community.require_approval && !inviteCode ? "PENDING" : "ACTIVE";
      const displayName = formData.display_name || emailCheck.email.split("@")[0];
      const returnTarget = status === "PENDING" ? "/circles" : `/circles/${communitySlug}/feed`;

      // A entrada na comunidade fica pendente e é concluída após a confirmação.
      savePendingCommunityJoin({
        communityId: community.id,
        communitySlug,
        displayName,
        status,
        inviteCode,
        joinAnswers,
      });

      const result = await requestVerificationCode({
        email: emailCheck.email,
        password: formData.password,
        fullName: displayName,
        accountType: "MEMBER",
        flowOrigin: "circles",
        returnTarget,
        mode: "signup",
      });

      try { trackEvent("auth.verification_code_sent", { surface: "community_modal", kind: result.kind }); } catch {}

      if (result.kind === "code_sent" || result.kind === "cooldown") {
        savePendingVerification({
          email: emailCheck.email,
          accountType: "MEMBER",
          flowOrigin: "circles",
          returnTarget,
        });
        setPendingVerification({
          email: emailCheck.email,
          password: formData.password,
          returnTarget,
          cooldown: result.kind === "code_sent" ? result.cooldownSeconds : result.retryAfterSeconds,
        });
        return;
      }

      const message =
        result.kind === "rate_limited"
          ? "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
          : result.kind === "invalid_email"
          ? "Confira o endereço de e-mail digitado."
          : result.kind === "weak_password"
          ? "A senha precisa ter pelo menos 8 caracteres."
          : result.message;
      toast.error(message);
      throw new Error(message);
    } catch (err: any) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /** Cria a sessão após o código correto e conclui a entrada na comunidade. */
  const completeVerifiedSignup = async (next: string | null) => {
    if (!pendingVerification) return;
    const { email, password, returnTarget } = pendingVerification;
    const { data, error } = await signInAfterVerification(email, password);
    clearPendingVerification();
    setPendingVerification(null);
    const dest = next || returnTarget;
    if (error || !data?.user) {
      window.location.href = `/member/login?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(dest)}`;
      return;
    }
    try {
      await completePendingCommunityJoin(data.user.id);
      if (memberRefCode) {
        const refLink = await validateMemberRef(memberRefCode);
        if (refLink) {
          await grantInviteBonus(refLink.community_id, refLink.member_id, data.user.id, refLink.id, "joined");
        }
      }
    } catch (e) {
      console.error("Erro ao concluir entrada na comunidade:", e);
    }
    window.location.href = dest;
  };

  const resendCommunityVerification = async () => {
    // Reenvio agora acontece dentro do modal de código de 4 dígitos.
    return;
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
          await (supabase as any).rpc("increment_invite_link_uses", { p_link_id: invite.id });
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

  return {
    fetchCommunity,
    signupAndJoin,
    joinAsExistingUser,
    isLoading,
    existingSignupState,
    resendCommunityVerification,
    resendCooldown,
    resendingVerification,
    clearExistingSignupState: () => setExistingSignupState(null),
  };
}
