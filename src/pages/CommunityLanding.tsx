import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
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
  Loader2, Lock, Eye, EyeOff, ArrowRight, CheckCircle,
  CreditCard, Globe, Shield, Sparkles, Play, X,
  UserCheck, MapPin, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatPrice(price: number, period?: string) {
  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
  return period === "annual" ? `${fmt}/ano` : `${fmt}/mês`;
}

// Detect YouTube/Vimeo URL and return embed URL
function getEmbedUrl(url: string): string | null {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return url; // raw iframe src
}

type TabKey = "about" | "community" | "classroom" | "events" | "members" | "leaderboard";

const TABS: { key: TabKey; label: string }[] = [
  { key: "community", label: "Comunidade" },
  { key: "classroom", label: "Classroom" },
  { key: "events", label: "Calendário" },
  { key: "members", label: "Membros" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "about", label: "Sobre" },
];

export default function CommunityLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite") || undefined;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>("about");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ display_name: "", email: "", password: "" });
  const [videoPlaying, setVideoPlaying] = useState(false);

  const { fetchCommunity, signupAndJoin, joinAsExistingUser, isLoading } = useJoinCommunity(
    slug || "",
    inviteCode
  );

  // Fetch community
  const { data: community, isLoading: communityLoading, error } = useQuery({
    queryKey: ["public-community", slug],
    queryFn: fetchCommunity,
    enabled: !!slug,
  });

  // Recent members (avatars)
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

  // Admin count
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

  // Check if already a member
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

  // Already active member → go to feed
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
    await signupAndJoin(formData, community);
    setShowJoinModal(false);
  };

  const handleLoggedUserJoin = async () => {
    if (!user || !community) return;
    if (isPaid && !inviteCode) {
      // TODO: redirect to community-specific checkout
      toast.info("Checkout em breve disponível.");
      return;
    }
    await joinAsExistingUser(user.id, community);
    setShowJoinModal(false);
  };

  if (communityLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
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
  const videoUrl = (community as any).about_video_url as string | undefined;
  const embedUrl = videoUrl ? getEmbedUrl(videoUrl) : null;
  const requireApproval = community.require_approval && !inviteCode;
  const isAlreadyMember = existingMember != null;

  const joinBtnLabel = isAlreadyMember
    ? "Ir para a Comunidade"
    : isPaid && !inviteCode
      ? `Assinar — ${formatPrice(price!, billingPeriod)}`
      : requireApproval
        ? "Solicitar Entrada"
        : "Entrar na Comunidade";

  const handleJoinClick = () => {
    if (isAlreadyMember) {
      navigate(`/c/${slug}/feed`);
      return;
    }
    setShowJoinModal(true);
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* ── Top Navbar ─────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-background border-b border-border/60">
        <div className="max-w-5xl mx-auto px-4">
          {/* Brand row */}
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2.5">
              {community.icon_url ? (
                <img src={community.icon_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
              )}
              <span className="font-bold text-sm text-foreground truncate max-w-[160px] sm:max-w-none">
                {community.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {user ? (
                <Button size="sm" onClick={handleJoinClick} className="h-8 px-4 text-xs font-semibold" id="join-btn-topbar">
                  {joinBtnLabel}
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => navigate(`/member/login?redirect=/c/${slug}`)}>
                    Entrar
                  </Button>
                  <Button size="sm" className="h-8 px-4 text-xs font-semibold" onClick={() => setShowJoinModal(true)} id="join-btn-topbar">
                    {isPaid ? `Assinar` : "Participar Grátis"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex items-center gap-0 overflow-x-auto scrollbar-none -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Main Layout ─────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid md:grid-cols-[1fr_300px] gap-6 items-start">

          {/* ── Left: Content area ── */}
          <div className="space-y-5">
            {/* Community name heading (mobile only) */}
            <h1 className="text-xl font-bold text-foreground md:hidden">{community.name}</h1>

            {/* Video / Cover media */}
            {embedUrl ? (
              <div className="rounded-xl overflow-hidden bg-black aspect-video shadow">
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
                      <div className="w-full h-full bg-gradient-to-br from-primary/40 to-muted flex items-center justify-center">
                        <MessageSquare className="h-16 w-16 text-primary/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                      <div className="h-16 w-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform">
                        <Play className="h-7 w-7 text-foreground fill-foreground ml-1" />
                      </div>
                    </div>
                  </button>
                )}
              </div>
            ) : community.cover_image_url ? (
              <div className="rounded-xl overflow-hidden aspect-video shadow">
                <img src={community.cover_image_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : null}

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Globe className="h-4 w-4" />
                {community.access_type === "OPEN" ? "Público" : "Privado"}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {(community.member_count || 0).toLocaleString("pt-BR")} membros
              </span>
              <span className="flex items-center gap-1.5">
                {isPaid ? (
                  <><CreditCard className="h-4 w-4 text-amber-500" /><span className="text-amber-600 font-medium">{formatPrice(price!, billingPeriod)}</span></>
                ) : (
                  <><CheckCircle className="h-4 w-4 text-emerald-500" /><span className="text-emerald-600 font-medium">Gratuito</span></>
                )}
              </span>
            </div>

            {/* Description / About content */}
            {community.description && (
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed whitespace-pre-line">
                {community.description}
              </div>
            )}

            {/* Tabs that are locked — previews */}
            {activeTab !== "about" && (
              <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Lock className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Conteúdo exclusivo para membros</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Entre na comunidade para acessar o {TABS.find(t => t.key === activeTab)?.label}.
                  </p>
                </div>
                <Button onClick={() => setShowJoinModal(true)} className="gap-2">
                  <UserCheck className="h-4 w-4" /> {isPaid ? "Assinar Comunidade" : "Entrar Gratuitamente"}
                </Button>
              </div>
            )}
          </div>

          {/* ── Right Sidebar ── */}
          <div className="space-y-4 md:sticky md:top-[105px]">
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              {/* Community header in card */}
              <div className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {community.icon_url ? (
                    <img src={community.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-7 w-7 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-foreground">{community.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">kivo.com/c/{community.slug}</p>
                  </div>
                </div>

                {community.description && (
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                    {community.description}
                  </p>
                )}
              </div>

              {/* Stats */}
              <div className="border-t border-border px-4 py-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-bold text-foreground">{(community.member_count || 0).toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] text-muted-foreground">Membros</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{(community as any).online_count || "—"}</p>
                  <p className="text-[10px] text-muted-foreground">Online</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{adminCount}</p>
                  <p className="text-[10px] text-muted-foreground">Admins</p>
                </div>
              </div>

              {/* Recent member avatars */}
              {recentMembers.length > 0 && (
                <div className="px-4 pb-3 flex items-center gap-1">
                  {recentMembers.slice(0, 7).map((m: any, i: number) => (
                    <div
                      key={i}
                      className="h-7 w-7 rounded-full bg-primary/10 border-2 border-background flex items-center justify-center text-[10px] font-bold text-primary -ml-1 first:ml-0 shrink-0"
                      style={{ zIndex: 7 - i }}
                    >
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        (m.display_name || "?").charAt(0).toUpperCase()
                      )}
                    </div>
                  ))}
                  {(community.member_count || 0) > 7 && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      +{((community.member_count || 0) - 7).toLocaleString("pt-BR")}
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
                <div className="mx-4 mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-center">
                  <p className="text-xl font-bold text-foreground">{formatPrice(price!, billingPeriod)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Cancele a qualquer momento</p>
                </div>
              )}

              {/* JOIN BUTTON */}
              <div className="px-4 pb-4">
                <Button
                  size="lg"
                  className="w-full font-bold text-sm h-11 gap-2"
                  onClick={handleJoinClick}
                  id="join-btn-sidebar"
                >
                  {isPaid && !inviteCode
                    ? <><CreditCard className="h-4 w-4" /> {formatPrice(price!, billingPeriod)}</>
                    : requireApproval
                      ? <><UserCheck className="h-4 w-4" /> Solicitar Entrada</>
                      : <><UserCheck className="h-4 w-4" /> Entrar na Comunidade</>
                  }
                </Button>
                <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-emerald-500" />Seguro</span>
                  <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" />Sem compromisso</span>
                </div>
              </div>

              {/* Powered by */}
              <div className="border-t border-border px-4 py-2.5 flex items-center justify-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Desenvolvido por</span>
                <span className="text-[10px] font-bold text-foreground">Kivo</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── JOIN MODAL ─────────────────────────────── */}
      <Dialog open={showJoinModal} onOpenChange={setShowJoinModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {community.icon_url && <img src={community.icon_url} alt="" className="h-7 w-7 rounded-lg object-cover" />}
              {isPaid && !inviteCode ? `Assinar — ${formatPrice(price!, billingPeriod)}` : "Entrar na Comunidade"}
            </DialogTitle>
          </DialogHeader>

          {/* Logged-in user */}
          {user ? (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Logado como <span className="font-medium text-foreground">{user.email}</span>
              </p>
              {isPaid && !inviteCode ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-center">
                  <p className="text-2xl font-bold text-foreground">{formatPrice(price!, billingPeriod)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Cancele quando quiser</p>
                </div>
              ) : null}
              <Button size="lg" className="w-full gap-2" onClick={handleLoggedUserJoin} disabled={isLoading} id="modal-join-logged">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isPaid ? <CreditCard className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                {isPaid && !inviteCode ? "Continuar para Pagamento" : requireApproval ? "Solicitar Entrada" : "Entrar Agora"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Não é você?{" "}
                <button onClick={() => { setShowJoinModal(false); navigate(`/member/login?redirect=/c/${slug}`); }} className="text-primary hover:underline">
                  Trocar conta
                </button>
              </p>
            </div>
          ) : (
            /* New user signup */
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
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-center">
                  <p className="text-lg font-bold text-foreground">{formatPrice(price!, billingPeriod)}</p>
                  <p className="text-xs text-muted-foreground">Após criar conta, você será direcionado ao pagamento</p>
                </div>
              )}

              <Button type="submit" size="lg" className="w-full gap-2" disabled={isLoading} id="modal-join-submit">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isPaid ? <CreditCard className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                {isPaid && !inviteCode ? "Criar conta e pagar" : requireApproval ? "Solicitar Entrada" : "Criar conta e entrar"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Já tem conta?{" "}
                <button type="button" onClick={() => { setShowJoinModal(false); navigate(`/member/login?redirect=/c/${slug}`); }}
                  className="text-primary hover:underline">
                  Fazer login
                </button>
              </p>

              <p className="text-center text-[10px] text-muted-foreground leading-relaxed">
                Ao continuar, você concorda com os{" "}
                <a href="/terms" className="text-primary hover:underline">Termos de Uso</a>.
              </p>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
