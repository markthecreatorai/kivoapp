import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useJoinCommunity } from "@/hooks/useJoinCommunity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, MessageSquare, Trophy, BookOpen, Calendar,
  Loader2, Lock, Eye, EyeOff, ArrowRight,
  CreditCard, Globe, Shield, Sparkles, Play,
  UserCheck, CheckCircle, Star, Copy, UserPlus, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatPrice(price: number, period?: string) {
  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
  return period === "annual" ? `${fmt}/ano` : `${fmt}/mês`;
}

function getEmbedUrl(url: string): string | null {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return url;
}

type TabKey = "about" | "community" | "classroom" | "events" | "members" | "map" | "leaderboard";

const TABS: { key: TabKey; label: string; icon: React.ReactNode; locked: boolean }[] = [
  { key: "about", label: "Sobre", icon: <Star className="h-3.5 w-3.5" />, locked: false },
  { key: "community", label: "Comunidade", icon: <MessageSquare className="h-3.5 w-3.5" />, locked: true },
  { key: "classroom", label: "Classroom", icon: <BookOpen className="h-3.5 w-3.5" />, locked: true },
  { key: "events", label: "Eventos", icon: <Calendar className="h-3.5 w-3.5" />, locked: true },
  { key: "members", label: "Membros", icon: <Users className="h-3.5 w-3.5" />, locked: true },
  { key: "map", label: "Mapa", icon: <Globe className="h-3.5 w-3.5" />, locked: true },
  { key: "leaderboard", label: "Ranking", icon: <Trophy className="h-3.5 w-3.5" />, locked: true },
];

