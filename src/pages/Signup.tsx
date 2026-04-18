import { useState, useEffect, useMemo } from "react";
import kivoLogo from "@/assets/kivo-logo.svg";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resolveAuthSignupOutcome, SIGNUP_OUTCOME_TELEMETRY } from "@/lib/authSignupOutcome";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/tracking";
import { Progress } from "@/components/ui/progress";
import { getReferralCode, clearReferralCode } from "@/hooks/useReferralTracking";

/** After signup, create referral attribution linking referred user to referrer */
async function createReferralAttribution(referralCode: string, referredUserId: string) {
  try {
    // Look up the referrer by code
    const { data: profile } = await supabase
      .from("referral_profiles")
      .select("user_id")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (!profile?.user_id) {
      console.warn("[Referral] No profile found for code:", referralCode);
      return;
    }

    // Don't self-refer
    if (profile.user_id === referredUserId) return;

    // Create attribution
    await supabase.from("referral_attributions").insert({
      referrer_user_id: profile.user_id,
      referred_user_id: referredUserId,
      referral_code: referralCode,
      source: "signup",
      signed_up_at: new Date().toISOString(),
      referral_status: "pending_subscription",
      referral_source: "affiliate_link",
    } as any);

    // Audit log
    await supabase.from("referral_audit_log" as any).insert({
      referrer_user_id: profile.user_id,
      referred_user_id: referredUserId,
      event_type: "account_created_from_referral",
      metadata: { referral_code: referralCode },
    } as any);

    clearReferralCode();
    console.log("[Referral] Attribution created for code:", referralCode);
  } catch (err) {
    console.error("[Referral] Attribution error (non-fatal):", err);
  }
}

