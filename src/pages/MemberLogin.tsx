import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Lock, Sparkles, UserPlus } from "lucide-react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { AuthEmailFieldError } from "@/components/auth/AuthEmailFieldError";
import { useAuthEmailGuard } from "@/hooks/useAuthEmailGuard";
import EmailCodeVerificationModal from "@/components/auth/EmailCodeVerificationModal";
import {
  clearPendingVerification,
  getPendingVerification,
  requestVerificationCode,
  sanitizeReturnTarget,
  savePendingVerification,
  signInAfterVerification,
} from "@/lib/authVerification";

export default function MemberLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = sanitizeReturnTarget(searchParams.get("redirect")) || "/member";

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(60);
  const [tab, setTab] = useState(searchParams.get("tab") === "signup" ? "signup" : "password");
  const { emailError, suggestion, guard, reset } = useAuthEmailGuard("member_login");

  // Reabre o modal após refresh, quando o contexto pendente ainda é válido.
  useEffect(() => {
    const pending = getPendingVerification();
    if (pending && pending.flowOrigin === "circles") {
      setEmail(pending.email);
      setTab("signup");
      setVerifying(true);
    }
  }, []);

  const clearFieldState = (value: string) => {
    setEmail(value);
    reset();
    setError("");
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailCheck = guard(email);
    if (!emailCheck.ok) {
      setError(emailCheck.error || "Email inválido");
      return;
    }
    setEmail(emailCheck.email);
    setLoading(true);
    setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: emailCheck.email,
      password,
    });
    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? 'Email ou senha incorretos. Ainda não tem conta? Use a aba "Criar conta".'
          : authError.message,
      );
    } else if (!data.user?.email_confirmed_at) {
      setError("Sua conta ainda não foi confirmada. Crie a conta novamente para receber um novo código.");
      await supabase.auth.signOut();
    } else {
      navigate(redirectTo, { replace: true });
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailCheck = guard(email);
    if (!emailCheck.ok) {
      setError(emailCheck.error || "Email inválido");
      return;
    }
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres");
      return;
    }
    setEmail(emailCheck.email);
    setLoading(true);
    setError("");

    const result = await requestVerificationCode({
      email: emailCheck.email,
      password,
      fullName: displayName,
      accountType: "MEMBER",
      flowOrigin: "circles",
      returnTarget: redirectTo,
      mode: "signup",
    });
    setLoading(false);

    switch (result.kind) {
      case "code_sent":
      case "cooldown":
        savePendingVerification({
          email: emailCheck.email,
          accountType: "MEMBER",
          flowOrigin: "circles",
          returnTarget: redirectTo,
        });
        setCodeCooldown(result.kind === "code_sent" ? result.cooldownSeconds : result.retryAfterSeconds);
        setVerifying(true);
        return;
      case "rate_limited":
        setError("Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.");
        return;
      case "invalid_email":
        setError("Confira o endereço de e-mail digitado.");
        return;
      case "weak_password":
        setError("A senha precisa ter pelo menos 8 caracteres.");
        return;
      default:
        setError(result.message);
    }
  };

  const handleVerified = async (result: { next: string | null }) => {
    const { data, error: signInError } = await signInAfterVerification(email, password);
    clearPendingVerification();
    const dest = result.next || redirectTo;
    if (signInError || !data?.user) {
      window.location.href = `/member/login?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(dest)}`;
      return;
    }
    window.location.href = dest;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Área de Membros</h1>
          <p className="text-sm text-muted-foreground">Acesse ou crie sua conta de membro</p>
        </div>

        <div className="bg-card rounded-xl border p-6">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="w-full grid grid-cols-2 mb-4">
              <TabsTrigger value="password" className="text-xs">Entrar</TabsTrigger>
              <TabsTrigger value="signup" className="text-xs">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="password">
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-sm">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => clearFieldState(e.target.value)}
                    placeholder="seu@email.com"
                    className="h-12"
                  />
                  <AuthEmailFieldError error={emailError} suggestion={suggestion} onAcceptSuggestion={(corrected) => clearFieldState(corrected)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Senha</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full h-12 font-semibold">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><Lock className="w-4 h-4" /> Entrar</>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="text-primary hover:underline">
                    Esqueci minha senha
                  </Link>
                </p>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-sm">Nome</Label>
                  <Input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Como quer ser chamado"
                    className="h-12"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => clearFieldState(e.target.value)}
                    placeholder="seu@email.com"
                    className="h-12"
                  />
                  <AuthEmailFieldError error={emailError} suggestion={suggestion} onAcceptSuggestion={(corrected) => clearFieldState(corrected)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Senha</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="h-12"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full h-12 font-semibold">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><UserPlus className="w-4 h-4" /> Criar conta de membro</>
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Enviamos um código de 4 dígitos por e-mail para confirmar sua conta.
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  Quer vender produtos digitais?{" "}
                  <a href="/signup" className="text-primary hover:underline">Criar conta de criador</a>
                </p>
              </form>
            </TabsContent>
          </Tabs>
          {error && <p className="text-sm text-destructive text-center mt-3" role="alert">{error}</p>}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Feito com 💜 na{" "}
          <a href="https://kivohub.com.br" className="text-primary hover:underline">Kivo</a>
        </p>
      </div>

      <EmailCodeVerificationModal
        open={verifying}
        email={email}
        accountType="MEMBER"
        flowOrigin="circles"
        returnTarget={redirectTo}
        initialCooldown={codeCooldown}
        onVerified={handleVerified}
        onUseAnotherEmail={() => {
          clearPendingVerification();
          setVerifying(false);
        }}
      />
    </div>
  );
}