export default function CommunityLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite") || undefined;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>("about");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [modalMode, setModalMode] = useState<"signup" | "login" | "forgot-password">("signup");
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [loginLoading, setLoginLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [formData, setFormData] = useState({ display_name: "", email: "", password: "" });
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [joinAnswers, setJoinAnswers] = useState<Record<string, string>>({});

  const inviteLink = `${window.location.origin}/c/${slug}`;

  const { fetchCommunity, signupAndJoin, joinAsExistingUser, isLoading } = useJoinCommunity(
    slug || "",
    inviteCode
  );

  const { data: community, isLoading: communityLoading, error } = useQuery({
    queryKey: ["public-community", slug],
    queryFn: fetchCommunity,
    enabled: !!slug,
  });

  const { data: recentMembers = [] } = useQuery({
    queryKey: ["public-recent-members", community?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_members")
        .select("display_name, avatar_url")
        .eq("community_id", community!.id)
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false })
        .limit(8);
      return data || [];
    },
    enabled: !!community?.id,
  });

  const { data: adminCount = 0 } = useQuery({
    queryKey: ["public-admin-count", community?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("community_members")
        .select("*", { count: "exact", head: true })
        .eq("community_id", community!.id)
        .in("role", ["OWNER", "ADMIN"])
        .eq("status", "ACTIVE");
      return count || 0;
    },
    enabled: !!community?.id,
  });

  const { data: existingMember } = useQuery({
    queryKey: ["member-exists", community?.id, user?.id],
    queryFn: async () => {
      if (!user || !community) return null;
      const { data } = await supabase
        .from("community_members")
        .select("id, status")
        .eq("community_id", community.id)
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user && !!community,
  });

  const { data: linkedProduct } = useQuery({
    queryKey: ["community-linked-product", community?.linked_product_id],
    queryFn: async () => {
      if (!community?.linked_product_id) return null;
      const { data } = await supabase
        .from("products")
        .select("id, slug")
        .eq("id", community.linked_product_id)
        .maybeSingle();
      return data;
    },
    enabled: !!community?.linked_product_id,
  });

  const { data: primaryPlan } = useQuery({
    queryKey: ["community-primary-plan", community?.id],
    queryFn: async () => {
      if (!community?.id) return null;
      const { data } = await supabase
        .from("circle_plans")
        .select("id, trial_days, interval, price_cents, is_active")
        .eq("community_id", community.id)
        .eq("is_active", true)
        .order("price_cents", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!community?.id,
  });

  const { data: joinQuestions = [] } = useQuery({
    queryKey: ["community-join-questions", community?.id],
    queryFn: async () => {
      if (!community?.id) return [];
      const { data, error } = await (supabase as any)
        .from("community_join_questions")
        .select("id, question, required, position")
        .eq("community_id", community.id)
        .order("position", { ascending: true });
      if (error) return [];
      return (data || []) as any[];
    },
    enabled: !!community?.id,
  });

  // Already active member → go directly to feed
  useEffect(() => {
    if (existingMember?.status === "ACTIVE" && community?.slug) {
      navigate(`/c/${community.slug}/feed`, { replace: true });
    }
  }, [existingMember, community, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!community) return;
    if (!formData.display_name.trim()) { toast.error("Informe seu nome"); return; }
    if (!formData.email.trim()) { toast.error("Informe seu email"); return; }
    if (formData.password.length < 6) { toast.error("Senha deve ter ao menos 6 caracteres"); return; }

    const requiresAnswers = community.require_approval && !inviteCode && joinQuestions.length > 0;
    if (requiresAnswers) {
      const missing = joinQuestions.find((q: any) => q.required && !String(joinAnswers[q.id] || "").trim());
      if (missing) {
        toast.error("Responda todas as perguntas obrigatórias para solicitar entrada.");
        return;
      }
    }

    const payloadAnswers = joinQuestions.map((q: any) => ({
      question_id: q.id,
      question: q.question,
      answer: joinAnswers[q.id] || "",
    })).filter((a: any) => a.answer.trim().length > 0);

    await signupAndJoin(formData, community, payloadAnswers);
    setShowJoinModal(false);
  };

  const handleLoggedUserJoin = async () => {
    if (!user || !community) return;
    if (isPaid && !inviteCode) {
      if (linkedProduct?.slug) {
        navigate(`/checkout/${linkedProduct.slug}`);
      } else {
        toast.error("Plano pago sem produto vinculado. Configure no admin da comunidade.");
      }
      return;
    }

    const requiresAnswers = community.require_approval && !inviteCode && joinQuestions.length > 0;
    if (requiresAnswers) {
      const missing = joinQuestions.find((q: any) => q.required && !String(joinAnswers[q.id] || "").trim());
      if (missing) {
        toast.error("Responda todas as perguntas obrigatórias para solicitar entrada.");
        return;
      }
    }

    const payloadAnswers = joinQuestions.map((q: any) => ({
      question_id: q.id,
      question: q.question,
      answer: joinAnswers[q.id] || "",
    })).filter((a: any) => a.answer.trim().length > 0);

    await joinAsExistingUser(user.id, community, payloadAnswers);
    setShowJoinModal(false);
  };

  const handleJoinClick = () => {
    if (isAlreadyMember) {
      setShowInviteModal(true);
      return;
    }
    if (isPaid && !inviteCode && linkedProduct?.slug) {
      navigate(`/checkout/${linkedProduct.slug}`);
      return;
    }
    setModalMode("signup");
    setShowJoinModal(true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData.email.trim()) { toast.error("Informe seu email"); return; }
    if (!loginData.password.trim()) { toast.error("Informe sua senha"); return; }
    setLoginLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: loginData.email, password: loginData.password });
      if (error) throw error;
      toast.success("Login realizado!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) { toast.error("Informe seu email"); return; }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar email");
    } finally {
      setForgotLoading(false);
    }
  };

  if (communityLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !community) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Lock className="h-9 w-9 text-muted-foreground/50" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Comunidade não encontrada</h1>
          <p className="text-muted-foreground">O link pode estar inválido ou a comunidade foi desativada.</p>
          <Button onClick={() => navigate("/communities")} variant="outline">Ver outras comunidades</Button>
        </div>
      </div>
    );
  }

  const isPaid = community.access_type === "PAID_SUBSCRIPTION" && !!(community as any).price;
  const price = (community as any).price as number | undefined;
  const billingPeriod = (community as any).billing_period as string | undefined;
  const trialDays = primaryPlan?.trial_days || 0;
  const videoUrl = (community as any).about_video_url as string | undefined;
  const embedUrl = videoUrl ? getEmbedUrl(videoUrl) : null;
  const requireApproval = community.require_approval && !inviteCode;
  const isAlreadyMember = existingMember != null;
  const memberCount = community.member_count || 0;

  const joinBtnLabel = isAlreadyMember
    ? "Ir para a Comunidade"
    : isPaid && !inviteCode
      ? (trialDays > 0 ? `Iniciar ${trialDays} dias grátis` : `Assinar — ${formatPrice(price!, billingPeriod)}`)
      : requireApproval
        ? "Solicitar Entrada"
        : "Entrar na Comunidade";

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0f0f0f]">

      {/* ── Top Navbar (Skool-style: thin, clean) ── */}
      <div className="sticky top-0 z-40 bg-white dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4">
          {/* Brand row */}
          <div className="flex items-center justify-between h-13 py-2">
            <div className="flex items-center gap-2.5">
              {community.icon_url ? (
                <img src={community.icon_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
              )}
              <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate max-w-[160px] sm:max-w-xs">
                {community.name}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!user && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-3 text-xs text-gray-600 dark:text-gray-400"
                  onClick={() => { setModalMode("login"); setShowJoinModal(true); }}
                >
                  Entrar
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 px-4 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground border-0 gap-1.5"
                onClick={handleJoinClick}
                id="join-btn-topbar"
              >
                {isAlreadyMember
                  ? <><UserPlus className="h-3.5 w-3.5" />Convidar Pessoas</>
                  : isPaid ? (trialDays > 0 ? `Teste grátis` : `Assinar`) : "Participar Grátis"
                }
              </Button>
            </div>
          </div>

          {/* Tab navigation */}
          <nav className="flex items-center gap-0 overflow-x-auto scrollbar-none -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  if (tab.locked && !isAlreadyMember) {
                    handleJoinClick();
                    return;
                  }
                  setActiveTab(tab.key);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
                  activeTab === tab.key
                    ? "border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                )}
              >
                {tab.icon}
                {tab.label}
                {tab.locked && !isAlreadyMember && (
                  <Lock className="h-3 w-3 text-gray-400 ml-0.5" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid md:grid-cols-[1fr_300px] gap-6 items-start">

          {/* ── Left Content ── */}
          <div className="space-y-5">

            {/* About tab content */}
            {activeTab === "about" && (
              <>
                {/* Video / Cover media */}
                {embedUrl ? (
                  <div className="rounded-xl overflow-hidden bg-black aspect-video shadow-sm">
                    {videoPlaying ? (
                      <iframe
                        src={embedUrl + "&autoplay=1"}
                        className="w-full h-full"
                        allowFullScreen
                        allow="autoplay; fullscreen"
                        title={community.name}
                      />
                    ) : (
                      <button
                        onClick={() => setVideoPlaying(true)}
                        className="relative w-full h-full group"
                      >
                        {community.cover_image_url ? (
                          <img src={community.cover_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                            <MessageSquare className="h-16 w-16 text-white/20" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center group-hover:bg-black/35 transition-colors">
                          <div className="h-16 w-16 rounded-full bg-white/95 flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform">
                            <Play className="h-7 w-7 text-gray-900 fill-gray-900 ml-1" />
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                ) : community.cover_image_url ? (
                  <div className="rounded-xl overflow-hidden aspect-video shadow-sm">
                    <img src={community.cover_image_url} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : null}

                {/* Stats row */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-4 w-4" />
                    {community.access_type === "OPEN" ? "Público" : "Privado"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    {memberCount.toLocaleString("pt-BR")} membros
                  </span>
                  <span className="flex items-center gap-1.5">
                    {isPaid ? (
                      <><CreditCard className="h-4 w-4 text-primary" /><span className="text-primary font-medium">{formatPrice(price!, billingPeriod)}</span></>
                    ) : (
                      <><CheckCircle className="h-4 w-4 text-emerald-500" /><span className="text-emerald-600 font-medium">Gratuito</span></>
                    )}
                  </span>
                  {(community as any).owner_name && (
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="h-4 w-4" />
                      Por {(community as any).owner_name}
                    </span>
                  )}
                </div>

                {/* Description */}
                {community.description && (
                  <div className="bg-white dark:bg-[#1a1a1a] rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                    <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line text-sm">
                      {community.description}
                    </p>
                  </div>
                )}

                {/* CTA Block (mobile) */}
                <div className="md:hidden bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
                  <Button
                    size="lg"
                    className="w-full font-bold text-sm h-11 bg-primary hover:bg-primary/90 text-primary-foreground border-0"
                    onClick={handleJoinClick}
                    id="join-btn-mobile"
                  >
                    {joinBtnLabel}
                  </Button>
                  <div className="flex items-center justify-center gap-4 mt-2.5 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-emerald-500" />Seguro</span>
                    <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" />Sem compromisso</span>
                  </div>
                </div>
              </>
            )}

            {/* Locked tabs */}
            {activeTab !== "about" && (
              <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-100 dark:border-gray-800 p-10 text-center space-y-4">
                <div className="h-14 w-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto">
                  <Lock className="h-6 w-6 text-gray-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">Conteúdo exclusivo para membros</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Entre na comunidade para acessar{" "}
                    <span className="font-medium">{TABS.find(t => t.key === activeTab)?.label}</span>.
                  </p>
                </div>
                <Button
                  onClick={handleJoinClick}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 font-semibold gap-2"
                >
                  <UserCheck className="h-4 w-4" />
                  {isPaid ? "Assinar Comunidade" : "Entrar Gratuitamente"}
                </Button>
              </div>
            )}
          </div>

          {/* ── Right Sidebar (Skool-style card) ── */}
          <div className="space-y-4 md:sticky md:top-[106px]">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">

              {/* Cover banner */}
              {community.cover_image_url && !embedUrl && (
                <div className="h-24 bg-gradient-to-br from-primary/30 to-primary/10 overflow-hidden">
                  <img src={community.cover_image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              {!community.cover_image_url && (
                <div className="h-20 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5" />
              )}

              {/* Community info */}
              <div className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {community.icon_url ? (
                    <img src={community.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover shrink-0 -mt-8 ring-4 ring-white dark:ring-[#1a1a1a] shadow" />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center shrink-0 -mt-8 ring-4 ring-white dark:ring-[#1a1a1a] shadow">
                      <MessageSquare className="h-7 w-7 text-white" />
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">{community.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">kivo.com/c/{community.slug}</p>
                </div>

                {community.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">
                    {community.description}
                  </p>
                )}
              </div>

              {/* Stats */}
              <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{memberCount.toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] text-gray-400">Membros</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{(community as any).online_count ?? "—"}</p>
                  <p className="text-[10px] text-gray-400">Online</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{adminCount}</p>
                  <p className="text-[10px] text-gray-400">Admins</p>
                </div>
              </div>

              {/* Recent member avatars */}
              {recentMembers.length > 0 && (
                <div className="px-4 pb-3 flex items-center gap-1 flex-wrap">
                  {recentMembers.slice(0, 7).map((m: any, i: number) => (
                    <div
                      key={i}
                      className="h-7 w-7 rounded-full bg-primary/10 border-2 border-white dark:border-[#1a1a1a] flex items-center justify-center text-[10px] font-bold text-primary -ml-1.5 first:ml-0 shrink-0 shadow-sm"
                      style={{ zIndex: 7 - i }}
                    >
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        (m.display_name || "?").charAt(0).toUpperCase()
                      )}
                    </div>
                  ))}
                  {memberCount > 7 && (
                    <span className="text-[10px] text-gray-400 ml-1">
                      +{(memberCount - 7).toLocaleString("pt-BR")}
                    </span>
                  )}
                </div>
              )}

              {/* Invite badge */}
              {inviteCode && (
                <div className="mx-4 mb-3 flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-medium text-primary">Você foi convidado!</span>
                </div>
              )}

              {/* Price block */}
              {isPaid && !inviteCode && (
                <div className="mx-4 mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatPrice(price!, billingPeriod)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{trialDays > 0 ? `${trialDays} dias grátis` : "Cancele a qualquer momento"}</p>
                </div>
              )}

              {/* JOIN BUTTON */}
              <div className="px-4 pb-4">
                <Button
                  size="lg"
                  className="w-full font-bold text-sm h-11 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground border-0"
                  onClick={handleJoinClick}
                  id="join-btn-sidebar"
                >
                  {isAlreadyMember
                    ? <><UserPlus className="h-4 w-4" /> Convidar Pessoas</>
                    : isPaid && !inviteCode
                      ? <><CreditCard className="h-4 w-4" /> {trialDays > 0 ? `Iniciar ${trialDays} dias grátis` : `Assinar ${formatPrice(price!, billingPeriod)}`}</>
                      : requireApproval
                        ? <><UserCheck className="h-4 w-4" /> Solicitar Entrada</>
                        : <><UserCheck className="h-4 w-4" /> Entrar na Comunidade</>
                  }
                </Button>
                <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-emerald-500" />Seguro</span>
                  <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" />Sem compromisso</span>
                </div>
              </div>

              {/* Powered by */}
              <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2.5 flex items-center justify-center gap-1.5">
                <span className="text-[10px] text-gray-400">Desenvolvido por</span>
                <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Kivo</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── JOIN MODAL ── */}
      <Dialog open={showJoinModal} onOpenChange={(open) => { setShowJoinModal(open); if (!open) { setForgotSent(false); setForgotEmail(""); setForgotLoading(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {community.icon_url && <img src={community.icon_url} alt="" className="h-7 w-7 rounded-lg object-cover" />}
              {isPaid && !inviteCode ? (trialDays > 0 ? `Iniciar ${trialDays} dias grátis` : `Assinar — ${formatPrice(price!, billingPeriod)}`) : "Entrar na Comunidade"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {isPaid && !inviteCode
                ? (trialDays > 0 ? `Acesso imediato. Cobrança após ${trialDays} dias.` : "Acesso imediato após confirmação do pagamento.")
                : (requireApproval ? "Sua solicitação será revisada pelo admin." : "Leva menos de 1 minuto para entrar.")}
            </p>
          </DialogHeader>

          {!user && modalMode !== "forgot-password" && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted mb-2">
              <button
                type="button"
                onClick={() => setModalMode("signup")}
                className={cn(
                  "h-8 rounded-md text-xs font-medium transition-colors",
                  modalMode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                Criar conta
              </button>
              <button
                type="button"
                onClick={() => setModalMode("login")}
                className={cn(
                  "h-8 rounded-md text-xs font-medium transition-colors",
                  modalMode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                Entrar
              </button>
            </div>
          )}

          {/* Logged-in user */}
          {user ? (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Logado como <span className="font-medium text-foreground">{user.email}</span>
              </p>
              {isPaid && !inviteCode ? (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-center">
                  <p className="text-2xl font-bold text-foreground">{formatPrice(price!, billingPeriod)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{trialDays > 0 ? `${trialDays} dias grátis, depois cobrança recorrente` : "Cancele quando quiser"}</p>
                </div>
              ) : null}

              {community.require_approval && !inviteCode && joinQuestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Perguntas de entrada</p>
                  {joinQuestions.map((q: any) => (
                    <div key={q.id} className="space-y-1">
                      <Label className="text-xs">{q.question}{q.required ? " *" : ""}</Label>
                      <textarea
                        className="w-full min-h-20 rounded-md border bg-background p-2 text-sm"
                        value={joinAnswers[q.id] || ""}
                        onChange={(e) => setJoinAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Sua resposta"
                      />
                    </div>
                  ))}
                </div>
              )}

              <Button size="lg" className="w-full gap-2" onClick={handleLoggedUserJoin} disabled={isLoading} id="modal-join-logged">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isPaid ? <CreditCard className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                {isPaid && !inviteCode ? (trialDays > 0 ? `Iniciar ${trialDays} dias grátis` : "Continuar para pagamento") : requireApproval ? "Solicitar Entrada" : "Entrar Agora"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Não é você?{" "}
                <button onClick={() => { setShowJoinModal(false); navigate(`/login?redirect=/c/${slug}`); }} className="text-primary hover:underline">
                  Trocar conta
                </button>
              </p>
            </div>
          ) : modalMode === "signup" ? (
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                {inviteCode && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs font-medium text-primary">Você foi convidado — acesso imediato!</span>
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="modal-name" className="text-sm">Seu nome</Label>
                  <Input id="modal-name" placeholder="Como quer ser chamado?" value={formData.display_name}
                    onChange={(e) => setFormData((p) => ({ ...p, display_name: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="modal-email" className="text-sm">Email</Label>
                  <Input id="modal-email" type="email" placeholder="seu@email.com" value={formData.email}
                    onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="modal-password" className="text-sm">Senha</Label>
                  <div className="relative">
                    <Input id="modal-password" type={showPassword ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres" value={formData.password}
                      onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                      className="h-10 pr-10" />
                    <button type="button" onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {isPaid && !inviteCode && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
                    <p className="text-lg font-bold text-foreground">{formatPrice(price!, billingPeriod)}</p>
                    <p className="text-xs text-muted-foreground">{trialDays > 0 ? `Após criar conta, você inicia ${trialDays} dias grátis` : "Após criar conta, você será direcionado ao pagamento"}</p>
                  </div>
                )}

                {community.require_approval && !inviteCode && joinQuestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Perguntas de entrada</p>
                    {joinQuestions.map((q: any) => (
                      <div key={q.id} className="space-y-1">
                        <Label className="text-xs">{q.question}{q.required ? " *" : ""}</Label>
                        <textarea
                          className="w-full min-h-20 rounded-md border bg-background p-2 text-sm"
                          value={joinAnswers[q.id] || ""}
                          onChange={(e) => setJoinAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Sua resposta"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full gap-2" disabled={isLoading} id="modal-join-submit">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isPaid ? <CreditCard className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  {isPaid && !inviteCode ? (trialDays > 0 ? `Criar conta e iniciar ${trialDays} dias grátis` : "Criar conta e pagar") : requireApproval ? "Solicitar Entrada" : "Criar conta e entrar"}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Já tem conta?{" "}
                  <button type="button" onClick={() => setModalMode("login")}
                    className="text-primary hover:underline">
                    Fazer login
                  </button>
                </p>

                <p className="text-center text-[10px] text-muted-foreground leading-relaxed">
                  Ao continuar, você concorda com os{" "}
                  <a href="/terms" className="text-primary hover:underline">Termos de Uso</a>.
                </p>
              </form>
            ) : modalMode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label htmlFor="modal-login-email" className="text-sm">Email</Label>
                  <Input id="modal-login-email" type="email" placeholder="seu@email.com" value={loginData.email}
                    onChange={(e) => setLoginData((p) => ({ ...p, email: e.target.value }))} className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="modal-login-password" className="text-sm">Senha</Label>
                  <div className="relative">
                    <Input id="modal-login-password" type={showPassword ? "text" : "password"}
                      placeholder="Sua senha" value={loginData.password}
                      onChange={(e) => setLoginData((p) => ({ ...p, password: e.target.value }))}
                      className="h-10 pr-10" />
                    <button type="button" onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <button type="button" onClick={() => { setForgotEmail(loginData.email); setForgotSent(false); setModalMode("forgot-password"); }}
                    className="text-xs text-primary hover:underline">
                    Esqueci minha senha
                  </button>
                </div>

                <Button type="submit" size="lg" className="w-full gap-2" disabled={loginLoading}>
                  {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Entrar
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Não tem conta?{" "}
                  <button type="button" onClick={() => setModalMode("signup")}
                    className="text-primary hover:underline">
                    Criar conta
                  </button>
                </p>
              </form>
            ) : modalMode === "forgot-password" ? (
              <div className="space-y-4 pt-2">
                {forgotSent ? (
                  <div className="text-center space-y-3 py-4">
                    <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
                    <h3 className="font-semibold text-foreground">Email enviado!</h3>
                    <p className="text-sm text-muted-foreground">
                      Enviamos um link de redefinição para <strong>{forgotEmail}</strong>. Verifique sua caixa de entrada.
                    </p>
                    <button type="button" onClick={() => { setForgotSent(false); setModalMode("login"); }}
                      className="text-sm text-primary hover:underline flex items-center gap-1 mx-auto">
                      ← Voltar ao login
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="text-center space-y-1">
                      <h3 className="font-semibold text-foreground">Esqueceu sua senha?</h3>
                      <p className="text-sm text-muted-foreground">Digite seu email e enviaremos um link para redefinir sua senha</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="modal-forgot-email" className="text-sm">Email</Label>
                      <Input id="modal-forgot-email" type="email" placeholder="seu@email.com" value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)} className="h-10" />
                    </div>
                    <Button type="submit" size="lg" className="w-full gap-2" disabled={forgotLoading}>
                      {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Enviar link de redefinição
                    </Button>
                    <p className="text-center">
                      <button type="button" onClick={() => setModalMode("login")}
                        className="text-sm text-primary hover:underline">
                        ← Voltar ao login
                      </button>
                    </p>
                  </form>
                )}
              </div>
            ) : null}

        </DialogContent>
      </Dialog>
      {/* ── INVITE MODAL ── */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5 text-primary" />
              Convidar Pessoas
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Explanation */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              Compartilhe o link abaixo para convidar outras pessoas a participar de{" "}
              <span className="font-semibold text-foreground">{community.name}</span>.
              Quem clicar no link verá a página da comunidade e poderá entrar.
            </p>

            {/* Link box */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />  Link de convite
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground font-mono truncate select-all">
                  {inviteLink}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    toast.success("Link copiado!");
                  }}
                  id="copy-invite-link"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
            </div>

            {/* Share options */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                className="gap-2 text-sm h-10"
                onClick={() => {
                  const text = encodeURIComponent(`Participe de ${community.name} na Kivo! ${inviteLink}`);
                  window.open(`https://wa.me/?text=${text}`, "_blank");
                }}
              >
                <svg className="h-4 w-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </Button>
              <Button
                variant="outline"
                className="gap-2 text-sm h-10"
                onClick={() => {
                  const text = encodeURIComponent(`Participe de ${community.name} na Kivo!`);
                  const url = encodeURIComponent(inviteLink);
                  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
                }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X (Twitter)
              </Button>
            </div>

            {/* Info callout */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/15">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Quem receber o link verá a página pública da comunidade e poderá se cadastrar diretamente, sem precisar de convite especial.
              </p>
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => navigate(`/c/${slug}/feed`)}
            >
              Ir para a Comunidade
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