export default function Signup() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [creatorType, setCreatorType] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [zxcvbnFn, setZxcvbnFn] = useState<null | ((password: string) => any)>(null);
  const [existingAccount, setExistingAccount] = useState<null | {
    kind: "confirmed" | "unconfirmed";
    email: string;
  }>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleResendVerification = async () => {
    if (!existingAccount || resendCooldown > 0) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: existingAccount.email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        toast({ title: "Erro ao reenviar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Email reenviado!", description: "Verifique sua caixa de entrada e spam." });
        setResendCooldown(60);
      }
    } finally {
      setResending(false);
    }
  };

  // Handle OAuth error callback
  useEffect(() => {
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    if (error) {
      toast({
        title: "Erro na autenticação com Google",
        description: errorDescription || "Não foi possível criar conta com Google. Tente novamente.",
        variant: "destructive",
      });
    }
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    import("zxcvbn")
      .then((mod) => {
        if (mounted) setZxcvbnFn(() => mod.default);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  // Password strength analysis
  const passwordStrength = useMemo(() => {
    if (!password || !zxcvbnFn) return null;
    return zxcvbnFn(password);
  }, [password, zxcvbnFn]);
  const strengthLabels = ["Muito fraca", "Fraca", "Regular", "Boa", "Muito forte"];

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!acceptedTerms) {
      toast({
        title: "Termos de uso",
        description: "Você precisa aceitar os termos de uso e política de privacidade",
        variant: "destructive",
      });
      return;
    }

    if (passwordStrength && passwordStrength.score < 2) {
      toast({
        title: "Senha muito fraca",
        description: "Por favor, escolha uma senha mais forte",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setExistingAccount(null);
    trackEvent("signup_started", { creator_type: creatorType });

    const referralCode = getReferralCode();

    try {
      const utmData = JSON.parse(sessionStorage.getItem("kivo_utm") || "{}");
      const response = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            is_creator: true,
            creator_type: creatorType,
            utm_source: utmData.utm_source || searchParams.get("utm_source") || "",
            utm_medium: utmData.utm_medium || searchParams.get("utm_medium") || "",
            utm_campaign: utmData.utm_campaign || searchParams.get("utm_campaign") || "",
            ...(referralCode ? { referral_code: referralCode } : {}),
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      const outcome = resolveAuthSignupOutcome(response as any);
      try { trackEvent(SIGNUP_OUTCOME_TELEMETRY[outcome.kind], { creator_type: creatorType }); } catch {}

      switch (outcome.kind) {
        case "already_registered_confirmed":
          setExistingAccount({ kind: "confirmed", email });
          // NÃO redireciona para verify-email
          return;
        case "already_registered_unconfirmed":
          setExistingAccount({ kind: "unconfirmed", email });
          return;
        case "invalid_email":
          toast({ title: "Email inválido", description: outcome.message, variant: "destructive" });
          return;
        case "generic_error":
          toast({ title: "Erro no cadastro", description: outcome.message, variant: "destructive" });
          return;
        case "success_active":
        case "success_pending_verification": {
          trackEvent("signup_completed", { creator_type: creatorType });
          if (referralCode && outcome.userId) {
            createReferralAttribution(referralCode, outcome.userId);
          }
          toast({
            title: "Conta criada!",
            description: outcome.kind === "success_pending_verification"
              ? "Verifique seu email para confirmar a conta e continue"
              : "Vamos começar!",
          });
          navigate("/onboarding");
          return;
        }
      }
    } catch (error) {
      toast({
        title: "Erro no cadastro",
        description: "Ocorreu um erro inesperado",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    // Persist referral code before OAuth redirect
    const referralCode = getReferralCode();
    if (referralCode) {
      sessionStorage.setItem("kivo_pending_referral", referralCode);
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/onboarding`,
        },
      });

      if (error) {
        toast({
          title: "Erro no cadastro com Google",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro no cadastro com Google",
        description: "Ocorreu um erro inesperado",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        {/* Logo/Brand */}
        <div className="text-center">
          <img src={kivoLogo} alt="Kivo" className="h-12 mx-auto" />
          <p className="text-muted-foreground mt-2">
            Sua plataforma all-in-one para vender produtos digitais
          </p>
        </div>

        <Card className="card-radius shadow-sm border">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Criar sua conta</CardTitle>
            <CardDescription>Comece grátis hoje mesmo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full pill-radius"
              onClick={handleGoogleSignup}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Entrar com Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Ou cadastre-se com email
                </span>
              </div>
            </div>

            {existingAccount && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2" role="alert">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-sm text-foreground space-y-1">
                    <p className="font-medium">
                      {existingAccount.kind === "confirmed"
                        ? "Este email já está cadastrado."
                        : "Este email já está cadastrado mas ainda não foi confirmado."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {existingAccount.kind === "confirmed"
                        ? "Faça login ou redefina sua senha para continuar."
                        : "Reenvie o email de verificação para ativar sua conta."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {existingAccount.kind === "confirmed" ? (
                    <>
                      <Button asChild size="sm" variant="default" className="h-8">
                        <Link to={`/login?email=${encodeURIComponent(existingAccount.email)}`}>Entrar</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="h-8">
                        <Link to="/forgot-password">Esqueci minha senha</Link>
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-8 gap-1.5"
                      onClick={handleResendVerification}
                      disabled={resending || resendCooldown > 0}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
                      {resendCooldown > 0
                        ? `Reenviar em ${resendCooldown}s`
                        : resending
                        ? "Reenviando..."
                        : "Reenviar verificação"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Seu nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-radius"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="creatorType">Tipo de creator</Label>
                <Select value={creatorType} onValueChange={setCreatorType}>
                  <SelectTrigger className="input-radius">
                    <SelectValue placeholder="Selecione seu nicho" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cursos">Cursos online</SelectItem>
                    <SelectItem value="mentorias">Mentorias/Consultorias</SelectItem>
                    <SelectItem value="ebooks">E-books/Templates</SelectItem>
                    <SelectItem value="comunidade">Comunidade paga</SelectItem>
                    <SelectItem value="saas">SaaS/Software</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (existingAccount) setExistingAccount(null); }}
                  className="input-radius"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Crie uma senha forte"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-radius pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Password strength indicator */}
                {password && passwordStrength && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Progress value={(passwordStrength.score + 1) * 20} className="flex-1 h-2" />
                      <span className="text-xs text-muted-foreground">
                        {strengthLabels[passwordStrength.score]}
                      </span>
                    </div>
                    {passwordStrength.feedback.suggestions.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {passwordStrength.feedback.suggestions[0]}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked as boolean)}
                  className="mt-0.5"
                />
                <label htmlFor="terms" className="text-sm text-muted-foreground leading-5">
                  Aceito os{" "}
                  <Link to="/terms" className="text-primary hover:underline">
                    Termos de Uso
                  </Link>{" "}
                  e{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    Política de Privacidade
                  </Link>
                </label>
              </div>

              <Button
                type="submit"
                className="w-full pill-radius"
                disabled={isLoading || !acceptedTerms}
              >
                {isLoading ? "Criando conta..." : "Criar minha conta grátis"}
              </Button>
            </form>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">Já tem uma conta? </span>
              <Link to="/login" className="text-primary hover:underline">
                Fazer login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
