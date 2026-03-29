import { useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useJoinCommunity } from "@/hooks/useJoinCommunity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Users, MessageSquare, Trophy, BookOpen, Calendar,
  UserPlus, Loader2, Lock, Eye, EyeOff, ArrowRight,
  CheckCircle, Star, Sparkles, CreditCard, Globe, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Format a price for display
function formatPrice(price: number, period?: string) {
  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
  if (period === "annual") return `${fmt}/ano`;
  return `${fmt}/mês`;
}

export default function CommunityLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite") || undefined;
  const navigate = useNavigate();
  const { user } = useAuth();

  const { fetchCommunity, signupAndJoin, joinAsExistingUser, isLoading } = useJoinCommunity(
    slug || "",
    inviteCode
  );

  const [step, setStep] = useState<"cta" | "form">("cta");
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ display_name: "", email: "", password: "" });

  // Community data
  const { data: community, isLoading: communityLoading, error } = useQuery({
    queryKey: ["public-community", slug],
    queryFn: fetchCommunity,
    enabled: !!slug,
  });

  // Preview posts
  const { data: previewPosts = [] } = useQuery({
    queryKey: ["public-preview-posts", community?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_posts")
        .select("*, author:community_members!author_id(display_name, avatar_url)")
        .eq("community_id", community!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(3);
      return data || [];
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
  if (existingMember?.status === "ACTIVE" && community?.slug) {
    navigate(`/c/${community.slug}/feed`, { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!community) return;
    if (!formData.display_name.trim()) { toast.error("Informe seu nome"); return; }
    if (!formData.email.trim()) { toast.error("Informe seu email"); return; }
    if (formData.password.length < 6) { toast.error("Senha deve ter ao menos 6 caracteres"); return; }

    // Paid community — signup then redirect to community checkout
    if (community.access_type === "PAID_SUBSCRIPTION" && (community as any).price && !inviteCode) {
      await signupAndJoin(formData, community, true);
      return;
    }
    await signupAndJoin(formData, community);
  };

  const handleExistingUserJoin = async () => {
    if (!user || !community) return;

    // Paid community — redirect to dedicated checkout
    if (community.access_type === "PAID_SUBSCRIPTION" && (community as any).price && !inviteCode) {
      navigate(`/c/${community.slug}/checkout`);
      return;
    }
    await joinAsExistingUser(user.id, community);
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
  const requireApproval = community.require_approval && !inviteCode;

  // CTA button label
  const ctaLabel = isPaid
    ? `Assinar por ${formatPrice(price!, billingPeriod)}`
    : requireApproval
      ? "Solicitar entrada"
      : "Entrar gratuitamente";

  const benefits = [
    { icon: MessageSquare, text: "Feed da comunidade" },
    { icon: BookOpen, text: "Cursos exclusivos" },
    { icon: Calendar, text: "Eventos ao vivo" },
    { icon: Trophy, text: "Ranking e pontos" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 px-4 h-14 flex items-center justify-between">
        <Link to="/communities" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <Globe className="h-4 w-4" />
          Explorar comunidades
        </Link>
        <Link to="/member/login" className="text-sm font-medium text-primary hover:underline">
          Já tenho conta
        </Link>
      </div>

      {/* Cover */}
      <div className="relative h-64 md:h-80 overflow-hidden pt-14">
        {community.cover_image_url ? (
          <img src={community.cover_image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/15 to-muted" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-24 relative z-10 pb-20">
        <div className="grid md:grid-cols-[1fr_400px] gap-8 items-start">

          {/* ── Left: Community info ── */}
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-end gap-4">
              {community.icon_url ? (
                <img src={community.icon_url} alt="" className="h-24 w-24 rounded-2xl object-cover border-4 border-background shadow-xl shrink-0" />
              ) : (
                <div className="h-24 w-24 rounded-2xl bg-primary/10 border-4 border-background shadow-xl flex items-center justify-center shrink-0">
                  <MessageSquare className="h-10 w-10 text-primary" />
                </div>
              )}
              <div className="pb-1 min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground truncate">{community.name}</h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                  <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{community.member_count || 0} membros</span>
                  <span className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />{community.post_count || 0} posts</span>
                  {isPaid && (
                    <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                      <CreditCard className="h-4 w-4" />{formatPrice(price!, billingPeriod)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {community.description && (
              <p className="text-muted-foreground text-base leading-relaxed">{community.description}</p>
            )}

            {/* Benefits */}
            <div className="grid grid-cols-2 gap-2">
              {benefits.map((b, i) => (
                <div key={i} className="flex items-center gap-2.5 p-3 rounded-xl bg-card border border-border">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <b.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{b.text}</span>
                </div>
              ))}
            </div>

            {/* Preview posts */}
            {previewPosts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" /> Posts recentes
                </h3>
                {previewPosts.map((post: any, i: number) => (
                  <Card key={post.id} className={cn("p-4 relative overflow-hidden", i > 0 && "blur-[3px] pointer-events-none select-none opacity-60")}>
                    {i > 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-10">
                        <div className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 text-foreground shadow">
                          <Lock className="h-3.5 w-3.5" /> Entre para ver
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                        {(post.author?.display_name || "U").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-sm text-foreground">{post.author?.display_name || "Membro"}</span>
                        <h4 className="font-medium text-foreground mt-0.5 line-clamp-1">{post.title}</h4>
                        {post.body && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{post.body}</p>}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: Join / Signup Card ── */}
          <div className="md:sticky md:top-20">
            <Card className="p-6 shadow-xl border-border bg-card">
              {inviteCode && (
                <div className="flex items-center gap-2 mb-5 p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium text-primary">Você foi convidado!</span>
                </div>
              )}

              {/* Pricing block for paid communities */}
              {isPaid && !inviteCode && (
                <div className="mb-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-center">
                  <p className="text-3xl font-bold text-foreground">{formatPrice(price!, billingPeriod)}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Cancele quando quiser</p>
                  <div className="mt-3 flex justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-emerald-500" /> Pagamento seguro</span>
                    <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" /> Garantia 7 dias</span>
                  </div>
                </div>
              )}

              {/* Already logged in */}
              {user && !existingMember ? (
                <div className="space-y-4">
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-bold text-foreground">
                      {isPaid && !inviteCode ? "Assinar comunidade" : "Entrar na comunidade"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Logado como <span className="font-medium text-foreground">{user.email}</span>
                    </p>
                  </div>
                  <Button size="lg" className="w-full" onClick={handleExistingUserJoin} disabled={isLoading} id="join-cta-logged">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : isPaid ? <CreditCard className="h-4 w-4 mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                    {ctaLabel}
                  </Button>
                </div>

              ) : !user && step === "cta" ? (
                /* Initial CTA */
                <div className="space-y-4">
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-bold text-foreground">{requireApproval ? "Solicitar acesso" : isPaid ? "Assinar comunidade" : "Junte-se gratuitamente"}</h2>
                    <p className="text-sm text-muted-foreground">{isPaid ? "Crie sua conta e conclua o pagamento" : "Crie sua conta e comece agora"}</p>
                  </div>
                  <Button size="lg" className="w-full gap-2" onClick={() => setStep("form")} id="join-cta-main">
                    {isPaid ? <CreditCard className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                    {ctaLabel}
                  </Button>
                  <Separator />
                  <Button variant="outline" className="w-full" onClick={() => navigate(`/member/login?redirect=/c/${slug}`)}>
                    Já tenho conta — Entrar
                  </Button>
                </div>

              ) : !user && step === "form" ? (
                /* Signup form */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <button type="button" onClick={() => setStep("cta")} className="text-muted-foreground hover:text-foreground transition-colors text-sm">← Voltar</button>
                  </div>
                  <h2 className="text-lg font-bold text-foreground">Criar sua conta</h2>

                  <div className="space-y-1">
                    <Label htmlFor="join-name" className="text-sm">Seu nome</Label>
                    <Input id="join-name" placeholder="Como quer ser chamado?" value={formData.display_name}
                      onChange={(e) => setFormData((p) => ({ ...p, display_name: e.target.value }))} className="h-11" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="join-email" className="text-sm">Email</Label>
                    <Input id="join-email" type="email" placeholder="seu@email.com" value={formData.email}
                      onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} className="h-11" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="join-password" className="text-sm">Senha</Label>
                    <div className="relative">
                      <Input id="join-password" type={showPassword ? "text" : "password"} placeholder="Mínimo 6 caracteres"
                        value={formData.password} onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))} className="h-11 pr-10" />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" size="lg" className="w-full" disabled={isLoading} id="join-submit">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : isPaid ? <CreditCard className="h-4 w-4 mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                    {isPaid ? "Continuar para pagamento" : requireApproval ? "Solicitar acesso" : "Criar conta e entrar"}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Ao criar uma conta, você concorda com nossos{" "}
                    <a href="/terms" className="text-primary hover:underline">Termos de Uso</a>.
                  </p>
                </form>
              ) : null}
            </Card>

            {/* Trust row */}
            <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-emerald-500" />
                {isPaid ? "Pagamento seguro" : "Entrada gratuita"}
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />Cancele quando quiser
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
