import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import kivoLogo from "@/assets/kivo-logo.svg";
import { clearReferralCode } from "@/hooks/useReferralTracking";

type Status = "loading" | "success" | "error";

/** Process pending referral from OAuth signup */
async function processPendingReferral(userId: string) {
  const referralCode = sessionStorage.getItem("kivo_pending_referral");
  if (!referralCode) return;

  try {
    const { data: profile } = await supabase
      .from("referral_profiles")
      .select("user_id")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (!profile?.user_id || profile.user_id === userId) {
      sessionStorage.removeItem("kivo_pending_referral");
      return;
    }

    const { data: existing } = await supabase
      .from("referral_attributions")
      .select("id")
      .eq("referred_user_id", userId)
      .maybeSingle();

    if (!existing) {
      await supabase.from("referral_attributions").insert({
        referrer_user_id: profile.user_id,
        referred_user_id: userId,
        referral_code: referralCode,
        source: "signup_oauth",
        signed_up_at: new Date().toISOString(),
        referral_status: "pending_subscription",
        referral_source: "affiliate_link",
      } as any);

      await supabase.from("referral_audit_log" as any).insert({
        referrer_user_id: profile.user_id,
        referred_user_id: userId,
        event_type: "account_created_from_referral",
        metadata: { referral_code: referralCode, source: "oauth" },
      } as any);
    }

    sessionStorage.removeItem("kivo_pending_referral");
    clearReferralCode();
  } catch (err) {
    console.error("[Referral] OAuth attribution error (non-fatal):", err);
  }
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    const error = params.get("error");
    const errorDesc = params.get("error_description");

    if (error) {
      setStatus("error");
      setErrorMessage(
        errorDesc?.replace(/\+/g, " ") || "O link de verificação é inválido ou expirou."
      );
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        processPendingReferral(session.user.id);
      }
      if (session?.user?.email_confirmed_at) {
        setStatus("success");
      } else {
        setTimeout(async () => {
          const { data } = await supabase.auth.getUser();
          if (data.user) {
            processPendingReferral(data.user.id);
          }
          setStatus("success");
        }, 1500);
      }
    }).catch(() => {
      setStatus("error");
      setErrorMessage("Não foi possível verificar sua sessão.");
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center flex justify-center">
          <img src={kivoLogo} alt="Kivo" className="h-10" />
        </div>

        <Card className="shadow-sm border">
          {status === "loading" && (
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto p-4 rounded-full bg-primary/10 w-fit">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
              <CardTitle className="text-2xl">Verificando...</CardTitle>
              <CardDescription>Estamos confirmando seu email, aguarde um momento.</CardDescription>
            </CardHeader>
          )}

          {status === "success" && (
            <>
              <CardHeader className="text-center space-y-4">
                <div className="mx-auto p-4 rounded-full bg-green-100 dark:bg-green-900/30 w-fit">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-2xl">Email confirmado!</CardTitle>
                <CardDescription>
                  Sua conta foi verificada com sucesso. Você já pode acessar a plataforma.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" onClick={() => navigate("/dashboard", { replace: true })}>
                  Acessar minha conta
                </Button>
              </CardContent>
            </>
          )}

          {status === "error" && (
            <>
              <CardHeader className="text-center space-y-4">
                <div className="mx-auto p-4 rounded-full bg-red-100 dark:bg-red-900/30 w-fit">
                  <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <CardTitle className="text-2xl">Link inválido ou expirado</CardTitle>
                <CardDescription>{errorMessage}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/verify-email", { replace: true })}
                >
                  Reenviar email de verificação
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => navigate("/login", { replace: true })}
                >
                  Voltar para o login
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
