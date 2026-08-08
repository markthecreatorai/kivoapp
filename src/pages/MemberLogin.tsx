import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, Lock, Sparkles, UserPlus } from "lucide-react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { AuthEmailFieldError } from "@/components/auth/AuthEmailFieldError";
import { useAuthEmailGuard } from "@/hooks/useAuthEmailGuard";
import { resolveAuthSignupOutcome } from "@/lib/authSignupOutcome";

/** Só aceita destinos internos, evitando open redirect. */
function sanitizeRedirect(value: string | null): string {
  if (!value) return "/member";
  if (!value.startsWith("/") || value.startsWith("//")) return "/member";
  return value;
}

export default function MemberLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = sanitizeRedirect(searchParams.get("redirect"));

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [signupPending, setSignupPending] = useState(false);
  const [existingAccount, setExistingAccount] = useState<null | "confirmed" | "unconfirmed">(null);
  const { emailError, suggestion, guard, reset } = useAuthEmailGuard("member_login");

  const clearFieldState = (value: string) => {
    setEmail(value);
    reset();
    setError("");
    setExistingAccount(null);
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
    const { error: authError } = await supabase.auth.signInWithPassword({ email: emailCheck.email, password });
    if (authError) {
      setError(authError.message === "Invalid login credentials"
        ? "Email ou senha incorretos. Ainda não tem conta? Use a aba \"Criar conta\"."
        : authError.message);
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
    setExistingAccount(null);

    try {
      const response = await supabase.auth.signUp({
        email: emailCheck.email,
        password,
        options: {
          data: {
            display_name: displayName,
            full_name: displayName,
            is_creator: false,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
        },
      });

      const outcome = resolveAuthSignupOutcome(response as any);

      switch (outcome.kind) {
        case "already_registered_confirmed":
          setExistingAccount("confirmed");
          setError("Este email já está cadastrado. Faça login na aba \"Email & Senha\".");
          return;
        case "already_registered_unconfirmed":
          setExistingAccount("unconfirmed");
          setError("Este email já está cadastrado, mas ainda não foi confirmado. Verifique sua caixa de entrada.");
          return;
        case "invalid_email":
        case "generic_error":
          setError(outcome.message);
          return;
        case "success_active":
          navigate(redirectTo, { replace: true });
          return;
        case "success_pending_verification":
          setSignupPending(true);
          return;
      }
    } catch {
      setError("Ocorreu um erro inesperado ao criar sua conta");
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailCheck = guard(email);
    if (!emailCheck.ok) { setError(emailCheck.error || "Digite seu email"); return; }
    setEmail(emailCheck.email);
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: emailCheck.email,
      options: {
        emailRedirectTo: `${window.location.origin}${redirectTo}`,
      },
    });
    if (authError) {
      setError(authError.message);
    } else {
      setMagicLinkSent(true);
    }
    setLoading(false);
  };

  if (signupPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Confirme seu email</h1>
          <p className="text-sm text-muted-foreground">
            Enviamos um link de confirmação para <strong>{email}</strong>. Depois de confirmar,
            você volta direto para onde estava.
          </p>
          <Button variant="ghost" onClick={() => setSignupPending(false)} className="text-sm">
            Usar outro email
          </Button>
        </div>
      </div>
    );
  }

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Link enviado!</h1>
          <p className="text-sm text-muted-foreground">
            Enviamos um link de acesso para <strong>{email}</strong>. Verifique sua caixa de entrada.
          </p>
          <Button variant="ghost" onClick={() => setMagicLinkSent(false)} className="text-sm">
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

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
          <Tabs defaultValue="magic" className="w-full">
            <TabsList className="w-full grid grid-cols-3 mb-4">
              <TabsTrigger value="magic" className="text-xs">Magic Link</TabsTrigger>
              <TabsTrigger value="password" className="text-xs">Email &amp; Senha</TabsTrigger>
              <TabsTrigger value="signup" className="text-xs">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="magic">
              <form onSubmit={handleMagicLink} className="space-y-4">
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
                <Button type="submit" disabled={loading} className="w-full h-12 font-semibold">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><Mail className="w-4 h-4" /> Enviar link de acesso</>
                  )}
                </Button>
              </form>
            </TabsContent>

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
                {existingAccount === "confirmed" && (
                  <p className="text-xs text-center text-muted-foreground">
                    Já tem conta?{" "}
                    <Link to={`/forgot-password?email=${encodeURIComponent(email)}`} className="text-primary hover:underline">
                      Redefinir senha
                    </Link>
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Quer vender produtos digitais?{" "}
                  <a href="/signup" className="text-primary hover:underline">Criar conta de criador</a>
                </p>
              </form>
            </TabsContent>
          </Tabs>
          {error && <p className="text-sm text-destructive text-center mt-3">{error}</p>}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Feito com 💜 na{" "}
          <a href="https://kivohub.com.br" className="text-primary hover:underline">Kivo</a>
        </p>
      </div>
    </div>
  );
}
