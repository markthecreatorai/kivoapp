import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useJoinCommunity } from "@/hooks/useJoinCommunity";

type AuthView = "signup" | "login" | "forgot-password" | "forgot-success";

interface CommunityAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  community: any;
  initialView?: "signup" | "login";
}

export default function CommunityAuthModal({
  open,
  onOpenChange,
  community,
  initialView = "signup",
}: CommunityAuthModalProps) {
  const navigate = useNavigate();
  const slug = community?.slug;

  const [view, setView] = useState<AuthView>(initialView);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Signup fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { signupAndJoin } = useJoinCommunity(slug || "");

  const resetFields = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
  };

  const switchView = (v: AuthView) => {
    resetFields();
    setView(v);
  };

  // When modal opens, reset to initialView
  const handleOpenChange = (val: boolean) => {
    if (val) {
      setView(initialView);
      resetFields();
    }
    onOpenChange(val);
  };

  // ── SIGNUP ──
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!community) return;
    setIsLoading(true);

    try {
      const displayName = `${firstName} ${lastName}`.trim() || email.split("@")[0];
      await signupAndJoin(
        { display_name: displayName, email, password },
        community
      );
      onOpenChange(false);
    } catch {
      // signupAndJoin already shows toast
    } finally {
      setIsLoading(false);
    }
  };

  // ── LOGIN ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!community) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message === "Invalid login credentials"
          ? "Email ou senha incorretos."
          : error.message);
        return;
      }
      if (!data.user) return;

      // Save nav intent so AuthProvider doesn't redirect to /dashboard
      sessionStorage.setItem(
        "kivo_nav_intent",
        JSON.stringify({ origin: "community", community_slug: slug, timestamp: Date.now() })
      );

      // Check if already a member
      const { data: existingMember } = await supabase
        .from("community_members")
        .select("id, status")
        .eq("community_id", community.id)
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (existingMember?.status === "ACTIVE") {
        onOpenChange(false);
        navigate(`/circles/${slug}/feed`);
        return;
      }

      // Not a member yet — auto-join for free communities
      if (community.access_type === "FREE" || community.access_type === "FREE_WITH_PRODUCT") {
        const { error: joinErr } = await supabase.rpc("join_community" as any, {
          p_community_id: community.id,
          p_user_id: data.user.id,
          p_display_name: data.user.user_metadata?.display_name || data.user.email?.split("@")[0] || "Membro",
          p_role: "MEMBER",
          p_status: community.require_approval ? "PENDING" : "ACTIVE",
        });
        if (joinErr && !joinErr.message?.includes("duplicate") && !joinErr.message?.includes("unique")) {
          console.error("Join error:", joinErr);
        }

        if (community.require_approval) {
          toast.success("Solicitação enviada! Aguarde aprovação.");
        } else {
          toast.success("Bem-vindo à comunidade!");
        }
        onOpenChange(false);
        navigate(`/circles/${slug}/feed`);
        return;
      }

      // Paid — redirect to plans
      onOpenChange(false);
      navigate(`/circles/${slug}/plans`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── FORGOT PASSWORD ──
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setView("forgot-success");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar email.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden">
        {/* Header with community branding */}
        <div className="px-6 pt-6 pb-4 text-center space-y-3">
          {community?.icon_url ? (
            <img src={community.icon_url} alt="" className="h-12 w-12 rounded-xl mx-auto object-cover" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-primary/10 mx-auto flex items-center justify-center text-xl font-bold text-primary">
              {(community?.name || "C").charAt(0)}
            </div>
          )}
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold text-foreground">
              {view === "signup" && `Entrar em ${community?.name || "Comunidade"}`}
              {view === "login" && "Fazer login"}
              {view === "forgot-password" && "Recuperar senha"}
              {view === "forgot-success" && "Email enviado"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {view === "signup" && "Crie sua conta gratuita para participar"}
              {view === "login" && `Acesse ${community?.name || "a comunidade"}`}
              {view === "forgot-password" && "Enviaremos um link para redefinir sua senha"}
              {view === "forgot-success" && "Verifique sua caixa de entrada"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6">
          {/* ── SIGNUP VIEW ── */}
          {view === "signup" && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="auth-first" className="text-xs font-medium">Nome</Label>
                  <Input
                    id="auth-first"
                    placeholder="João"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="auth-last" className="text-xs font-medium">Sobrenome</Label>
                  <Input
                    id="auth-last"
                    placeholder="Silva"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-email" className="text-xs font-medium">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  placeholder="joao@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-pass" className="text-xs font-medium">Senha</Label>
                <div className="relative">
                  <Input
                    id="auth-pass"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full font-bold uppercase tracking-wide" disabled={isLoading}>
                {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Criando conta...</> : "Criar Conta"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Já tem conta?{" "}
                <button type="button" onClick={() => switchView("login")} className="text-primary font-medium hover:underline">
                  Fazer login
                </button>
              </p>
            </form>
          )}

          {/* ── LOGIN VIEW ── */}
          {view === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email" className="text-xs font-medium">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-pass" className="text-xs font-medium">Senha</Label>
                <div className="relative">
                  <Input
                    id="login-pass"
                    type={showPassword ? "text" : "password"}
                    placeholder="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => switchView("forgot-password")}
                    className="text-xs text-primary hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full font-bold uppercase tracking-wide" disabled={isLoading}>
                {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Entrando...</> : "Entrar"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Não tem conta?{" "}
                <button type="button" onClick={() => switchView("signup")} className="text-primary font-medium hover:underline">
                  Criar conta grátis
                </button>
              </p>
            </form>
          )}

          {/* ── FORGOT PASSWORD VIEW ── */}
          {view === "forgot-password" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-xs font-medium">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full font-bold uppercase tracking-wide" disabled={isLoading}>
                {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</> : "Enviar Link"}
              </Button>
              <button
                type="button"
                onClick={() => switchView("login")}
                className="flex items-center justify-center gap-1.5 w-full text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
              </button>
            </form>
          )}

          {/* ── FORGOT SUCCESS VIEW ── */}
          {view === "forgot-success" && (
            <div className="text-center space-y-4 py-2">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Enviamos um link de redefinição para <span className="font-medium text-foreground">{email}</span>
              </p>
              <Button variant="outline" className="w-full" onClick={() => switchView("login")}>
                Voltar ao login
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
