import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, ShieldCheck, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { resolveSmartRedirect } from "@/lib/smartRedirect";
import EmailCodeVerificationModal from "@/components/auth/EmailCodeVerificationModal";
import {
  clearPendingVerification,
  getPendingVerification,
  sanitizeReturnTarget,
} from "@/lib/authVerification";

export default function VerifyEmail() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);

  const pending = getPendingVerification();
  const stateEmail = (location.state as { email?: string } | null)?.email;
  const pendingEmail = stateEmail || searchParams.get("email") || pending?.email || user?.email || "";
  const returnTarget =
    sanitizeReturnTarget(searchParams.get("redirect")) || pending?.returnTarget || null;
  const accountType = pending?.accountType || "MEMBER";
  const flowOrigin = pending?.flowOrigin || "circles";

  useEffect(() => {
    if (user?.email_confirmed_at) {
      void resolveSmartRedirect(user.id).then((dest) =>
        navigate(returnTarget || dest, { replace: true })
      );
    }
  }, [user, navigate, returnTarget]);

  const handleVerified = (result: { next: string | null }) => {
    clearPendingVerification();
    toast({ title: "E-mail confirmado!", description: "Faça login para continuar." });
    const dest = result.next || returnTarget || "/login";
    window.location.href = `/login?email=${encodeURIComponent(pendingEmail)}&redirect=${encodeURIComponent(dest)}`;
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
            <CardTitle className="text-2xl">Confirme seu e-mail</CardTitle>
            <CardDescription>
              Enviamos um código de 4 dígitos para{" "}
              <span className="font-medium text-foreground">{pendingEmail || "seu e-mail"}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                O código tem 4 dígitos e expira em 10 minutos
              </p>
              <p className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                Verifique também a pasta de spam
              </p>
              <p className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                Nunca compartilhe o código com ninguém
              </p>
            </div>

            <div className="space-y-3">
              <Button
                className="w-full gap-2"
                onClick={() => setShowModal(true)}
                disabled={!pendingEmail}
              >
                <ShieldCheck className="w-4 h-4" />
                Digitar código de verificação
              </Button>

              {user ? (
                <Button
                  variant="ghost"
                  className="w-full gap-2 text-muted-foreground"
                  onClick={async () => {
                    await signOut();
                    navigate("/login");
                  }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar para o login
                </Button>
              ) : (
                <Button asChild variant="ghost" className="w-full gap-2 text-muted-foreground">
                  <Link to="/login">
                    <ArrowLeft className="w-4 h-4" />
                    Voltar para o login
                  </Link>
                </Button>
              )}
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Não recebeu o código? Abra a digitação acima para reenviar.
            </p>
          </CardContent>
        </Card>
      </div>

      <EmailCodeVerificationModal
        open={showModal && !!pendingEmail}
        email={pendingEmail}
        accountType={accountType}
        flowOrigin={flowOrigin}
        returnTarget={returnTarget}
        initialCooldown={0}
        onVerified={handleVerified}
        onUseAnotherEmail={() => {
          clearPendingVerification();
          setShowModal(false);
        }}
      />
    </div>
  );
}
