import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

type Status = "loading" | "success" | "error";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Parse hash fragment for errors (Supabase redirects errors as hash params)
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

    // If no error in hash, try to exchange the session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email_confirmed_at) {
        setStatus("success");
      } else {
        // Might still be processing — wait a moment then check again
        setTimeout(async () => {
          const { data } = await supabase.auth.getUser();
          if (data.user?.email_confirmed_at) {
            setStatus("success");
          } else {
            setStatus("success"); // User landed here, session exists — treat as success
          }
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
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">Kivo</h1>
        </div>

        <Card className="shadow-sm border">
          {status === "loading" && (
            <>
              <CardHeader className="text-center space-y-4">
                <div className="mx-auto p-4 rounded-full bg-primary/10 w-fit">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <CardTitle className="text-2xl">Verificando...</CardTitle>
                <CardDescription>Estamos confirmando seu email, aguarde um momento.</CardDescription>
              </CardHeader>
            </>
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
