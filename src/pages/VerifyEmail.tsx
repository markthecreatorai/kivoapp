import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle, RefreshCw, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { resolveSmartRedirect } from "@/lib/smartRedirect";
import { trackEvent } from "@/lib/tracking";
import { validateAuthEmail } from "@/lib/authEmailGuard";

export default function VerifyEmail() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const redirectAfterVerification = async (userId: string) => {
    const destination = await resolveSmartRedirect(userId);
    navigate(destination, { replace: true });
  };

  useEffect(() => {
    if (user?.email_confirmed_at) {
      void redirectAfterVerification(user.id);
    }
  }, [user, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const { data: { user: freshUser } } = await supabase.auth.getUser();
      if (freshUser?.email_confirmed_at) {
        toast({
          title: "Email verificado!",
          description: "Sua conta foi confirmada com sucesso.",
        });
        await redirectAfterVerification(freshUser.id);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [navigate, toast]);

  const handleResend = async () => {
    if (!user?.email || cooldown > 0) return;
    setResending(true);

    try {
      const emailCheck = validateAuthEmail(user.email);
      if (!emailCheck.ok) {
        toast({ title: "Email inválido", description: emailCheck.error, variant: "destructive" });
        return;
      }
      trackEvent("auth.resend_clicked", { surface: "verify_email" });
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: emailCheck.email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        trackEvent("auth.resend_failed", { surface: "verify_email", error_message: error.message });
        toast({
          title: "Erro ao reenviar",
          description: error.message,
          variant: "destructive",
        });
      } else {
        trackEvent("auth.resend_success", { surface: "verify_email" });
        toast({
          title: "Email reenviado!",
          description: "Verifique sua caixa de entrada e spam.",
        });
        setCooldown(60);
      }
    } catch {
      toast({
        title: "Erro ao reenviar",
        description: "Ocorreu um erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">Kivo</h1>
        </div>

        <Card className="card-radius shadow-sm border">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto p-4 rounded-full bg-primary/10 w-fit">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Verifique seu email</CardTitle>
            <CardDescription>
              Enviamos um link de confirmação para <span className="font-medium text-foreground">{user?.email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                Abra o email e clique no link de confirmação
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                Verifique também a pasta de spam
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                O link expira em 24 horas
              </p>
            </div>

            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
              >
                <RefreshCw className={`w-4 h-4 ${resending ? "animate-spin" : ""}`} />
                {cooldown > 0
                  ? `Reenviar em ${cooldown}s`
                  : resending
                    ? "Reenviando..."
                    : "Reenviar email de verificação"}
              </Button>

              <Button
                variant="ghost"
                className="w-full gap-2 text-muted-foreground"
                onClick={handleLogout}
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para o login
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Se você não recebeu o email, tente reenviar ou entre em contato com o suporte.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
